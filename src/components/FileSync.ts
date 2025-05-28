import { App, Notice, TAbstractFile, TFile } from "obsidian";
import { exec } from "child_process";
import { getAbsolutePath, isNotebookPaired } from "../utils/helpers";

export class FileSync {
	constructor(private app: App) {}


	async createNotebook() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		if (await isNotebookPaired(activeFile)) {
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

	async openNotebookInEditor(editor: string) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		if (!(await isNotebookPaired(activeFile))) {
			new Notice("No paired Jupyter Notebook found for this note.");
			return;
		}

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		const command = `${editor} "${ipynbPath}"`;

		exec(command, (error) => {
			if (error) {
				new Notice(
					`Failed to open notebook in editor: ${error.message}`
				);
				return;
			}
			new Notice(`Opened notebook in editor: ${ipynbPath}`);
		});
	}

	async syncFiles(file: TAbstractFile) {
		if (!(file instanceof TFile)) {
			return;
		}

		const filePath = getAbsolutePath(file);

		if (filePath.endsWith(".md")) {
			const ipynbPath = filePath.replace(/\.md$/, ".ipynb");
			exec(`jupytext --sync "${ipynbPath}"`, (error) => {
				if (error) {
					console.error(
						`Failed to sync Markdown file: ${error.message}`
					);
				}
			});
		} else if (filePath.endsWith(".ipynb")) {
			const mdPath = filePath.replace(/\.ipynb$/, ".md");
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
