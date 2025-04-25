import { App, Notice, TAbstractFile, TFile } from "obsidian";
import { exec } from "child_process";
import { getAbsolutePath } from "../utils/helpers";
import * as fs from "fs/promises";
import * as path from "path";

export class FileSync {
	constructor(private app: App) {}

	async isNotebookPaired(file: TFile): Promise<boolean> {
		const mdPath = await getAbsolutePath(file);
		const ipynbPath = (await mdPath).replace(/\.md$/, ".ipynb");

		try {
			await fs.access(ipynbPath, fs.constants.F_OK);
			return true;
		} catch (error) {
			return false;
		}
	}

	async createNotebook() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = (await mdPath).replace(/\.md$/, ".ipynb");

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

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = (await mdPath).replace(/\.md$/, ".ipynb");

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

	async syncFiles(file: TAbstractFile) {
		if (!(file instanceof TFile)) {
			return;
		}

		const filePath = await getAbsolutePath(file);

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
}
