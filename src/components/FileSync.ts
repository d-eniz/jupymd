import { App, Notice, TFile, MarkdownView } from "obsidian";
import { exec } from "child_process";
import { getAbsolutePath, isNotebookPaired } from "../utils/helpers";
import { getPackageExecutablePath } from "../utils/pythonPathUtils";
import { JupyMDPluginSettings } from "./types"; 

export class FileSync {
	private readonly pythonPath: string;
	private settings: JupyMDPluginSettings;

	private lastSyncTime: number = 0;
	private syncDebounceTimeout: NodeJS.Timeout | null = null;
	private readonly SYNC_DEADTIME_MS = 1500;
	private readonly DEBOUNCE_DELAY_MS = 500;

	constructor(private app: App, pythonPath: string, settings: JupyMDPluginSettings) {
		this.pythonPath = pythonPath;
		this.settings = settings;
	}

	public isSyncBlocked(): boolean {
		const now = Date.now();
		const inDeadtime = now - this.lastSyncTime < this.SYNC_DEADTIME_MS;
		const inDebounce = this.syncDebounceTimeout !== null;
		return inDeadtime || inDebounce;
	}

	public async handleSync(file?: TFile, verbose?: boolean): Promise<void> {
		const targetFile = file ?? this.app.workspace.getActiveFile();
		if (!targetFile) return;

		if (this.isSyncBlocked()) {
			return;
		}

		if (this.syncDebounceTimeout) {
			clearTimeout(this.syncDebounceTimeout);
		}

		this.syncDebounceTimeout = setTimeout(async () => {
			this.syncDebounceTimeout = null;

			if (!this.isSyncBlocked()) {
				await this.performSync(targetFile);
			}
		}, this.DEBOUNCE_DELAY_MS);

		if (verbose) {
			new Notice("Syncing...")
		}
	}

	private async performSync(file: TFile): Promise<void> {
		try {
			this.lastSyncTime = Date.now();
			await this.syncFiles(file);
		} catch (error) {
			console.error("Sync failed:", error);
			this.lastSyncTime = 0;
		}
	}

	async convertNotebookToNote() {
		const files = this.app.vault.getFiles().filter(f => f.path.endsWith('.ipynb'));
		if (files.length === 0) {
			new Notice("No Jupyter notebook (.ipynb) files found in your vault.");
			return;
		}

		const fileNames = files.map(f => f.path);
		const selected = await new Promise<string | null>((resolve) => {
			const modal = document.createElement('div');
			modal.style.position = 'fixed';
			modal.style.top = '30%';
			modal.style.left = '50%';
			modal.style.transform = 'translate(-50%, -50%)';
			modal.style.background = 'var(--background-primary)';
			modal.style.padding = '2em';
			modal.style.borderRadius = '8px';
			modal.style.zIndex = '9999';
			modal.style.boxShadow = '0 2px 16px rgba(0,0,0,0.2)';

			const label = document.createElement('div');
			label.textContent = 'Select a Jupyter notebook to convert:';
			label.style.marginBottom = '1em';
			modal.appendChild(label);

			const select = document.createElement('select');
			select.style.width = '100%';
			for (const name of fileNames) {
				const option = document.createElement('option');
				option.value = name;
				option.textContent = name;
				select.appendChild(option);
			}
			modal.appendChild(select);

			const btn = document.createElement('button');
			btn.textContent = 'Convert';
			btn.style.marginTop = '1em';
			btn.onclick = () => {
				document.body.removeChild(modal);
				resolve(select.value);
			};
			modal.appendChild(btn);

			const cancel = document.createElement('button');
			cancel.textContent = 'Cancel';
			cancel.style.marginLeft = '1em';
			cancel.onclick = () => {
				document.body.removeChild(modal);
				resolve(null);
			};
			modal.appendChild(cancel);

			document.body.appendChild(modal);
		});

		if (!selected) return;
		const file = files.find(f => f.path === selected);
		if (!file) return;

		const absPath = getAbsolutePath.call(this, file);
		const mdPath = absPath.replace(/\.ipynb$/, ".md");
		const jupytextCmd = getPackageExecutablePath("jupytext", this.pythonPath);

		exec(`${jupytextCmd} --to markdown "${absPath}"`, (error) => {
			if (error) {
				new Notice(`Failed to convert notebook: ${error.message}`);
				return;
			}

			exec(`${jupytextCmd} --set-formats ipynb,md "${absPath}"`, (pairError) => {
				if (pairError) {
					new Notice(`Failed to pair notebook and note: ${pairError.message}`);
					return;
				}
				new Notice(`Note created and paired: ${mdPath}`);
				// Open the new note in Obsidian
				const mdRelative = this.app.vault.getFiles().find(f => getAbsolutePath.call(this, f) === mdPath);
				if (mdRelative) {
					this.app.workspace.openLinkText(mdRelative.path, '', true);
				}
			});
		});
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
				console.error(error)
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

		let syncCmd: string;
		if (this.settings.bidirectionalSync) {
			syncCmd = `--sync "${ipynbPath}"`;
		} else {
			syncCmd = `--to ipynb "${filePath}"`;
		}

		exec(`${jupytextCmd} ${syncCmd}`, (error) => {
			if (error) {
				console.error(
					`Failed to sync Markdown file: ${error.message}`
				);
			}
		});
	}
}
