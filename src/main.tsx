import {Plugin, TFile} from "obsidian";
import {JupyMDSettingTab} from "./components/Settings";
import {CodeExecutor} from "./components/CodeExecutor";
import {FileSync} from "./components/FileSync";
import {DEFAULT_SETTINGS, JupyMDPluginSettings} from "./components/types";
import {registerCommands} from "./commands";
import * as React from "react";
import {createRoot} from "react-dom/client";
import {PythonCodeBlock} from "./components/CodeBlock";
import {getAbsolutePath} from "./utils/helpers";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	currentNotePath: string | null = null;

	async onload() {
		await this.loadSettings();

		this.executor = new CodeExecutor(this, this.app);

		this.fileSync = new FileSync(this.app);

		registerCommands(this);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("modify", async (file: TFile) => {
				await this.fileSync.syncFiles(file);
			})
		);

		if (this.settings.enableCodeBlocks) {
			this.registerMarkdownCodeBlockProcessor("python", (source, el, ctx) => {
				el.empty();
				const reactRoot = document.createElement("div");
				el.appendChild(reactRoot);

				const activeFile = this.app.workspace.getActiveFile();

				let index = 0;
				if (activeFile) {
					const filePath = getAbsolutePath(activeFile)
					const fileContent = this.app.vault.read(activeFile);

					fileContent.then(content => {
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
					createRoot(reactRoot).render(<PythonCodeBlock code={source}/>);
				}
			});
		}
	}

	async onunload() {
		this.executor.cleanup()
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
