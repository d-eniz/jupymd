import {App, Notice, TFile, MarkdownView} from "obsidian";
import {exec} from "child_process";
import {getAbsolutePath, isNotebookPaired} from "../utils/helpers";
import {getPackageExecutablePath} from "../utils/pythonPathUtils";

export class FileSync {
	private readonly pythonPath: string;

	constructor(private app: App, pythonPath: string) {
		this.pythonPath = pythonPath;
	}

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
		const jupytextCmd = getPackageExecutablePath("jupytext", this.pythonPath);

		exec(`${jupytextCmd} --to notebook "${mdPath}"`, (error) => {
			if (error) {
				new Notice(`Failed to create notebook: ${error.message}`);
				return;
			}

			exec(`${jupytextCmd} --set-formats ipynb,md "${ipynbPath}"`, (error) => {
				if (error) {
					new Notice(`Failed to pair notebook: ${error.message}`);
					return;
				}

				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				const leaf = this.app.workspace.getLeavesOfType(
					view?.getViewType() ?? ""
				)[0];
				(leaf as any).rebuildView(); // Refresh

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

	async syncFiles(file: TFile) {

		const activeFile = this.app.workspace.getActiveFile();
		if (!await isNotebookPaired(activeFile)) {
			return;
		}

		const filePath = getAbsolutePath(file);

		const ipynbPath = filePath.replace(/\.md$/, ".ipynb");

		const jupytextCmd = getPackageExecutablePath("jupytext", this.pythonPath);
		exec(`${jupytextCmd} --sync "${ipynbPath}"`, (error) => {
			if (error) {
				console.error(
					`Failed to sync Markdown file: ${error.message}`
				);
			}
		});
	}
}
