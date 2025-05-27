import {Plugin, TAbstractFile} from "obsidian";
import {JupyMDSettingTab} from "./components/Settings";
import {CodeExecutor} from "./components/CodeExecutor";
import {FileSync} from "./components/FileSync";
import {KernelManager} from "./components/KernelManager";
import {NotebookUI} from "./components/NotebookUI";
import {DEFAULT_SETTINGS, JupyMDPluginSettings} from "./components/types";
import {registerCommands} from "./commands";
import * as React from "react";
import {createRoot} from "react-dom/client";
import {PythonCodeBlock} from "./CodeBlock";
import {getAbsolutePath} from "./utils/helpers";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	kernelManager: KernelManager;
	notebookUI: NotebookUI;
	currentNotePath: string | null = null;

	async onload() {
		await this.loadSettings();

		this.executor = new CodeExecutor(this, this.app);
		this.notebookUI = new NotebookUI(this.app);
		this.notebookUI.setExecutor(this.executor);


		this.kernelManager = new KernelManager(this, this.app);
		this.kernelManager.executor = this.executor;
		this.executor.kernelManager = this.kernelManager;

		this.fileSync = new FileSync(this.app);

		registerCommands(this);

		this.addSettingTab(new JupyMDSettingTab(this.app, this));

		this.registerEvent(
			this.app.vault.on("modify", async (file: TAbstractFile) => {
				await this.fileSync.syncFiles(file);
			})
		);

		this.registerMarkdownCodeBlockProcessor("python", (source, el, ctx) => {
			el.empty();
			const reactRoot = document.createElement("div");
			el.appendChild(reactRoot);

			// Get the active file path
			const activeFile = this.app.workspace.getActiveFile();
			let path = activeFile ? activeFile.path : undefined;

			// Calculate the index of this code block
			let index = 0;
			if (activeFile) {
				const filePath = getAbsolutePath(activeFile)
				const fileContent = this.app.vault.read(activeFile);

				fileContent.then(content => {
					const lines = content.split("\n");
					let blockCount = 0;
					let foundCurrentBlock = false;

					// Find the section info to get line number
					const sectionInfo = ctx.getSectionInfo(el);
					if (!sectionInfo) return;

					// Count python blocks before this one
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
				// Fallback if we can't determine the file or index
				createRoot(reactRoot).render(<PythonCodeBlock code={source}/>);
			}
		});
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

// TODO: Docstrings, documentation, tests
// TODO: Fix render errors in files with mixed language code blocks
// TODO: Matplotlib support
