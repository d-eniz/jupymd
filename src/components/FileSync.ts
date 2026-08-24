import {App, Notice, TFile, MarkdownView, FuzzySuggestModal, FuzzyMatch} from "obsidian";
import {execFile} from "child_process";
import {
	getAbsolutePath,
	getErrorMessage,
	isNotebookPaired,
	runJupytext,
	upgradeLegacyNotebook,
} from "../utils/helpers";
import {KernelConnection} from "../kernels/types";
import * as fs from "fs";
import {rebuildWorkspaceLeaf} from "../utils/workspace";

class NotebookFileSelectorModal extends FuzzySuggestModal<TFile> {
	private resolver: ((file: TFile | null) => void) | null = null;
	private selected = false;

	constructor(app: App, private readonly files: TFile[]) {
		super(app);
		this.setPlaceholder("Select a Jupyter notebook to convert…");
	}

	openAndGetValue(): Promise<TFile | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		el.createDiv({text: match.item.path});
	}

	selectSuggestion(value: FuzzyMatch<TFile>, event: MouseEvent | KeyboardEvent): void {
		this.selected = true;
		super.selectSuggestion(value, event);
	}

	onChooseItem(file: TFile): void {
		this.resolver?.(file);
		this.resolver = null;
		this.selected = false;
	}

	onClose(): void {
		super.onClose();
		if (this.selected) return;
		this.resolver?.(null);
		this.resolver = null;
	}
}

export class FileSync {
	private readonly pythonPath: string;
	private lastSyncTime = 0;
	private syncDebounceTimeout: number | null = null;
	private readonly SYNC_DEADTIME_MS = 1500;
	private readonly DEBOUNCE_DELAY_MS = 500;

	constructor(private app: App, pythonPath: string) {
		this.pythonPath = pythonPath;
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
			window.clearTimeout(this.syncDebounceTimeout);
		}

		this.syncDebounceTimeout = window.setTimeout(() => {
			this.syncDebounceTimeout = null;

			if (!this.isSyncBlocked()) {
				void this.performSync(targetFile);
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

	async convertNotebookToNote(): Promise<void> {
		const notebooks = this.app.vault.getFiles().filter((file) => file.path.endsWith(".ipynb"));
		const files = (await Promise.all(notebooks.map(async (notebook) => {
			const notePath = notebook.path.replace(/\.ipynb$/, ".md");
			const note = this.app.vault.getAbstractFileByPath(notePath);
			if (note instanceof TFile && await isNotebookPaired(this.app, note)) return null;
			return notebook;
		}))).filter((file): file is TFile => file !== null);

		if (files.length === 0) {
			new Notice("No unpaired Jupyter notebook (.ipynb) files found in your vault.");
			return;
		}

		const file = await new NotebookFileSelectorModal(this.app, files).openAndGetValue();
		if (!file) return;

		const absPath = getAbsolutePath(file);
		const mdPath = absPath.replace(/\.ipynb$/, ".md");

		try {
			const upgraded = await upgradeLegacyNotebook(this.pythonPath, absPath);
			await runJupytext(this.pythonPath, ["--to", "markdown", absPath]);
			await runJupytext(this.pythonPath, ["--set-formats", "ipynb,md", absPath]);

			new Notice(upgraded
				? `Legacy notebook upgraded to format v4; note created and paired: ${mdPath}`
				: `Note created and paired: ${mdPath}`);

			const mdRelativePath = file.path.replace(/\.ipynb$/, ".md");
			void this.app.workspace.openLinkText(mdRelativePath, "", true);
		} catch (error: unknown) {
			new Notice(`Failed to convert notebook: ${getErrorMessage(error)}`);
		}
	}

	async createNotebook(kernel: KernelConnection, refreshView = true): Promise<boolean> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return false;
		}

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		if (await isNotebookPaired(this.app, activeFile)) {
			new Notice("Notebook is already paired with this note.");
			return true;
		}

		try {
			if (fs.existsSync(ipynbPath)) {
				fs.unlinkSync(ipynbPath)
			}

			await runJupytext(this.pythonPath, ["--to", "notebook", mdPath]);

			const metadata = JSON.stringify({
				kernelspec: {
					display_name: kernel.displayName,
					language: kernel.language,
					name: kernel.name,
				},
			});

			await runJupytext(this.pythonPath, [
				ipynbPath,
				"--set-formats", "ipynb,md",
				"--update-metadata", metadata,
			]);

			if (refreshView) {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				const leaf = this.app.workspace.getLeavesOfType(
					view?.getViewType() ?? ""
				)[0];

				rebuildWorkspaceLeaf(leaf);
			}

			new Notice(`Notebook created and paired: ${ipynbPath}`);
			return true;
		} catch (error: unknown) {
			new Notice(`Failed to create notebook: ${getErrorMessage(error)}`);
			return false;
		}
	}

	async openNotebookInEditor(editor: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note found.");
			return;
		}

		if (!(await isNotebookPaired(this.app, activeFile))) {
			return;
		}

		const mdPath = getAbsolutePath(activeFile);
		const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

		execFile(editor, [ipynbPath], (error) => {
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

	async syncFiles(file: TFile): Promise<void> {
		if (!(await isNotebookPaired(this.app, file))) return;

		const filePath = getAbsolutePath(file);
		const ipynbPath = filePath.replace(/\.md$/, ".ipynb");

		try {
			// `--sync` updates the paired notebook from markdown changes while preserving
			// existing notebook outputs instead of recreating the .ipynb from scratch.
			await runJupytext(this.pythonPath, ["--sync", ipynbPath]);
		} catch (error: unknown) {
			console.error(`Failed to sync Markdown file: ${getErrorMessage(error)}`);
		}
	}
}
