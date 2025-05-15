import { Plugin, TAbstractFile } from "obsidian";
import { JupyMDSettingTab } from "./components/Settings";
import { CodeExecutor } from "./components/CodeExecutor";
import { FileSync } from "./components/FileSync";
import { KernelManager } from "./components/KernelManager";
import { NotebookUI } from "./components/NotebookUI";
import { DEFAULT_SETTINGS, JupyMDPluginSettings } from "./components/types";
import { registerCommands } from "./commands";

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

		this.fileSync = new FileSync(this.app);
		this.notebookUI = new NotebookUI(this.app);

		registerCommands(this);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.cmStyleEl = document.createElement("style");
		this.cmStyleEl.id = "jupymd-codemirror-overrides";
		document.head.appendChild(this.cmStyleEl);

		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) =>
				this.fileSync.syncFiles(file)
			)
		);

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
- Show kernel status in status bar (click to go to note with active kernel)
- Somehow add outputted plots/images to .ipynb
- Run button
- Remove Promise
https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
*/
