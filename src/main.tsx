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

		this.registerEvent(
			this.app.vault.on("modify", async (file: TFile) => {
				console.log("modify");
				if (this.settings.enableContinuousSync) {
					await this.handleSync(file);
				}
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
		if (this.syncDebounceTimeout) {
			clearTimeout(this.syncDebounceTimeout);
		}
		this.syncDebounceTimeout = setTimeout(async () => {
			await this.deadtimeSync(file);
		}, this.DEBOUNCE_DELAY_MS);
	}

	private async deadtimeSync(file: TFile): Promise<void> {
		const currentTime = Date.now();

		if (currentTime - this.lastSyncTime < this.SYNC_DEADTIME_MS) {
			console.log("sync request ignored - deadtime");
			return;
		}

		try {
			console.log("start sync");
			this.lastSyncTime = currentTime;
			await this.fileSync.syncFiles(file);
			console.log("sync complete");
		} catch (error) {
			console.error(error);
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
