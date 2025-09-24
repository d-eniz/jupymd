import { Plugin, TFile } from "obsidian";
import { JupyMDSettingTab } from "./components/Settings";
import { CodeExecutor } from "./components/CodeExecutor";
import { FileSync } from "./components/FileSync";
import { DEFAULT_SETTINGS, JupyMDPluginSettings } from "./components/types";
import { registerCommands } from "./commands";
import { createRoot } from "react-dom/client";
import { PythonCodeBlock } from "./components/CodeBlock";
import { getAbsolutePath } from "./utils/helpers";
import { getDefaultPythonPath } from "./utils/pythonPathUtils";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	currentNotePath: string | null = null;

	private lastSyncTime: number = 0;
	private syncDebounceTimeout: NodeJS.Timeout | null = null;
	private readonly SYNC_DEADTIME_MS = 1500;
	private readonly DEBOUNCE_DELAY_MS = 500;

	public isSyncBlocked(): boolean {
		const now = Date.now();

		const inDeadtime = now - this.lastSyncTime < this.SYNC_DEADTIME_MS;
		const inDebounce = this.syncDebounceTimeout !== null;

		return inDeadtime || inDebounce;
  	}

	async onload() {
		await this.loadSettings();

		if (!this.settings.pythonInterpreter) {
			this.settings.pythonInterpreter = getDefaultPythonPath();
			await this.saveSettings();
		}

		this.executor = new CodeExecutor(this, this.app);

		this.fileSync = new FileSync(this.app, this.settings.pythonInterpreter);

		registerCommands(this);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.registerEvent( // TODO: add option manually sync and disable auto sync
			this.app.vault.on("modify", async (file: TFile) => {
				await this.handleSync(file);
			})
		);

		if (this.settings.enableCodeBlocks) {
			this.registerMarkdownCodeBlockProcessor(
				"python",
				(source, el, ctx) => {
					el.empty();
					const reactRoot = document.createElement("div");
					el.appendChild(reactRoot);

					const activeFile = this.app.workspace.getActiveFile();

					let index = 0;
					if (activeFile) {
						const filePath = getAbsolutePath(activeFile);
						const fileContent = this.app.vault.read(activeFile);

						fileContent.then((content) => {
							const lines = content.split("\n");
							let blockCount = 0;
							let foundCurrentBlock = false;

							const sectionInfo = ctx.getSectionInfo(el);
							if (!sectionInfo) return;

							for (let i = 0; i < lines.length; i++) {
								const line = lines[i].trim();
								if (line.startsWith("```python")) {
									if (i < sectionInfo.lineStart) {
										blockCount++;
									} else if (i === sectionInfo.lineStart) {
										foundCurrentBlock = true;
										break;
									}
								}
							}

							if (foundCurrentBlock) {
								index = blockCount;
								createRoot(reactRoot).render(
									<PythonCodeBlock
										code={source}
										path={filePath}
										index={index}
										executor={this.executor}
										plugin={this}
									/>
								);
							}
						});
					} else {
						createRoot(reactRoot).render(
							<PythonCodeBlock code={source} />
						);
					}
				}
			);
		}
	}

	private async handleSync(file: TFile): Promise<void> {
		if (this.isSyncBlocked()){
			return;
		}

		if (this.syncDebounceTimeout) {
			clearTimeout(this.syncDebounceTimeout);
		}

		this.syncDebounceTimeout = setTimeout(async () => {
			this.syncDebounceTimeout = null;

			if (!this.isSyncBlocked()){
				await this.performSync(file);
			}
		}, this.DEBOUNCE_DELAY_MS);
	}

	private async performSync(file: TFile): Promise<void> {
		try {
			this.lastSyncTime = Date.now();
			await this.fileSync.syncFiles(file);
		} catch (error) {
			console.error("Sync failed:", error);
			this.lastSyncTime = 0;
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
