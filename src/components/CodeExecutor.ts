import JupyMDPlugin from "../main";
import {App, Notice, TFile} from "obsidian";
import {getAbsolutePath, isNotebookPaired, runJupytext} from "../utils/helpers";
import {
	CodeBlock,
	CodeExecutionMode,
	isCodeCell,
	NotebookCell,
	OUTPUTS_UPDATED_EVENT,
	parseNotebook,
} from "./types";
import {NotebookKernelService} from "../kernels/NotebookKernelService";
import {KernelExecutionResult} from "../kernels/types";
import {languageSupportRegistry} from "../languages/LanguageSupport";
import {getExecutableCellIndices} from "../notebook/NotebookCellIndex";
import * as fs from "fs/promises";

export class CodeExecutor {
	private currentNotePath: string | null = null;

	constructor(
		private plugin: JupyMDPlugin,
		private kernelService: NotebookKernelService,
		private app: App
	) {}

	private notifyOutputsUpdated(notePath: string) {
		if (typeof document === "undefined") return;

		document.dispatchEvent(new CustomEvent(OUTPUTS_UPDATED_EVENT, {
			detail: {path: notePath},
		}));
	}

	private async getActivePairedNotebookContext(): Promise<{
		activeFile: TFile;
		notePath: string;
		ipynbPath: string;
	} | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note to run.");
			return null;
		}

		if (activeFile.extension !== "md") {
			new Notice("Active file is not a markdown note.");
			return null;
		}

		if (!await isNotebookPaired(this.app, activeFile)) {
			new Notice("Active note is not paired with a notebook.");
			return null;
		}

		const notePath = getAbsolutePath(activeFile);
		return {
			activeFile,
			notePath,
			ipynbPath: notePath.replace(/\.md$/, ".ipynb"),
		};
	}

	private async getActiveNotebookContextForRun(preferredLanguage?: string): Promise<{
		activeFile: TFile;
		notePath: string;
		ipynbPath: string;
	} | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note to run.");
			return null;
		}

		if (activeFile.extension !== "md") {
			new Notice("Active file is not a markdown note.");
			return null;
		}

		let paired = await isNotebookPaired(this.app, activeFile);
		if (!paired) {
			if (!this.plugin.settings.autoConvertToNotebookOnRun) {
				new Notice("Active note is not paired with a notebook.");
				return null;
			}

			const created = await this.plugin.createNotebookWithKernel(false, preferredLanguage);
			if (!created) return null;
			paired = await isNotebookPaired(this.app, activeFile);
			if (!paired) {
				new Notice("Failed to pair note with a notebook before running.");
				return null;
			}
		}

		const notePath = getAbsolutePath(activeFile);
		const kernel = await this.plugin.ensureKernelForNote(notePath);
		if (!kernel) return null;

		return {
			activeFile,
			notePath,
			ipynbPath: notePath.replace(/\.md$/, ".ipynb"),
		};
	}

	private async prepareExecutionContext(notePath: string): Promise<void> {
		if (this.currentNotePath && this.currentNotePath !== notePath) {
			await this.kernelService.shutdown(this.currentNotePath).catch(() => undefined);
		}
		this.currentNotePath = notePath;
	}

	private async getNotebookCodeBlocks(
		ipynbPath: string,
		notePath?: string,
		kernelLanguage?: string
	): Promise<CodeBlock[]> {
		const raw = await fs.readFile(ipynbPath, "utf-8");
		const notebook = parseNotebook(raw);

		const codeBlocks: CodeBlock[] = notebook.cells
			.filter(isCodeCell)
			.map((cell, cellIndex: number) => ({
				code: Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "",
				cellIndex,
			}));

		if (!notePath || !kernelLanguage) return codeBlocks;
		const markdown = await fs.readFile(notePath, "utf-8");
		const executableIndices = new Set(getExecutableCellIndices(markdown, kernelLanguage));
		return codeBlocks.filter((codeBlock) => executableIndices.has(codeBlock.cellIndex));
	}

	private getCodeBlocksForMode(codeBlocks: CodeBlock[], cellIndex: number, mode: CodeExecutionMode): CodeBlock[] {
		if (mode === "above") return codeBlocks.filter((codeBlock) => codeBlock.cellIndex < cellIndex);
		if (mode === "cell-and-below") return codeBlocks.filter((codeBlock) => codeBlock.cellIndex >= cellIndex);
		return codeBlocks.filter((codeBlock) => codeBlock.cellIndex === cellIndex);
	}

	private applyExecutionResultToCell(cell: NotebookCell, result: KernelExecutionResult): void {
		cell.outputs = result.outputs;
		cell.execution_count = result.executionCount;
		cell.metadata = cell.metadata || {};
		cell.metadata.jupyter = {is_executing: false};
	}

	async executeCodeBlock(codeBlock: CodeBlock, mode: CodeExecutionMode = "cell") {
		const notebookContext = await this.getActiveNotebookContextForRun(codeBlock.language);
		if (!notebookContext) return;
		const selectedKernel = await this.kernelService.resolveKernelForNote(notebookContext.notePath);
		if (
			codeBlock.language &&
			selectedKernel &&
			!languageSupportRegistry.matches(codeBlock.language, selectedKernel.language)
		) {
			new Notice(
				`This notebook uses ${selectedKernel.language}; the ${codeBlock.language} block is not executable with that kernel.`
			);
			return;
		}
		await this.prepareExecutionContext(notebookContext.notePath);

		let codeBlocksToRun = [codeBlock];
		if (mode !== "cell") {
			const notebookCodeBlocks = await this.getNotebookCodeBlocks(
				notebookContext.ipynbPath,
				notebookContext.notePath,
				selectedKernel?.language
			);
			codeBlocksToRun = this.getCodeBlocksForMode(notebookCodeBlocks, codeBlock.cellIndex, mode);
		}

		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks: codeBlocksToRun,
			ipynbPath: notebookContext.ipynbPath,
			notePath: notebookContext.notePath,
		});
		this.notifyOutputsUpdated(notebookContext.notePath);
	}

	async executeAllCodeBlocksInCurrentFile() {
		const notebookContext = await this.getActiveNotebookContextForRun();
		if (!notebookContext) return;
		await this.prepareExecutionContext(notebookContext.notePath);

		const selectedKernel = await this.kernelService.resolveKernelForNote(notebookContext.notePath);
		const codeBlocks = await this.getNotebookCodeBlocks(
			notebookContext.ipynbPath,
			notebookContext.notePath,
			selectedKernel?.language
		);
		if (codeBlocks.length === 0) {
			new Notice("No code blocks found in the current notebook.");
			return;
		}

		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks,
			ipynbPath: notebookContext.ipynbPath,
			notePath: notebookContext.notePath,
		});
		this.notifyOutputsUpdated(notebookContext.notePath);
		new Notice(`Ran ${codeBlocks.length} code block${codeBlocks.length === 1 ? "" : "s"}.`);
	}

	async clearAllOutputsInCurrentFile() {
		const notebookContext = await this.getActivePairedNotebookContext();
		if (!notebookContext) return;

		try {
			const raw = await fs.readFile(notebookContext.ipynbPath, "utf-8");
			const notebook = parseNotebook(raw);
			const codeCells = notebook.cells.filter(isCodeCell);

			for (const cell of codeCells) {
				cell.outputs = [];
				cell.execution_count = null;
			}

			await fs.writeFile(notebookContext.ipynbPath, JSON.stringify(notebook, null, 2));
			await runJupytext(this.plugin.settings.toolingPython, ["--sync", notebookContext.ipynbPath]);
			this.notifyOutputsUpdated(notebookContext.notePath);
			new Notice(`Cleared outputs for ${codeCells.length} code block${codeCells.length === 1 ? "" : "s"}.`);
		} catch (error) {
			new Notice("Error clearing notebook outputs, check console for details");
			console.error("Error clearing notebook outputs:", error);
		}
	}

	async runCodeAndUpdateNotebook({codeBlock, ipynbPath}: {
		codeBlock: CodeBlock;
		ipynbPath: string;
	}) {
		await this.runCodeBlocksAndUpdateNotebook({
			codeBlocks: [codeBlock],
			ipynbPath,
			notePath: ipynbPath.replace(/\.ipynb$/, ".md"),
		});
	}

	async runCodeBlocksAndUpdateNotebook({codeBlocks, ipynbPath, notePath}: {
		codeBlocks: CodeBlock[];
		ipynbPath: string;
		notePath: string;
	}) {
		if (codeBlocks.length === 0) return;

		try {
			const readNotebook = async () => {
				const raw = await fs.readFile(ipynbPath, "utf-8");
				const notebook = parseNotebook(raw);
				const codeCells = notebook.cells.filter(isCodeCell);
				return {notebook, codeCells};
			};
			const cellsMatchMarkdown = (codeCells: NotebookCell[]) => codeBlocks.every((codeBlock) => {
				const cell = codeCells[codeBlock.cellIndex];
				if (!cell) return false;
				const cellSource = Array.isArray(cell.source) ? cell.source.join("") : cell.source || "";
				return cellSource.trim() === codeBlock.code.trim();
			});

			let {notebook, codeCells: notebookCodeCells} = await readNotebook();
			if (!cellsMatchMarkdown(notebookCodeCells)) {
				// Markdown is the source being executed. Force that direction instead of
				// using --sync, whose timestamp selection could copy a stale notebook
				// back over the note. --update retains outputs in the existing notebook.
				await runJupytext(this.plugin.settings.toolingPython, [
					"--update",
					"--to", "ipynb",
					notePath,
				]);
				({notebook, codeCells: notebookCodeCells} = await readNotebook());
			}

			for (const codeBlock of codeBlocks) {
				const cell = notebookCodeCells[codeBlock.cellIndex];
				if (!cell) {
					throw new Error(`Cell with index ${codeBlock.cellIndex} was not found after synchronizing Markdown.`);
				}
				const cellSource = Array.isArray(cell.source) ? cell.source.join("") : cell.source || "";
				if (cellSource.trim() !== codeBlock.code.trim()) {
					throw new Error(
						`Cell ${codeBlock.cellIndex + 1} still does not match the Markdown source after synchronization.`
					);
				}

				const result = await this.kernelService.execute(notePath, codeBlock.code);
				this.applyExecutionResultToCell(cell, result);
				await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			}

			await runJupytext(this.plugin.settings.toolingPython, ["--sync", ipynbPath]);
		} catch (error) {
			new Notice("Error executing notebook, check console for details");
			console.error("Error executing notebook:", error);
			throw error;
		}
	}

	async restartKernel(options: {silent?: boolean} = {}): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const notePath = activeFile instanceof TFile ? getAbsolutePath(activeFile) : this.currentNotePath;
		const restarted = notePath ? await this.kernelService.restart(notePath) : false;
		if (!options.silent) {
			new Notice(restarted ? "Notebook kernel restarted" : "Notebook kernel has not been started yet");
		}
	}

	async interruptKernel(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile)) return;
		const interrupted = await this.kernelService.interrupt(getAbsolutePath(activeFile));
		new Notice(interrupted ? "Notebook kernel interrupted" : "Notebook kernel is not running");
	}

	async cleanup(): Promise<void> {
		await this.kernelService.dispose();
		this.currentNotePath = null;
	}
}
