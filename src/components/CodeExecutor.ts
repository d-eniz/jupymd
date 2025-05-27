import { ChildProcessWithoutNullStreams } from "child_process";
import { spawn } from "child_process";
import JupyMDPlugin from "../main";
import { KernelManager } from "./KernelManager";
import { App, Editor, Notice } from "obsidian";
import { exec } from "child_process";
import { getAbsolutePath, getCellIndex } from "../utils/helpers";
import * as fs from "fs/promises";
import { NotebookUI } from "./NotebookUI";
import { JupyMDPluginSettings, CodeBlock } from "./types";

export class CodeExecutor {
	private pythonProcess: ChildProcessWithoutNullStreams | null = null;
	private stdoutBuffer = "";
	private stderrBuffer = "";
	private currentNotePath: string | null = null;
	private notebookUI: NotebookUI;
	private settings: JupyMDPluginSettings;
	kernelManager: KernelManager;

	constructor(private plugin: JupyMDPlugin, private app: App) {
		this.notebookUI = new NotebookUI(this.app);
		this.settings = this.plugin.settings;
		this.kernelManager = new KernelManager(this.plugin, this.app);
	}

	async executeCodeBlock(editor: Editor | undefined, codeToRun?: CodeBlock) {
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

		const codeBlock = codeToRun || this.notebookUI.getActiveCodeBlock(editor);
		if (!codeBlock) {
			new Notice("No code block found at cursor position");
			return;
		}

		if (!activeFile) return;

		const ipynbPath = currentPath.replace(/\.md$/, ".ipynb");
		const cellIndex = getCellIndex(editor, codeBlock);

		await this.runCodeAndUpdateNotebook({
			code: codeBlock.code,
			cellIndex,
			ipynbPath,
		});
	}

	async executeAllCodeBlocks() {
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

		const fileContent = await this.app.vault.read(activeFile);
		const lines = fileContent.split("\n");

		let inCodeBlock = false;
		let blockStart = -1;
		const codeBlocks: CodeBlock[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith("```")) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					blockStart = i;
				} else {
					inCodeBlock = false;
					codeBlocks.push({
						code: lines.slice(blockStart + 1, i).join("\n"),
						startPos: blockStart,
						endPos: i
					});
				}
			}
		}

		if (codeBlocks.length === 0) {
			new Notice("No code blocks found.");
			return;
		}

		for (const codeBlock of codeBlocks) {
			await this.executeCodeBlock(this.app.workspace.activeEditor?.editor, codeBlock);
		}

		new Notice("All code blocks executed.");
	}

	async runCodeAndUpdateNotebook({
		code,
		cellIndex,
		ipynbPath,
	}: {
		code: string;
		cellIndex: number;
		ipynbPath: string;
	}) {
		let stdout: string;
		let stderr: string;

		const result = await this.sendCodeToPython(code);
		// eslint-disable-next-line prefer-const
		stdout = result.stdout;
		// eslint-disable-next-line prefer-const
		stderr = result.stderr;

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const cell = notebook.cells.filter(
				(c: { cell_type: string }) => c.cell_type === "code"
			)[cellIndex];

			if (cell) {
				cell.outputs = [];

				if (stdout) {
					const lines = stdout.split(/(?<=\S)(?=\S)/g).map(line => line.trim());

					cell.outputs.push({
						output_type: "stream",
						name: "stdout",
						text: lines,
					});
				}

				if (stderr && stderr.trim()) {
					cell.outputs.push({
						output_type: "stream",
						name: "stderr",
						text: stderr.split("\n"),
					});
				}

				await fs.writeFile(
					ipynbPath,
					JSON.stringify(notebook, null, 2)
				);
				exec(`jupytext --sync "${ipynbPath}"`);
			}
		} catch (err) {
			console.error("Error updating notebook:", err);
		}
	}

	async startPythonProcess() {
		if (
			this.pythonProcess &&
			this.kernelManager.currentKernel === this.settings.defaultKernel
		) {
			return;
		}

		if (this.pythonProcess) {
			await this.stopPythonProcess();
		}

		this.kernelManager.currentKernel = this.settings.defaultKernel;

		await this.kernelManager.getKernelCommand(
			this.kernelManager.currentKernel
		);

		this.pythonProcess = spawn("python", ["-i", "-q"], {
			// ! CRUCIAL, -i -> INTERACTIVE MODE; -q -> QUIET MODE
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.pythonProcess.stdout.setEncoding("utf-8");
		this.pythonProcess.stdout.on("data", (data) => {
			this.stdoutBuffer += data.toString();
		});

		this.pythonProcess.stderr.setEncoding("utf-8");
		this.pythonProcess.stderr.on("data", (data) => {
			this.stderrBuffer += data;
		});
	}

	async stopPythonProcess() {
		if (this.pythonProcess) {
			this.pythonProcess.stdin.write("exit()\n");
			this.pythonProcess.kill();
			this.pythonProcess = null;
			this.currentNotePath = null;
		}
	}

	async sendCodeToPython(
		code: string
	): Promise<{ stdout: string; stderr: string }> {
		if (!this.pythonProcess) await this.startPythonProcess();

		this.stdoutBuffer = "";
		this.stderrBuffer = "";

		const END_MARKER = "###END###";
		if (this.pythonProcess && this.pythonProcess.stdin) {
			this.pythonProcess.stdin.write(
				code + `\nprint("${END_MARKER}", flush=True)\n`
			);
		} else {
			throw new Error(
				"Python process is not running or stdin is unavailable."
			);
		}

		return new Promise((resolve) => {
			const checkFinished = () => {
				if (this.stdoutBuffer.includes(END_MARKER)) {
					const stdout = this.stdoutBuffer
						.split(END_MARKER)[0]
						.trim();

					const stderr = this.stderrBuffer
						.replace(/>>>\s*/g, "") // Remove >>> and any space after it
						.trim();

					resolve({ stdout, stderr });
				} else {
					setTimeout(checkFinished, 50);
				}
			};
			checkFinished();
		});
	}
}
