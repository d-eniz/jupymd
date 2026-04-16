import JupyMDPlugin from "../main";
import {App, Notice, TFile} from "obsidian";
import {getAbsolutePath, isNotebookPaired, runJupytext} from "../utils/helpers";
import {CodeBlock, CodeExecutionMode, OUTPUTS_UPDATED_EVENT} from "./types";
import * as fs from "fs/promises";
import * as path from "path";
import {spawn, ChildProcess} from "child_process";

export class CodeExecutor {
	private currentNotePath: string | null = null;
	private pythonPath: string;
	private pythonProcess: ChildProcess | null = null;
	private isProcessReady = false;
	private executionQueue: Array<{
		code: string;
		resolve: (result: any) => void;
		reject: (error: any) => void;
	}> = [];

	constructor(private plugin: JupyMDPlugin, pythonPath: string, private app: App) {
		this.pythonPath = pythonPath
	}

	async setPythonInterpreter(pythonPath: string): Promise<void> {
		this.pythonPath = pythonPath;
		await this.restartKernel({silent: true});
	}

	private notifyOutputsUpdated(notePath: string) {
		if (typeof document === "undefined") {
			return;
		}

		document.dispatchEvent(new CustomEvent(OUTPUTS_UPDATED_EVENT, {
			detail: {path: notePath},
		}));
	}

	private async getActivePairedNotebookContext(): Promise<{
		activeFile: TFile;
		notePath: string;
		ipynbPath: string;
	} | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note to run.");
			return null;
		}

		if (activeFile.extension !== "md") {
			new Notice("Active file is not a markdown note.");
			return null;
		}

		if (!await isNotebookPaired(this.app, activeFile)) {
			new Notice("Active note is not paired with a notebook.");
			return null;
		}

		const notePath = getAbsolutePath(activeFile);

		return {
			activeFile,
			notePath,
			ipynbPath: notePath.replace(/\.md$/, ".ipynb"),
		};
	}

	private async getActiveNotebookContextForRun(): Promise<{
		activeFile: TFile;
		notePath: string;
		ipynbPath: string;
	} | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note to run.");
			return null;
		}

		if (activeFile.extension !== "md") {
			new Notice("Active file is not a markdown note.");
			return null;
		}

		let paired = await isNotebookPaired(this.app, activeFile);
		if (!paired) {
			if (!this.plugin.settings.autoConvertToNotebookOnRun) {
				new Notice("Active note is not paired with a notebook.");
				return null;
			}

			const created = await this.plugin.fileSync.createNotebook(false);
			if (!created) {
				return null;
			}

			paired = await isNotebookPaired(this.app, activeFile);
			if (!paired) {
				new Notice("Failed to pair note with a notebook before running.");
				return null;
			}
		}

		const notePath = getAbsolutePath(activeFile);

		return {
			activeFile,
			notePath,
			ipynbPath: notePath.replace(/\.md$/, ".ipynb"),
		};
	}

	private async prepareExecutionContext(): Promise<{ notePath: string; ipynbPath: string } | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return null;

		const notePath = getAbsolutePath(activeFile);
		if (
			this.currentNotePath &&
			this.currentNotePath !== notePath
		) {
			await this.restartKernel()
			await sleep(500)
		}

		this.currentNotePath = notePath;

		return {
			notePath,
			ipynbPath: notePath.replace(/\.md$/, ".ipynb"),
		};
	}

	private async getNotebookCodeBlocks(ipynbPath: string): Promise<CodeBlock[]> {
		const raw = await fs.readFile(ipynbPath, "utf-8");
		const notebook = JSON.parse(raw);

		return notebook.cells
			.filter((cell: { cell_type: string }) => cell.cell_type === "code")
			.map((cell: { source: string[] | string }, cellIndex: number) => ({
				code: Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "",
				cellIndex,
			}));
	}

	private getCodeBlocksForMode(codeBlocks: CodeBlock[], cellIndex: number, mode: CodeExecutionMode): CodeBlock[] {
		if (mode === "above") {
			return codeBlocks.slice(0, cellIndex);
		}

		if (mode === "cell-and-below") {
			return codeBlocks.slice(cellIndex);
		}

		return codeBlocks.filter((codeBlock) => codeBlock.cellIndex === cellIndex);
	}

	private applyExecutionResultToCell(cell: any, result: {
		stdout: string;
		stderr: string;
		imageData?: string;
	}) {
		const {stdout, stderr, imageData} = result;
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
	}

	private getExecutionEnv(): NodeJS.ProcessEnv {
		const env = {...process.env};
		const pythonPath = this.plugin.settings.pythonInterpreter;

		if (pythonPath) {
			const pythonDir = path.dirname(pythonPath);
			env.PATH = `${pythonDir}${path.delimiter}${env.PATH || ""}`;

			if (pythonDir.endsWith("bin") || pythonDir.endsWith("Scripts")) {
				env.VIRTUAL_ENV = path.dirname(pythonDir);
			}
		}

		return env;
	}

	async executeCodeBlock(codeBlock: CodeBlock, mode: CodeExecutionMode = "cell") {
		const notebookContext = await this.getActiveNotebookContextForRun();
		if (!notebookContext) return;

		const executionContext = await this.prepareExecutionContext();
		if (!executionContext) return;

		const {notePath, ipynbPath} = executionContext;
		let codeBlocksToRun = [codeBlock];

		if (mode !== "cell") {
			const notebookCodeBlocks = await this.getNotebookCodeBlocks(ipynbPath);
			codeBlocksToRun = this.getCodeBlocksForMode(notebookCodeBlocks, codeBlock.cellIndex, mode);
		}

		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks: codeBlocksToRun,
			ipynbPath,
		});
		this.notifyOutputsUpdated(notePath);
	}

	async executeAllCodeBlocksInCurrentFile() {
		const notebookContext = await this.getActiveNotebookContextForRun();
		if (!notebookContext) return;

		const executionContext = await this.prepareExecutionContext();
		if (!executionContext) return;

		const codeBlocks = await this.getNotebookCodeBlocks(notebookContext.ipynbPath);
		if (codeBlocks.length === 0) {
			new Notice("No code blocks found in the current notebook.");
			return;
		}

		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks,
			ipynbPath: notebookContext.ipynbPath,
		});
		this.notifyOutputsUpdated(notebookContext.notePath);
		new Notice(`Ran ${codeBlocks.length} code block${codeBlocks.length === 1 ? "" : "s"}.`);
	}

	async clearAllOutputsInCurrentFile() {
		const notebookContext = await this.getActivePairedNotebookContext();
		if (!notebookContext) return;

		try {
			const raw = await fs.readFile(notebookContext.ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const codeCells = notebook.cells.filter((cell: { cell_type: string }) => cell.cell_type === "code");

			for (const cell of codeCells) {
				cell.outputs = [];
			}

			await fs.writeFile(notebookContext.ipynbPath, JSON.stringify(notebook, null, 2));
			this.notifyOutputsUpdated(notebookContext.notePath);
			new Notice(`Cleared outputs for ${codeCells.length} code block${codeCells.length === 1 ? "" : "s"}.`);
		} catch (err) {
			new Notice("Error clearing notebook outputs, check console for details");
			console.error("Error clearing notebook outputs:", err);
		}
	}

	async runCodeAndUpdateNotebook({codeBlock, ipynbPath}: {
		codeBlock: CodeBlock;
		ipynbPath: string;
	}) {
		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks: [codeBlock],
			ipynbPath,
		});
	}

	async runCodeBlocksAndUpdateNotebook({codeBlocks, ipynbPath}: {
		codeBlocks: CodeBlock[];
		ipynbPath: string;
	}) {
		if (codeBlocks.length === 0) {
			return;
		}

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const notebookCodeCells = notebook.cells.filter((cell: {
				cell_type: string
			}) => cell.cell_type === "code");

			for (const codeBlock of codeBlocks) {
				const cell = notebookCodeCells[codeBlock.cellIndex];
				if (!cell) {
					console.warn(`Cell with index ${codeBlock.cellIndex} not found.`);
					continue;
				}

				const result = await this.sendCodeToPython(codeBlock.code);
				this.applyExecutionResultToCell(cell, result);
				await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			}

			await runJupytext(this.pythonPath, ["--sync", ipynbPath]);

		} catch (err) {
			new Notice("Error updating notebook, check console for details")
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
        except SystemExit as e:
            _stderr.write(f"SystemExit: {e.code}\\n")
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
            except SystemExit as e:
                _stderr.write(f"SystemExit: {e.code}\\n")
            
    except Exception as e:
        _stderr.write("".join(traceback.format_exception(type(e), e, e.__traceback__)))
    except SystemExit as e:
        pass
    
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
    except SystemExit as e:
        error_result = {
            "stdout": "",
            "stderr": f"SystemExit: {e.code}",
            "imageData": ""
        }
        print("###RESULT###")
        print(json.dumps(error_result))
        print("###END###")
        sys.stdout.flush()
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

			const workingDir = this.currentNotePath
				? path.dirname(this.currentNotePath)
				: process.cwd();


			const pythonProcess = spawn(
				this.plugin.settings.pythonInterpreter,
				["-c", initCode],
				{
					env: this.getExecutionEnv(),
					cwd: workingDir
				}
			);

			this.pythonProcess = pythonProcess;

			let initOutput = "";

			pythonProcess.stdout?.setEncoding("utf-8");
			pythonProcess.stdout?.on("data", (data) => {
				const output = data.toString();
				initOutput += output;

				if (!this.isProcessReady && initOutput.includes("PYTHON_READY")) {
					this.isProcessReady = true;
					initOutput = initOutput.slice(initOutput.indexOf("PYTHON_READY") + "PYTHON_READY".length).trimStart();
					resolve();
					return;
				}

				while (this.executionQueue.length > 0 && initOutput.includes("###END###")) {
					const currentExecution = this.executionQueue.shift();
					if (currentExecution) {
						try {
							const resultMatch = initOutput.match(/###RESULT###\s*(.*?)\s*###END###/s);
							if (resultMatch) {
								const result = JSON.parse(resultMatch[1]);
								currentExecution.resolve(result);
								initOutput = initOutput.slice(resultMatch.index! + resultMatch[0].length);
							} else {
								currentExecution.reject(new Error("Failed to parse execution result"));
								initOutput = "";
							}
						} catch (e) {
							currentExecution.reject(e);
							initOutput = "";
						}
					}
				}
			});

			pythonProcess.stderr?.setEncoding("utf-8");
			pythonProcess.stderr?.on("data", (data) => {
				new Notice("Python process error, check console for details")
				console.error("Python process stderr:", data.toString());
			});

			pythonProcess.on("close", (code) => {
				console.log("Python process closed with code:", code);
				if (this.pythonProcess === pythonProcess) {
					this.pythonProcess = null;
					this.isProcessReady = false;
				}
				while (this.executionQueue.length > 0) {
					const execution = this.executionQueue.shift();
					if (execution) {
						execution.reject(new Error("Python process closed unexpectedly"));
					}
				}
				reject(new Error(`Python process closed with code: ${code}`));
			});

			pythonProcess.on("error", (error) => {
				new Notice("Python process error, check console for details")
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

	async restartKernel(options: {silent?: boolean} = {}): Promise<void> {
		const {silent = false} = options;

		return new Promise((resolve, reject) => {
			if (this.pythonProcess) {
				const processToKill = this.pythonProcess;
				processToKill.stdin?.write("EXIT\n");

				// wait until it actually exits
				processToKill.once('exit', (code, signal) => {
					if (this.pythonProcess === processToKill) {
						this.pythonProcess = null;
						this.isProcessReady = false;
						this.currentNotePath = null;
					}

					while (this.executionQueue.length > 0) {
						const execution = this.executionQueue.shift();
						if (execution) {
							execution.reject(new Error("Kernel restarted"));
						}
					}

					if (!silent) {
						new Notice("Python kernel restarted");
					}
					resolve();
				});

				processToKill.once('error', (err) => {
					reject(err);
				});

				processToKill.kill();
			} else {
				this.isProcessReady = false;
				this.currentNotePath = null;
				if (!silent) {
					new Notice("Python kernel restarted");
				}
				resolve();
			}
		});
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
