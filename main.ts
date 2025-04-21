import {
	Plugin,
	TFile,
	Notice,
	TAbstractFile,
	FileSystemAdapter,
	PluginSettingTab,
	App,
	Setting,
	Modal,
} from "obsidian";
import { exec } from "child_process";
import * as path from "path";
import { promises as fs } from "fs";
import * as os from "os";
import { Editor, MarkdownView } from "obsidian";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";

interface JupytextPluginSettings {
	defaultKernel: string;
	availableKernels: string[];
	usePersistentPython: boolean;
}

const DEFAULT_SETTINGS: JupytextPluginSettings = {
	defaultKernel: "python3",
	availableKernels: ["python3"],
	usePersistentPython: true,
};

class JupytextSettingTab extends PluginSettingTab {
	plugin: JupytextPlugin;

	constructor(app: App, plugin: JupytextPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "JupyMD Settings" });

		new Setting(containerEl)
			.setName("Use persistent Python process")
			.setDesc(
				"Maintain a running Python process between executions for better performance"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.usePersistentPython)
					.onChange(async (value) => {
						this.plugin.settings.usePersistentPython = value;
						await this.plugin.saveSettings();
						if (!value) {
							await this.plugin.stopPythonProcess();
						}
					});
			});

		new Setting(containerEl)
			.setName("Default Python kernel")
			.setDesc("Select the default Python kernel for execution")
			.addDropdown((dropdown) => {
				this.plugin.settings.availableKernels.forEach((kernel) => {
					dropdown.addOption(kernel, kernel);
				});
				dropdown.setValue(this.plugin.settings.defaultKernel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultKernel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Detect kernels")
			.setDesc("Refresh list of available kernels")
			.addButton((button) => {
				button.setButtonText("Detect").onClick(async () => {
					await this.plugin.detectAvailableKernels();
					this.display(); // Refresh the settings tab
				});
			});
	}
}

export default class JupytextPlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		this.addSettingTab(new JupytextSettingTab(this.app, this));

		// Command to create a Jupyter Notebook from the current note
		this.addCommand({
			id: "create-jupyter-notebook",
			name: "Create Jupyter notebook from note",
			callback: () => this.createNotebook(),
		});

		// Command to open the paired Jupyter Notebook in VS Code
		this.addCommand({
			id: "open-jupyter-notebook-in-vscode",
			name: "Open Jupyter notebook in VS Code",
			callback: () => this.openNotebookInEditor("vscode"),
		});

		// Command to open the paired Jupyter Notebook in Jupyter Lab
		this.addCommand({
			id: "open-jupyter-notebook-in-lab",
			name: "Open Jupyter notebook in Jupyter Lab",
			callback: () => this.openNotebookInEditor("jupyter-lab"),
		});

		// Watch for file changes and sync
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) =>
				this.syncFiles(file)
			)
		);

		// Command to execute current code block
		this.addCommand({
			id: "execute-code-block",
			name: "Execute code block",
			editorCallback: (editor: Editor, view: MarkdownView) =>
				this.executeCodeBlock(editor, view),
		});

		this.addCommand({
			id: "execute-all-code-blocks",
			name: "Execute all code blocks in note",
			callback: () => this.executeAllCodeBlocks(),
		});

		this.addCommand({
			id: "clear-current-cell-output",
			name: "Clear current cell output",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return;

				const codeBlock = this.getActiveCodeBlock(editor);
				if (!codeBlock) {
					new Notice("No code block found at cursor position");
					return;
				}

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

				this.clearCellOutput(cellIndex);
			},
		});

		this.addCommand({
			id: "clear-all-outputs",
			name: "Clear all outputs",
			callback: () => this.clearAllOutputs(),
		});

		this.addCommand({
			id: "select-python-kernel",
			name: "Select Python kernel",
			callback: () => this.selectKernel(),
		});

		this.addCommand({
			id: "restart-python-kernel",
			name: "Restart Python kernel",
			callback: () => this.restartKernel(),
		});
	}

	private currentNotePath: string | null = null;

	settings: JupytextPluginSettings;
	private pythonProcess: ChildProcessWithoutNullStreams | null = null;
	private currentKernel: string | null = null;

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Get the absolute path of a file in the vault
	getAbsolutePath(file: TFile): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			const vaultPath = adapter.getBasePath();
			return path.join(vaultPath, file.path);
		} else {
			throw new Error("Cannot get base path: unsupported adapter type.");
		}
	}

	// Check if the Markdown file is paired with a Jupyter Notebook
	async isNotebookPaired(file: TFile): Promise<boolean> {
		const mdPath = this.getAbsolutePath(file);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		try {
			await fs.access(ipynbPath, fs.constants.F_OK);
			return true;
		} catch (error) {
			return false;
		}
	}

	// Command to create a Jupyter Notebook from the active note
	async createNotebook() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		const mdPath = this.getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		// Check if the notebook is already paired
		if (await this.isNotebookPaired(activeFile)) {
			new Notice("Notebook is already paired with this note.");
			return;
		}

		exec(`jupytext --to notebook "${mdPath}"`, (error) => {
			if (error) {
				new Notice(`Failed to create notebook: ${error.message}`);
				return;
			}

			exec(`jupytext --set-formats ipynb,md "${ipynbPath}"`, (error) => {
				if (error) {
					new Notice(`Failed to pair notebook: ${error.message}`);
					return;
				}

				new Notice(`Notebook created and paired: ${ipynbPath}`);
			});
		});
	}

	// Command to open the paired Jupyter Notebook in editor
	async openNotebookInEditor(editor: "vscode" | "jupyter-lab") {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		// Check if the notebook is paired
		if (!(await this.isNotebookPaired(activeFile))) {
			new Notice("No paired Jupyter Notebook found for this note.");
			return;
		}

		const mdPath = this.getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		let command: string;
		let editorName: string;

		switch (editor) {
			case "vscode":
				command = `code "${ipynbPath}"`;
				editorName = "VS Code";
				break;
			case "jupyter-lab":
				command = `python -m jupyterlab "${ipynbPath}"`;
				editorName = "Jupyter Lab";
				break;
			default:
				throw new Error(`Unsupported editor: ${editor}`);
		}

		// Open the .ipynb file in editor
		exec(command, (error) => {
			if (error) {
				new Notice(
					`Failed to open notebook in ${editorName}: ${error.message}`
				);
				return;
			}
			new Notice(`Opened notebook in ${editorName}: ${ipynbPath}`);
		});
	}

	// Sync files when either the Markdown or Jupyter Notebook is modified
	async syncFiles(file: TAbstractFile) {
		if (!(file instanceof TFile)) {
			return;
		}

		const filePath = this.getAbsolutePath(file);

		if (filePath.endsWith(".md")) {
			const ipynbPath = filePath.replace(/\.md$/, ".ipynb");
			if (await this.isNotebookPaired(file)) {
				exec(`jupytext --sync "${ipynbPath}"`, (error) => {
					if (error) {
						console.error(
							`Failed to sync Markdown file: ${error.message}`
						);
					}
				});
			}
		} else if (filePath.endsWith(".ipynb")) {
			const mdPath = filePath.replace(/\.ipynb$/, ".md");
			const mdFile = this.app.vault.getAbstractFileByPath(
				path.relative(this.app.vault.getRoot().path, mdPath)
			);
			if (
				mdFile instanceof TFile &&
				(await this.isNotebookPaired(mdFile))
			) {
				exec(`jupytext --sync "${mdPath}"`, (error) => {
					if (error) {
						console.error(
							`Failed to sync Jupyter Notebook: ${error.message}`
						);
					}
				});
			}
		}
	}

	private getActiveCodeBlock(editor: Editor) {
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const lines = content.split("\n");

		let inCodeBlock = false;
		let codeBlockStart = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith("```")) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					codeBlockStart = i;
				} else {
					const codeBlockEnd = i;
					// Include the cursor being on the backtick lines
					if (
						cursor.line >= codeBlockStart &&
						cursor.line <= codeBlockEnd
					) {
						const code = lines
							.slice(codeBlockStart + 1, codeBlockEnd)
							.join("\n");
						return {
							code,
							startPos: codeBlockStart,
							endPos: codeBlockEnd,
						};
					}
					inCodeBlock = false;
				}
			}
		}

		return null;
	}

	private async runCodeAndUpdateNotebook({
		code,
		cellIndex,
		ipynbPath,
		usePersistent = this.settings.usePersistentPython,
	}: {
		code: string;
		cellIndex: number;
		ipynbPath: string;
		usePersistent?: boolean;
	}) {
		if (usePersistent) {
			await this.startPythonProcess();
			const { stdout, stderr } = await this.sendCodeToPython(code);

			try {
				const raw = await fs.readFile(ipynbPath, "utf-8");
				const notebook = JSON.parse(raw);
				const cell = notebook.cells.filter(
					(c: { cell_type: string }) => c.cell_type === "code"
				)[cellIndex];

				if (cell) {
					cell.outputs = [];
					if (stdout) {
						cell.outputs.push({
							output_type: "stream",
							name: "stdout",
							text: stdout.split("\n"),
						});
					}
					if (stderr) {
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
				console.error("Error updating notebook (persistent):", err);
			}

			return;
		}

		const tempDir = os.tmpdir();
		const plotPath = path.join(tempDir, `obsidian_plot_${Date.now()}.png`);

		let stdout = "";
		let stderr = "";

		if (usePersistent) {
			// Inject matplotlib configuration for image generation
			const wrappedCode = `
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

${code}

if plt.get_fignums():
	plt.savefig(r"${plotPath}")
	plt.close()
	`;
			const result = await this.sendCodeToPython(wrappedCode);
			stdout = result.stdout;
			stderr = result.stderr;
		} else {
			// fallback to isolated execution using wrapper script
			await this.runCodeViaScript({
				code,
				cellIndex,
				ipynbPath,
				plotPath,
			});
			return;
		}

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

				try {
					await fs.access(plotPath);
					const imageData = await fs.readFile(plotPath);
					const base64 = imageData.toString("base64");
					cell.outputs.push({
						output_type: "display_data",
						data: { "image/png": base64 },
						metadata: {},
					});
				} catch {
					// No plot generated
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

	private async runCodeViaScript({
		code,
		cellIndex,
		ipynbPath,
	}: {
		code: string;
		cellIndex: number;
		ipynbPath: string;
		plotPath: string;
	}) {
		const tempDir = os.tmpdir();
		const timestamp = Date.now();
		const userCodePath = path.join(
			tempDir,
			`obsidian_user_code_${timestamp}.py`
		);
		const scriptPath = path.join(tempDir, `obsidian_exec_${timestamp}.py`);
		const plotPath = path.join(tempDir, `obsidian_plot_${timestamp}.png`);

		const wrapper = `
import sys, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output

with open(r"${userCodePath}", "r", encoding="utf-8") as f:
	user_code = f.read()

shell = InteractiveShell.instance()
with capture_output() as captured:
	try:
		shell.run_cell(user_code)
	except Exception as e:
		import traceback
		traceback.print_exc()

if plt.get_fignums():
	plt.savefig(r"${plotPath}")
	print(fr"[Plot saved to ${plotPath}]")
	plt.close()

if captured.stdout:
	print(captured.stdout)
if captured.stderr:
	print(captured.stderr, file=sys.stderr)
	`;

		await fs.writeFile(userCodePath, code, "utf-8");
		await fs.writeFile(scriptPath, wrapper, "utf-8");

		await new Promise<void>((resolve) => {
			exec(`python "${scriptPath}"`, async (error, stdout, stderr) => {
				try {
					const raw = await fs.readFile(ipynbPath, "utf-8");
					const notebook = JSON.parse(raw);
					const cell = notebook.cells.filter(
						(c: { cell_type: string }) => c.cell_type === "code"
					)[cellIndex];

					if (cell) {
						cell.outputs = [];
						if (stdout) {
							console.log("Output:", stdout); // TEMPORARY, FOR DEBUGGING
							cell.outputs.push({
								output_type: "stream",
								name: "stdout",
								text: stdout.split("\n"),
							});
						}
						if (stderr) {
							cell.outputs.push({
								output_type: "stream",
								name: "stderr",
								text: stderr.split("\n"),
							});
						}
						try {
							await fs.access(plotPath);
							const imageData = await fs.readFile(plotPath);
							const base64 = imageData.toString("base64");
							cell.outputs.push({
								output_type: "display_data",
								data: { "image/png": base64 },
								metadata: {},
							});
						} catch {
							//
						}

						await fs.writeFile(
							ipynbPath,
							JSON.stringify(notebook, null, 2)
						);
						exec(`jupytext --sync "${ipynbPath}"`);
					}
				} catch (err) {
					console.error("Error updating notebook:", err);
				} finally {
					resolve();
				}
			});
		});

		setTimeout(async () => {
			try {
				await fs.unlink(scriptPath);
				await fs.unlink(userCodePath);
			} catch {
				//
			}
		}, 5000);
	}

	private async executeCodeBlock(editor: Editor, view: MarkdownView) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const currentPath = this.getAbsolutePath(activeFile);
		if (this.currentNotePath && this.currentNotePath !== currentPath) {
			new Notice(
				"Please restart the kernel before executing code in another note.\nUse the 'Restart Python kernel' command."
			);
			return;
		}

		// Track the current note
		this.currentNotePath = currentPath;

		const codeBlock = this.getActiveCodeBlock(editor);
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
			usePersistent: this.settings.usePersistentPython,
		});
		new Notice("Notebook output updated.");
	}

	private async executeAllCodeBlocks() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const currentPath = this.getAbsolutePath(activeFile);
		if (this.currentNotePath && this.currentNotePath !== currentPath) {
			new Notice(
				"Please restart the kernel before executing code in another note.\nUse the 'Restart Python kernel' command."
			);
			return;
		}

		this.currentNotePath = currentPath;

		const fileContent = await this.app.vault.read(activeFile);
		const lines = fileContent.split("\n");
		const ipynbPath = this.getAbsolutePath(activeFile).replace(
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

		new Notice("All code blocks executed.");
	}

	async detectAvailableKernels(): Promise<string[]> {
		return new Promise((resolve) => {
			exec("jupyter kernelspec list --json", (error, stdout) => {
				if (error) {
					console.error("Error detecting kernels:", error);
					resolve(["python3"]);
					return;
				}

				try {
					const result = JSON.parse(stdout);
					const kernels = Object.keys(result.kernelspecs);
					this.settings.availableKernels = kernels;
					this.saveSettings();
					resolve(kernels);
				} catch (e) {
					console.error("Error parsing kernels:", e);
					resolve(["python3"]);
				}
			});
		});
	}

	async selectKernel() {
		const kernels = await this.detectAvailableKernels();

		new Notice(`Available kernels: ${kernels.join(", ")}`);

		const modal = new (class extends Modal {
			constructor(
				app: App,
				private kernels: string[],
				private plugin: JupytextPlugin
			) {
				super(app);
			}

			onOpen() {
				const contentEl = this.modalEl;
				contentEl.createEl("h2", { text: "Select Python Kernel" });

				this.kernels.forEach((kernel) => {
					contentEl
						.createEl("button", {
							text: kernel,
							cls: "mod-cta",
							attr: { style: "margin: 5px;" },
						})
						.addEventListener("click", () => {
							this.plugin.settings.defaultKernel = kernel;
							this.plugin.saveSettings();
							new Notice(`Selected kernel: ${kernel}`);
							this.close();
						});
				});
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		})(this.app, kernels, this);

		modal.open();
	}

	private stdoutBuffer = "";
	private stderrBuffer = "";

	async startPythonProcess() {
		if (
			this.pythonProcess &&
			this.currentKernel === this.settings.defaultKernel
		) {
			return;
		}

		if (this.pythonProcess) {
			await this.stopPythonProcess();
		}

		this.currentKernel = this.settings.defaultKernel;

		await this.getKernelCommand(this.currentKernel);

		this.pythonProcess = spawn("python", ["-i", "-q"], {
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

	private async getKernelCommand(kernelName: string): Promise<string> {
		return new Promise((resolve) => {
			if (kernelName === "python3") {
				resolve("python");
				return;
			}

			exec(`jupyter kernelspec list --json`, (error, stdout) => {
				if (error) {
					resolve("python");
					return;
				}

				try {
					const result = JSON.parse(stdout);
					const kernelSpec = result.kernelspecs[kernelName];
					if (
						kernelSpec &&
						kernelSpec.spec &&
						kernelSpec.spec.argv &&
						kernelSpec.spec.argv.length > 0
					) {
						resolve(kernelSpec.spec.argv[0]);
					} else {
						resolve("python");
					}
				} catch {
					resolve("python");
				}
			});
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

		// Print a marker so we know where output ends
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

					// Important: Filter out the >>> prompts from stderr
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

	private async clearCellOutput(cellIndex: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const ipynbPath = this.getAbsolutePath(activeFile).replace(
			/\.md$/,
			".ipynb"
		);

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const codeCells = notebook.cells.filter(
				(c: { cell_type: string }) => c.cell_type === "code"
			);

			if (cellIndex >= 0 && cellIndex < codeCells.length) {
				codeCells[cellIndex].outputs = [];
				await fs.writeFile(
					ipynbPath,
					JSON.stringify(notebook, null, 2)
				);
				exec(`jupytext --sync "${ipynbPath}"`);
				new Notice(`Cleared output for cell ${cellIndex + 1}`);
			} else {
				new Notice("Invalid cell index");
			}
		} catch (err) {
			console.error("Error clearing cell output:", err);
			new Notice("Failed to clear cell output");
		}
	}

	private async clearAllOutputs() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const ipynbPath = this.getAbsolutePath(activeFile).replace(
			/\.md$/,
			".ipynb"
		);

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);

			notebook.cells.forEach((cell: any) => {
				if (cell.cell_type === "code" && cell.outputs) {
					cell.outputs = [];
				}
			});

			await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			exec(`jupytext --sync "${ipynbPath}"`);
			new Notice("Cleared all outputs");
		} catch (err) {
			console.error("Error clearing all outputs:", err);
			new Notice("Failed to clear outputs");
		}
	}

	private async restartKernel() {
		await this.stopPythonProcess();
		this.currentNotePath = null;
		new Notice("Python kernel restarted");
	}
}

/* -TODO-
- Somehow add outputted plots/images to .ipynb
- Render output in Obsidian
- Run button
*/
