import { App, TFile, FileSystemAdapter } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-python";
import { CodeExecutor } from "./CodeExecutor";
import { CodeBlock } from "./types";
import JupyMDPlugin from "../main";


type JupyterOutput = {
	output_type: string;
	name?: string;
	text?: string | string[];
	data?: {
		"text/plain"?: string | string[];
		"image/png"?: string;
	};
};

type JupyterCell = {
	cell_type: string;
	source: string | string[];
	outputs?: JupyterOutput[];
};

type JupyterNotebook = {
	cells: JupyterCell[];
};

function normalizeText(text: string | string[] | undefined): string {
	if (!text) return "";
	return Array.isArray(text) ? text.join("") : text;
}

function getAbsolutePathForFile(app: App, file: TFile): string {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const vaultPath = adapter.getBasePath();
		return path.join(vaultPath, file.path);
	}
	throw new Error("Cannot get base path: unsupported adapter type.");
}

async function checkNotebookPaired(app: App, file: TFile): Promise<boolean> {
	try {
		const absPath = getAbsolutePathForFile(app, file);
		const ipynbPath = absPath.replace(/\.md$/, ".ipynb");
		await fs.access(ipynbPath);
		return true;
	} catch {
		return false;
	}
}

async function getNotebookOutputs(
	app: App,
	file: TFile,
	cellIndex: number
): Promise<{ textOutput: string; images: string[] } | null> {
	try {
		const absPath = getAbsolutePathForFile(app, file);
		const ipynbPath = absPath.replace(/\.md$/, ".ipynb");

		const raw = await fs.readFile(ipynbPath, "utf-8");
		const notebook: JupyterNotebook = JSON.parse(raw);
		const codeCells = notebook.cells.filter((c) => c.cell_type === "code");

		if (cellIndex >= codeCells.length) {
			return null;
		}

		const cell = codeCells[cellIndex];
		if (!cell.outputs || cell.outputs.length === 0) {
			return null;
		}

		const textLines: string[] = [];
		const images: string[] = [];

		for (const out of cell.outputs) {
			if (out.output_type === "stream") {
				const text = normalizeText(out.text);
				if (text.trim()) {
					textLines.push(text.trimEnd());
				}
			} else if (out.output_type === "execute_result" && out.data?.["text/plain"]) {
				const text = normalizeText(out.data["text/plain"]);
				if (text.trim()) {
					textLines.push(text.trimEnd());
				}
			} else if (
				(out.output_type === "display_data" || out.output_type === "execute_result") &&
				out.data?.["image/png"]
			) {
				images.push(out.data["image/png"]);
			}
		}

		return {
			textOutput: textLines.join("\n"),
			images,
		};
	} catch {
		return null;
	}
}

function createRunIcon(): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", "24");
	svg.setAttribute("height", "24");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.classList.add("icon", "grey-icon");

	const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
	polygon.setAttribute("points", "5 3 19 12 5 21 5 3");
	svg.appendChild(polygon);

	return svg;
}

function createLoadIcon(): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", "24");
	svg.setAttribute("height", "24");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.classList.add("icon", "grey-icon", "spinning");

	const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
	circle.setAttribute("cx", "12");
	circle.setAttribute("cy", "12");
	circle.setAttribute("r", "10");
	circle.setAttribute("fill", "none");
	svg.appendChild(circle);

	return svg;
}

function createClearIcon(): SVGSVGElement {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", "24");
	svg.setAttribute("height", "24");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.classList.add("icon", "grey-icon");

	const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
	polyline.setAttribute("points", "3 6 5 6 21 6");
	svg.appendChild(polyline);

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2");
	svg.appendChild(path);

	const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line1.setAttribute("x1", "10");
	line1.setAttribute("y1", "11");
	line1.setAttribute("x2", "10");
	line1.setAttribute("y2", "17");
	svg.appendChild(line1);

	const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
	line2.setAttribute("x1", "14");
	line2.setAttribute("y1", "11");
	line2.setAttribute("x2", "14");
	line2.setAttribute("y2", "17");
	svg.appendChild(line2);

	return svg;
}

function renderOutputs(
	outputContainer: HTMLElement,
	outputs: { textOutput: string; images: string[] } | null
): boolean {
	outputContainer.empty();

	if (!outputs || (!outputs.textOutput && outputs.images.length === 0)) {
		outputContainer.style.display = "none";
		return false;
	}

	outputContainer.style.display = "block";

	if (outputs.textOutput) {
		const textDiv = outputContainer.createDiv({ cls: "text-output" });
		textDiv.textContent = outputs.textOutput;
	}

	for (const imgData of outputs.images) {
		const img = outputContainer.createEl("img", {
			attr: {
				src: `data:image/png;base64,${imgData}`,
				alt: "Cell output",
			},
		});
		img.style.maxWidth = "100%";
	}

	return true;
}

export async function renderStaticCodeBlock(
	app: App,
	file: TFile | null,
	source: string,
	cellIndex: number,
	el: HTMLElement,
	executor: CodeExecutor,
	plugin: JupyMDPlugin
): Promise<void> {
	el.empty();
	el.addClass("jupymd-static-block");

	const container = el.createDiv({ cls: "code-container" });

	// Top bar
	const topBar = container.createDiv({ cls: "code-top-bar" });

	// Check if paired
	const isPaired = file ? await checkNotebookPaired(app, file) : false;
	const filePath = file ? getAbsolutePathForFile(app, file) : null;

	// Buttons container (left side)
	const buttonsDiv = topBar.createDiv({ cls: "code-buttons" });

	// Output container (created early so we can reference it)
	const outputPre = container.createEl("pre", { cls: "code-output" });
	outputPre.style.display = "none";

	let hasOutput = false;

	// Render initial outputs
	if (file && isPaired) {
		const outputs = await getNotebookOutputs(app, file, cellIndex);
		hasOutput = renderOutputs(outputPre, outputs);
	}

	// Run button
	let runButton: HTMLButtonElement | null = null;
	let clearButton: HTMLButtonElement | null = null;

	if (isPaired) {
		runButton = buttonsDiv.createEl("button", { cls: "icon-button" });
		runButton.appendChild(createRunIcon());

		// Clear button (only shown when there's output)
		clearButton = buttonsDiv.createEl("button", { cls: "icon-button" });
		clearButton.appendChild(createClearIcon());
		clearButton.style.display = hasOutput ? "inline-flex" : "none";

		let isLoading = false;

		runButton.addEventListener("click", async () => {
			if (!executor || !filePath || isLoading) return;

			isLoading = true;
			runButton!.empty();
			runButton!.appendChild(createLoadIcon());
			runButton!.disabled = true;

			try {
				const codeBlock: CodeBlock = {
					code: source,
					cellIndex: cellIndex,
				};

				await executor.executeCodeBlock(codeBlock);

				// Wait a bit for notebook to be updated
				await new Promise((resolve) => setTimeout(resolve, 150));

				// Refresh outputs
				if (file) {
					const outputs = await getNotebookOutputs(app, file, cellIndex);
					hasOutput = renderOutputs(outputPre, outputs);
					clearButton!.style.display = hasOutput ? "inline-flex" : "none";

					// Force update modification time
					await fs.utimes(filePath, new Date(), new Date());
				}
			} catch (err) {
				console.error("Error executing code:", err);
			} finally {
				isLoading = false;
				runButton!.empty();
				runButton!.appendChild(createRunIcon());
				runButton!.disabled = false;
			}
		});

		clearButton.addEventListener("click", async () => {
			if (!filePath) return;

			try {
				const ipynbPath = filePath.replace(/\.md$/, ".ipynb");
				const raw = await fs.readFile(ipynbPath, "utf-8");
				const notebook = JSON.parse(raw);
				const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

				if (cells.length > cellIndex && cells[cellIndex]) {
					cells[cellIndex].outputs = [];
					await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));

					// Clear displayed output
					hasOutput = false;
					outputPre.empty();
					outputPre.style.display = "none";
					clearButton!.style.display = "none";
				}
			} catch (err) {
				console.error("Error clearing outputs:", err);
			}
		});
	}

	// Empty spacer if no buttons
	if (!isPaired) {
		topBar.createDiv();
	}

	// Language label (right side)
	topBar.createDiv({ cls: "code-lang-label", text: "Python" });

	// Syntax-highlighted code block
	const pre = container.createEl("pre", { cls: "language-python" });
	const code = pre.createEl("code", { cls: "language-python" });

	try {
		const highlighted = highlight(source, languages.python, "python");
		code.innerHTML = highlighted;
	} catch {
		code.textContent = source;
	}

	// Move output container after code
	container.appendChild(outputPre);
}
