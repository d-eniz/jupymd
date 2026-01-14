import { Plugin, TFile } from "obsidian";
import { JupyMDSettingTab } from "./components/Settings";
import { CodeExecutor } from "./components/CodeExecutor";
import { FileSync } from "./components/FileSync";
import { DEFAULT_SETTINGS, JupyMDPluginSettings } from "./components/types";
import { registerCommands } from "./commands";
import { getDefaultPythonPath } from "./utils/pythonPathUtils";
import { renderStaticCodeBlock } from "./components/StaticCodeBlock";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	currentNotePath: string | null = null;

	async onload() {
		await this.loadSettings();



		if (!this.settings.pythonInterpreter) {
			this.settings.pythonInterpreter = getDefaultPythonPath();
			await this.saveSettings();
		}

		this.executor = new CodeExecutor(this, this.app);		
		this.fileSync = new FileSync(this.app, this.settings.pythonInterpreter, this.settings);

		registerCommands(this);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.registerEvent( // TODO: add option manually sync and disable auto sync
			this.app.vault.on("modify", async (file: TFile) => {
				if (this.settings.autoSync) {
					await this.fileSync.handleSync(file);
				}
			})
		);

		if (this.settings.enableCodeBlocks) {
			this.registerMarkdownCodeBlockProcessor(
				"python",
				async (source, el, ctx) => {
					const activeFile = this.app.workspace.getActiveFile();

					let cellIndex = 0;
					if (activeFile) {
						const content = await this.app.vault.read(activeFile);
						const lines = content.split("\n");
						let blockCount = 0;

						const sectionInfo = ctx.getSectionInfo(el);
						if (sectionInfo) {
							for (let i = 0; i < lines.length; i++) {
								const line = lines[i].trim();
								if (line.startsWith("```python")) {
									if (i < sectionInfo.lineStart) {
										blockCount++;
									} else if (i === sectionInfo.lineStart) {
										cellIndex = blockCount;
										break;
									}
								}
							}
						}
					}

					await renderStaticCodeBlock(
						this.app,
						activeFile,
						source,
						cellIndex,
						el,
						this.executor,
						this
					);
				}
			);
		}
	}

	async onunload() {
		this.executor.cleanup();
	}

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
