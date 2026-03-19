import {Plugin, TFile, TAbstractFile, MarkdownView} from "obsidian";
import {JupyMDSettingTab} from "./components/Settings";
import {CodeExecutor} from "./components/CodeExecutor";
import {FileSync} from "./components/FileSync";
import {DEFAULT_SETTINGS, JupyMDPluginSettings} from "./components/types";
import {registerCommands} from "./commands";
import {createRoot} from "react-dom/client";
import {PythonCodeBlock} from "./components/CodeBlock";
import {getAbsolutePath, isNotebookPaired} from "./utils/helpers";
import {getDefaultPythonPath} from "./utils/pythonPathUtils";
import * as fs from "fs";

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

		this.registerEvent(
			this.app.vault.on("modify", async (file: TAbstractFile) => {
				if (file instanceof TFile && this.settings.autoSync) {
					await this.fileSync.handleSync(file);
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("delete", async (file: TAbstractFile) => {
				if (file instanceof TFile && file.extension === "md") {
					try {
						const mdPath = getAbsolutePath(file);
						const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");
						if (fs.existsSync(ipynbPath)) {
							fs.unlinkSync(ipynbPath);
						}

					} catch (e) {
						console.error("Failed to delete paired notebook:", e);
					}
				}
			})
		);

		this.registerEvent(
			this.app.vault.on("rename", async (file: TAbstractFile, oldPath: string) => {
				if (file instanceof TFile && file.extension === "md") {
					try {
						const newMdPath = getAbsolutePath(file);
						const oldMdPath = newMdPath.substring(0, newMdPath.length - file.path.length) + oldPath;

						const oldIpynbPath = oldMdPath.replace(/\.md$/, ".ipynb");
						const newIpynbPath = newMdPath.replace(/\.md$/, ".ipynb");

						if (fs.existsSync(oldIpynbPath)) {
							fs.renameSync(oldIpynbPath, newIpynbPath);

							this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
								const view = leaf.view;
								if (view instanceof MarkdownView && view.file?.path === file.path) {
									(leaf as any).rebuildView();
								}
							});
						}
					} catch (e) {
						console.error("Failed to rename paired notebook:", e);
					}
				}
			})
		);

		if (this.settings.enableCodeBlocks) {
			this.registerMarkdownCodeBlockProcessor(
				"python",
				async (source, el, ctx) => {
					el.empty();
					const reactRoot = document.createElement("div");
					el.appendChild(reactRoot);

					const activeFile = this.app.vault.getFileByPath(ctx.sourcePath);

					let index = 0;
					if (activeFile instanceof TFile) {
						const filePath = getAbsolutePath(activeFile);
						const fileContent = await this.app.vault.read(activeFile);
						const lines = fileContent.split("\n");
						let blockCount = 0;
						let foundCurrentBlock = false;

						const sectionInfo = ctx.getSectionInfo(el);
						if (!sectionInfo) {
							const root = createRoot(reactRoot);
							root.render(
								<PythonCodeBlock
									code={source}
									path={filePath}
									index={0}
									executor={this.executor}
									plugin={this}
								/>
							);
							return;
						}

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
					} else {
						createRoot(reactRoot).render(
							<PythonCodeBlock code={source}/>
						);
					}
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
