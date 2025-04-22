import { Plugin, TAbstractFile, Editor, MarkdownView } from "obsidian";
import { JupyMDSettingTab } from "./components/Settings";
import { CodeExecutor } from "./components/CodeExecutor";
import { FileSync } from "./components/FileSync";
import { KernelManager } from "./components/KernelManager";
import { NotebookUI } from "./components/NotebookUI";
import { DEFAULT_SETTINGS, JupyMDPluginSettings } from "./components/types";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	kernelManager: KernelManager;
	notebookUI: NotebookUI;
	currentNotePath: string | null = null;

	async onload() {
		await this.loadSettings();

		this.kernelManager = new KernelManager(this, this.app);
		this.executor = new CodeExecutor(this, this.app);

		this.kernelManager.executor = this.executor;
		this.executor.kernelManager = this.kernelManager;

		this.fileSync = new FileSync(this, this.app);
		this.notebookUI = new NotebookUI(this, this.app);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.addCommand({
			id: "create-jupyter-notebook",
			name: "Create Jupyter notebook from note",
			callback: () => this.fileSync.createNotebook(),
		});

		this.addCommand({
			id: "open-jupyter-notebook-in-vscode",
			name: "Open Jupyter notebook in VS Code",
			callback: () => this.fileSync.openNotebookInEditor("vscode"),
		});

		this.addCommand({
			id: "open-jupyter-notebook-in-lab",
			name: "Open Jupyter notebook in Jupyter Lab",
			callback: () => this.fileSync.openNotebookInEditor("jupyter-lab"),
		});

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) =>
				this.fileSync.syncFiles(file)
			)
		);

		this.addCommand({
			id: "execute-code-block",
			name: "Execute code block",
			editorCallback: (editor: Editor, view: MarkdownView) =>
				this.executor.executeCodeBlock(editor, view),
		});

		this.addCommand({
			id: "execute-all-code-blocks",
			name: "Execute all code blocks in note",
			callback: () => this.executor.executeAllCodeBlocks(),
		});

		this.addCommand({
			id: "clear-current-cell-output",
			name: "Clear current cell output",
			editorCallback: (editor: Editor, view: MarkdownView) =>
				this.notebookUI.clearCommand(editor),
		});

		this.addCommand({
			id: "clear-all-outputs",
			name: "Clear all cell outputs",
			callback: () => this.notebookUI.clearAllOutputs(),
		});

		this.addCommand({
			id: "select-python-kernel",
			name: "Select Python kernel",
			callback: () => this.kernelManager.selectKernel(),
		});

		this.addCommand({
			id: "restart-python-kernel",
			name: "Restart Python kernel",
			callback: () => this.kernelManager.restartKernel(),
		});

		this.cmStyleEl = document.createElement("style");
		this.cmStyleEl.id = "jupymd-codemirror-overrides";
		document.head.appendChild(this.cmStyleEl);

		this.registerMarkdownCodeBlockProcessor(
			"python",
			async (source, el, ctx) => {
				this.notebookUI.setupCodeBlockProcessor(source, el, ctx);
			}
		);
	}

	private cmStyleEl: HTMLStyleElement;

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
}

/* -TODO-
- Refactor into modules under /src
- Show kernel status in status bar (click to go to note with active kernel)
- Somehow add outputted plots/images to .ipynb
- Run button
- Remove Promise
https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
*/
