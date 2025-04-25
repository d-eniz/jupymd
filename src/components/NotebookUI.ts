import { App, Editor, Notice, MarkdownView } from "obsidian";
import { getAbsolutePath } from "src/utils/helpers";
import * as fs from "fs/promises";
import { exec } from "child_process";

export class NotebookUI {
	constructor(private app: App) {
		this.cmStyleEl = document.createElement("style");
		this.cmStyleEl.id = "jupymd-codemirror-overrides";
		document.head.appendChild(this.cmStyleEl);
	}

	getActiveCodeBlock(editor: Editor) {
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const lines = content.split("\n");

		let inCodeBlock = false;
		let codeBlockStart = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith("```")) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					codeBlockStart = i;
				} else {
					const codeBlockEnd = i;
					// Include the cursor being on the backtick lines
					if (
						cursor.line >= codeBlockStart &&
						cursor.line <= codeBlockEnd
					) {
						const code = lines
							.slice(codeBlockStart + 1, codeBlockEnd)
							.join("\n");
						return {
							code,
							startPos: codeBlockStart,
							endPos: codeBlockEnd,
						};
					}
					inCodeBlock = false;
				}
			}
		}

		return null;
	}

	renderOutputs(container: HTMLElement, outputs: any[]) {
		container.empty();

		if (!outputs || outputs.length === 0) {
			container.remove();
			return;
		}

		const outputContainer = container.createEl("div", {
			cls: "jupymd-output-container",
		});

		outputs.forEach((output) => {
			switch (output.output_type) {
				case "stream": {
					const streamEl = outputContainer.createEl("div", {
						cls: `jupymd-stream jupymd-${output.name}`,
					});
					const text = Array.isArray(output.text)
						? output.text.join("")
						: output.text;
					streamEl
						.createEl("pre", { cls: "cm-line" })
						.createEl("code", {
							cls: `jupymd-${output.name}`,
							text: text,
						});
					break;
				}

				case "error": {
					const errorEl = outputContainer.createEl("div", {
						cls: "jupymd-error-output",
					});
					const traceback = Array.isArray(output.traceback)
						? output.traceback.join("\n")
						: output.traceback;
					errorEl
						.createEl("pre", { cls: "cm-line" })
						.createEl("code", {
							cls: "jupymd-stderr",
							text: traceback,
						});
					break;
				}
			}
		});
	}

	forceRerender() {
		// Not my ideal solution but it works
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const leaf = this.app.workspace.getLeavesOfType(
			view?.getViewType() ?? ""
		)[0];
		if (leaf && typeof (leaf as any).rebuildView === "function") {
			(leaf as any).rebuildView();
		}
	}

	cmStyleEl: HTMLStyleElement;

	applyCodeMirrorOverrides() {
		// Clear existing rules
		while (this.cmStyleEl.sheet?.cssRules.length) {
			this.cmStyleEl.sheet.deleteRule(0);
		}

		// Add new rules safely
		if (this.cmStyleEl.sheet) {
			const rules = [
				`.jupymd-code-container .CodeMirror-line {
					line-height: 1 !important;
					height: auto !important;
					padding: 5px !important;
					margin: 0 !important;
					min-height: unset !important;
					font-family: var(--font-monospace) !important;
					font-size: 14px !important;
				}`,
				`.jupymd-code-container .CodeMirror-line > span {
					line-height: 1.2 !important;
					vertical-align: top !important;
				}`,
				`.jupymd-code-container .CodeMirror-line > span > span {
					line-height: 1.2 !important;
				}`,
				/* New rules for output window */
				`.jupymd-output {
					background: none !important;
					padding: 8px !important;
					border-top: 1px solid var(--background-modifier-border) !important;
				}`,
				`.jupymd-output pre, .jupymd-output code {
					background: none !important;
				}`,
				`.jupymd-output .jupymd-stream,
				 .jupymd-output .jupymd-text-output,
				 .jupymd-output .jupymd-error-output {
					background: none !important;
					margin: 0 !important;
					padding: 5px !important;
				}`,
			];

			rules.forEach((rule) => {
				this.cmStyleEl.sheet?.insertRule(
					rule,
					this.cmStyleEl.sheet.cssRules.length
				);
			});
		}
	}

	async clearCommand(editor: any) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const codeBlock = this.getActiveCodeBlock(editor);
		if (!codeBlock) {
			new Notice("No code block found at cursor position");
			return;
		}

		const markdownLines = editor.getValue().split("\n");
		let cellIndex = 0;
		let foundBlocks = 0;
		for (let i = 0; i < markdownLines.length; i++) {
			const line = markdownLines[i];
			if (line.trim().startsWith("```")) {
				if (foundBlocks % 2 === 0 && i < codeBlock.startPos) {
					cellIndex++;
				}
				foundBlocks++;
			}
		}

		this.clearCellOutput(cellIndex);
	}

	async clearCellOutput(cellIndex: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const absolutePath = await getAbsolutePath(activeFile);
		const ipynbPath = absolutePath.replace(/\.md$/, ".ipynb");

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const codeCells = notebook.cells.filter(
				(c: { cell_type: string }) => c.cell_type === "code"
			);

			if (cellIndex >= 0 && cellIndex < codeCells.length) {
				codeCells[cellIndex].outputs = [];
				await fs.writeFile(
					ipynbPath,
					JSON.stringify(notebook, null, 2)
				);
				exec(`jupytext --sync "${ipynbPath}"`);
				this.forceRerender();
				new Notice(`Cleared output for cell ${cellIndex + 1}`);
			} else {
				new Notice("Invalid cell index");
			}
		} catch (err) {
			console.error("Error clearing cell output:", err);
			new Notice("Failed to clear cell output");
		}
	}

	async clearAllOutputs() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;

		const absolutePath = await getAbsolutePath(activeFile);
		const ipynbPath = absolutePath.replace(/\.md$/, ".ipynb");

		try {
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);

			notebook.cells.forEach((cell: any) => {
				if (cell.cell_type === "code" && cell.outputs) {
					cell.outputs = [];
				}
			});

			await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			exec(`jupytext --sync "${ipynbPath}"`);
			this.forceRerender();

			new Notice("Cleared all outputs");
		} catch (err) {
			console.error("Error clearing all outputs:", err);
			new Notice("Failed to clear outputs");
		}
	}

	async setupCodeBlockProcessor(
		source: string,
		el: HTMLElement,
		ctx: {
			getSectionInfo: (
				el: HTMLElement
			) => { lineStart: number; lineEnd: number } | null;
		}
	): Promise<void> {
		el.empty();

		const container = el.createEl("div", {
			cls: "jupymd-code-block",
		});

		const codeSection = container.createEl("div", {
			cls: "jupymd-code-container",
		});

		const cmContainer = codeSection.createEl("div");

		const editor: CodeMirror.Editor = (window as any).CodeMirror(
			cmContainer,
			{
				value: source,
				mode: "python",
				theme: "obsidian",
				lineNumbers: false,
				readOnly: "nocursor",
				lineWrapping: true,
				viewportMargin: 0,
				indentUnit: 4,
				gutters: [],
				fixedGutter: false,
			}
		);

		cmContainer.addEventListener("click", (e: MouseEvent) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			const mainEditor = view.editor;
			const fileContent = mainEditor.getValue();

			const sectionInfo = ctx.getSectionInfo(el);
			if (!sectionInfo) return;

			const cursor = editor.coordsChar(
				{ top: e.clientY, left: e.clientX },
				"page"
			);

			const lineInBlock = cursor.line;
			const blockStartLine = sectionInfo.lineStart;
			const targetLine = blockStartLine + 1 + lineInBlock;

			const lines = fileContent.split("\n");
			let blockEndLine = blockStartLine;
			for (let i = blockStartLine + 1; i < lines.length; i++) {
				if (lines[i].trim().startsWith("```")) {
					blockEndLine = i;
					break;
				}
			}

			if (targetLine >= blockStartLine && targetLine < blockEndLine) {
				mainEditor.focus();
				mainEditor.setCursor({
					line: targetLine,
					ch: Math.min(
						mainEditor.getLine(targetLine).length,
						cursor.ch
					),
				});
			}
		});

		this.applyCodeMirrorOverrides();
		setTimeout(() => editor.refresh(), 50);

		const outputSection = container.createEl("div", {
			cls: "jupymd-output",
			attr: {
				contenteditable: "false",
				tabindex: "0",
			},
		});
		outputSection.createEl("div", {
			text: "Loading outputs...",
			cls: "jupymd-loading",
		});

		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) return;

			const absolutePath = await getAbsolutePath(activeFile);
			const ipynbPath = absolutePath.replace(/\.md$/, ".ipynb");
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);

			// Find the current code block's position in the note
			const fileContent = await this.app.vault.read(activeFile);
			const lines = fileContent.split("\n");

			let currentBlockIndex = -1;
			let inCodeBlock = false;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i].trim();
				if (line.startsWith("```python")) {
					if (!inCodeBlock) {
						inCodeBlock = true;
						currentBlockIndex++;

						const nextLines = [];
						let j = i + 1;
						while (
							j < lines.length &&
							!lines[j].trim().startsWith("```")
						) {
							nextLines.push(lines[j]);
							j++;
						}

						const blockContent = nextLines.join("\n");
						if (blockContent === source) {
							break;
						}
					}
				} else if (line.startsWith("```") && inCodeBlock) {
					inCodeBlock = false;
				}
			}

			const codeCells = notebook.cells.filter(
				(c: { cell_type: string }) => c.cell_type === "code"
			);

			if (
				currentBlockIndex >= 0 &&
				currentBlockIndex < codeCells.length
			) {
				const cell = codeCells[currentBlockIndex];
				this.renderOutputs(outputSection, cell.outputs || []);
			} else {
				outputSection.empty();
				outputSection.createEl("div", {
					text: "No outputs found",
					cls: "jupymd-no-output",
				});
			}
		} catch (err) {
			console.error("Error loading outputs:", err);
			outputSection.empty();
			outputSection.createEl("div", {
				text: "Error loading outputs",
				cls: "jupymd-error",
			});
		}
	}
}
