import { ChildProcessWithoutNullStreams } from "child_process";
import { spawn } from "child_process";
import JupyMDPlugin from "../main";
import { KernelManager } from "./KernelManager";
import { App, Editor, Notice } from "obsidian";
import { exec } from "child_process";
import { getAbsolutePath } from "../utils/helpers";
import * as fs from "fs/promises";
import { NotebookUI } from "./NotebookUI";
import { JupyMDPluginSettings } from "./types";

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

	async executeCodeBlock(editor: Editor) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const currentPath = await getAbsolutePath(activeFile);
		if (
			this.currentNotePath &&
			this.currentNotePath !== (await currentPath)
		) {
			new Notice(
				"Please restart the kernel before executing code in another note.\nUse the 'Restart Python kernel' command."
			);
			return;
		}

		this.currentNotePath = await currentPath;

		const codeBlock = this.notebookUI.getActiveCodeBlock(editor);
		if (!codeBlock) {
			new Notice("No code block found at cursor position");
			return;
		}

		if (!activeFile) return;

		const ipynbPath = currentPath.replace(/\.md$/, ".ipynb");
		const markdownLines = editor.getValue().split("\n");

		let cellIndex = 0;
		let foundBlocks = 0;
		for (let i = 0; i < markdownLines.length; i++) {
			const line = markdownLines[i];
			if (line.trim().startsWith("```")) {
				if (foundBlocks % 2 === 0 && i < codeBlock.startPos) {
					cellIndex++;
				}
				foundBlocks++;
			}
		}

		await this.runCodeAndUpdateNotebook({
			code: codeBlock.code,
			cellIndex,
			ipynbPath,
		});
		new Notice("Notebook output updated.");
	}

	async executeAllCodeBlocks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const currentPath = getAbsolutePath(activeFile);
		if (
			this.currentNotePath &&
			this.currentNotePath !== (await currentPath)
		) {
			new Notice(
				"Please restart the kernel before executing code in another note.\nUse the 'Restart Python kernel' command."
			);
			return;
		}

		this.currentNotePath = await currentPath;

		const fileContent = await this.app.vault.read(activeFile);
		const lines = fileContent.split("\n");
		const ipynbPath = (await getAbsolutePath(activeFile)).replace(
			/\.md$/,
			".ipynb"
		);

		let inCodeBlock = false;
		let blockStart = -1;
		const codeBlocks: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			if (line.startsWith("```")) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					blockStart = i;
				} else {
					inCodeBlock = false;
					codeBlocks.push(lines.slice(blockStart + 1, i).join("\n"));
				}
			}
		}

		if (codeBlocks.length === 0) {
			new Notice("No code blocks found.");
			return;
		}

		for (let i = 0; i < codeBlocks.length; i++) {
			await this.runCodeAndUpdateNotebook({
				code: codeBlocks[i],
				cellIndex: i,
				ipynbPath,
			});
		}
		this.notebookUI.forceRerender();
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
		let stdout = "";
		let stderr = "";

		const result = await this.sendCodeToPython(code);
		stdout = result.stdout;
		stderr = result.stderr;

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const cell = notebook.cells.filter(
				(c: { cell_type: string }) => c.cell_type === "code"
			)[cellIndex];

			if (cell) {
				cell.outputs = [];

				if (stdout)
					cell.outputs.push({
						output_type: "stream",
						name: "stdout",
						text: stdout.split("\n"),
					});

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
				this.notebookUI.forceRerender();
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
			this.stdoutBuffer += data;
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
