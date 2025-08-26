import JupyMDPlugin from "../main";
import {App, Notice} from "obsidian";
import {exec} from "child_process";
import {getAbsolutePath} from "../utils/helpers";
import {CodeBlock} from "./types";
import * as fs from "fs/promises";
import {spawn, ChildProcess} from "child_process";

export class CodeExecutor {
    private currentNotePath: string | null = null;
    private pythonProcess: ChildProcess | null = null;
    private isProcessReady = false;
    private executionQueue: Array<{
        code: string;
        resolve: (result: any) => void;
        reject: (error: any) => void;
    }> = [];

    constructor(private plugin: JupyMDPlugin, private app: App) {
    }

    async executeCodeBlock(codeBlock: CodeBlock) {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return;

        const currentPath = getAbsolutePath(activeFile);
        if (
            this.currentNotePath &&
            this.currentNotePath !== currentPath
        ) {
            new Notice(
                "Please restart the kernel before executing code in another note.\nUse the 'Restart Python kernel' command."
            );
            return;
        }

        this.currentNotePath = currentPath;

        if (!activeFile) return;

        const ipynbPath = currentPath.replace(/\.md$/, ".ipynb");

        await this.runCodeAndUpdateNotebook({
            codeBlock: codeBlock,
            ipynbPath,
        });
    }

    async runCodeAndUpdateNotebook({codeBlock, ipynbPath}: {
        codeBlock: CodeBlock;
        ipynbPath: string;
    }) {
        try {
            const result = await this.sendCodeToPython(codeBlock.code);
            const {stdout, stderr, imageData} = result;

            const raw = await fs.readFile(ipynbPath, "utf-8");
            const notebook = JSON.parse(raw);

            const cell = notebook.cells.filter((cell: {
                cell_type: string
            }) => cell.cell_type === "code")[codeBlock.cellIndex];
            if (!cell) {
                console.warn(`Cell with index ${codeBlock.cellIndex} not found.`);
                return;
            }

            const outputs: any[] = [];

            if (stdout && stdout.trim()) {
                outputs.push({
                    output_type: "stream",
                    name: "stdout",
                    text: stdout.endsWith("\n") ? stdout : stdout + "\n",
                });
            }

            if (stderr && stderr.trim()) {
                outputs.push({
                    output_type: "stream",
                    name: "stderr",
                    text: stderr.endsWith("\n") ? stderr : stderr + "\n",
                });
            }

            if (imageData && imageData.length > 0) {
                outputs.push({
                    output_type: "display_data",
                    data: {
                        "image/png": imageData,
                    },
                    metadata: {},
                });
            }

            cell.outputs = outputs;
            cell.execution_count = (cell.execution_count ?? 0) + 1;

            if (!cell.metadata) cell.metadata = {};
            cell.metadata.jupyter = {is_executing: false};
            await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));

            exec(`jupytext --sync "${ipynbPath}"`);
        } catch (err) {
            console.error("Error updating notebook:", err);
        }
    }

    private async initializePythonProcess(): Promise<void> {
        if (this.pythonProcess && !this.pythonProcess.killed) {
            return;
        }

        return new Promise((resolve, reject) => {
            const initCode = `
import ast
import sys
import io
import base64
import traceback
import json
from contextlib import redirect_stdout, redirect_stderr
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use("Agg")

def execute_code(code_str):
    _stdout = io.StringIO()
    _stderr = io.StringIO()
    _img_buf = io.BytesIO()
    _img_data = ""
    
    _fig_before = plt.get_fignums()
    
    try:
        try:
            parsed = ast.parse(code_str.strip())
			# Check if this is a single expression
            is_single_expression = (
            len(parsed.body) == 1 and  # Only one thing in the code
            isinstance(parsed.body[0], ast.Expr)  # And that thing is an expression
            )

            if is_single_expression:
                # For single expressions, we want to capture and display the result
                compiled_code = compile(code_str, '<string>', 'eval')  # Use 'eval' mode
                
                with redirect_stdout(_stdout), redirect_stderr(_stderr):
                    result = eval(compiled_code)
                    if result is not None:
                        print(result)
            else:
                compiled_code = compile(code_str, '<string>', 'exec')
        except SyntaxError as e:
            _stderr.write(f"SyntaxError: {e.msg}\\n")
            if e.text:
                _stderr.write(f"Line {e.lineno}: {e.text}")
            raise e
        except Exception as e:
            _stderr.write(f"Compilation error: {str(e)}\\n")
            raise e

        if not is_single_expression:
            try:
                with redirect_stdout(_stdout), redirect_stderr(_stderr):
                    exec(compiled_code, globals(), globals())
                    
                _fig_after = plt.get_fignums()
                if len(_fig_after) > len(_fig_before):
                    fig = plt.gcf()
                    fig.tight_layout(pad=0)
                    plt.savefig(_img_buf, format="png", bbox_inches='tight', pad_inches=0, dpi=100)
                    _img_buf.seek(0)
                    _img_data = base64.b64encode(_img_buf.read()).decode("utf-8")
                    plt.close('all')
                    
            except Exception as e:
                _stderr.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))
            
    except Exception as e:
        _stderr.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))
    
    result = {
        "stdout": _stdout.getvalue(),
        "stderr": _stderr.getvalue(),
        "imageData": _img_data
    }
    
    print("###RESULT###")
    print(json.dumps(result))
    print("###END###")
    sys.stdout.flush()

print("PYTHON_READY")
sys.stdout.flush()

while True:
    try:
        line = input()
        if line == "EXIT":
            break
        elif line.startswith("EXEC:"):
            code_to_exec = line[5:]
            if code_to_exec == "MULTILINE":
                code_lines = []
                while True:
                    code_line = input()
                    if code_line == "END_CODE":
                        break
                    code_lines.append(code_line)
                code_to_exec = "\\n".join(code_lines)
            
            execute_code(code_to_exec)
    except EOFError:
        break
    except Exception as e:
        error_result = {
            "stdout": "",
            "stderr": f"Python process error: {str(e)}",
            "imageData": ""
        }
        print("###RESULT###")
        print(json.dumps(error_result))
        print("###END###")
        sys.stdout.flush()
`;

            this.pythonProcess = spawn(
                this.plugin.settings.pythonInterpreter,
                ["-c", initCode],
                { env: { ...process.env } }
            );

            let initOutput = "";

            this.pythonProcess.stdout?.setEncoding("utf-8");
            this.pythonProcess.stdout?.on("data", (data) => {
                const output = data.toString();
                initOutput += output;

                if (!this.isProcessReady && output.includes("PYTHON_READY")) {
                    this.isProcessReady = true;
                    resolve();
                    return;
                }

                if (this.executionQueue.length > 0 && output.includes("###END###")) {
                    const currentExecution = this.executionQueue.shift();
                    if (currentExecution) {
                        try {
                            const resultMatch = initOutput.match(/###RESULT###\s*(.*?)\s*###END###/s);
                            if (resultMatch) {
                                const result = JSON.parse(resultMatch[1]);
                                currentExecution.resolve(result);
                            } else {
                                currentExecution.reject(new Error("Failed to parse execution result"));
                            }
                        } catch (e) {
                            currentExecution.reject(e);
                        }
                    }
                    initOutput = "";
                }
            });

            this.pythonProcess.stderr?.setEncoding("utf-8");
            this.pythonProcess.stderr?.on("data", (data) => {
                console.error("Python process stderr:", data.toString());
            });

            this.pythonProcess.on("close", (code) => {
                console.log("Python process closed with code:", code);
                this.pythonProcess = null;
                this.isProcessReady = false;
                while (this.executionQueue.length > 0) {
                    const execution = this.executionQueue.shift();
                    if (execution) {
                        execution.reject(new Error("Python process closed unexpectedly"));
                    }
                }
            });

            this.pythonProcess.on("error", (error) => {
                console.error("Python process error:", error);
                reject(error);
            });

            setTimeout(() => {
                if (!this.isProcessReady) {
                    reject(new Error("Python process initialization timeout"));
                }
            }, 10000);
        });
    }

    async sendCodeToPython(code: string): Promise<{
        stdout: string;
        stderr: string;
        imageData?: string;
    }> {
        await this.initializePythonProcess();

        return new Promise((resolve, reject) => {
            this.executionQueue.push({code, resolve, reject});

            if (!this.pythonProcess || !this.pythonProcess.stdin) {
                reject(new Error("Python process not available"));
                return;
            }

            if (code.includes('\n')) {
                this.pythonProcess.stdin.write("EXEC:MULTILINE\n");
                const lines = code.split('\n');
                for (const line of lines) {
                    this.pythonProcess.stdin.write(line + "\n");
                }
                this.pythonProcess.stdin.write("END_CODE\n");
            } else {
                this.pythonProcess.stdin.write(`EXEC:${code}\n`);
            }
        });
    }

    async restartKernel(): Promise<void> {
        if (this.pythonProcess) {
            this.pythonProcess.stdin?.write("EXIT\n");
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.isProcessReady = false;
        this.currentNotePath = null;

        while (this.executionQueue.length > 0) {
            const execution = this.executionQueue.shift();
            if (execution) {
                execution.reject(new Error("Kernel restarted"));
            }
        }

        new Notice("Python kernel restarted");
    }

    cleanup(): void {
        if (this.pythonProcess) {
            this.pythonProcess.stdin?.write("EXIT\n");
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }
        this.isProcessReady = false;
    }
}
