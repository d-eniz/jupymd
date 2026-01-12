import { App, TFile, Notice } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import { getAbsolutePath } from "../utils/helpers";

const OUTPUT_START_MARKER = "<!-- jupymd:output:start -->";
const OUTPUT_END_MARKER = "<!-- jupymd:output:end -->";

interface JupyterOutput {
	output_type: string;
	name?: string;
	text?: string | string[];
	data?: {
		"text/plain"?: string | string[];
		"image/png"?: string;
	};
	metadata?: Record<string, unknown>;
}

interface JupyterCell {
	cell_type: string;
	source: string | string[];
	outputs?: JupyterOutput[];
	execution_count?: number;
	metadata?: Record<string, unknown>;
}

interface JupyterNotebook {
	cells: JupyterCell[];
	metadata?: Record<string, unknown>;
	nbformat?: number;
	nbformat_minor?: number;
}

function normalizeText(text: string | string[] | undefined): string {
	if (!text) return "";
	return Array.isArray(text) ? text.join("") : text;
}

function outputsToMarkdown(outputs: JupyterOutput[]): { text: string; images: string[] } {
	const textLines: string[] = [];
	const images: string[] = [];

	for (const out of outputs) {
		if (out.output_type === "stream") {
			const text = normalizeText(out.text);
			if (text.trim()) {
				textLines.push(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd());
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
		text: textLines.join("\n"),
		images,
	};
}

function buildOutputBlock(text: string, images: string[]): string[] {
	const lines: string[] = [];
	lines.push(OUTPUT_START_MARKER);

	if (text) {
		lines.push("```output");
		lines.push(text);
		lines.push("```");
	}

	for (const imgData of images) {
		lines.push(`![](data:image/png;base64,${imgData})`);
	}

	lines.push(OUTPUT_END_MARKER);
	return lines;
}

export async function bakeOutputsForFile(app: App, file: TFile): Promise<void> {
	const absPath = getAbsolutePath.call({ app }, file);
	const ipynbPath = absPath.replace(/\.md$/, ".ipynb");

	let notebookRaw: string;
	try {
		notebookRaw = await fs.readFile(ipynbPath, "utf-8");
	} catch {
		throw new Error(`No paired notebook found at ${ipynbPath}`);
	}

	const notebook: JupyterNotebook = JSON.parse(notebookRaw);
	const codeCells = notebook.cells.filter((c) => c.cell_type === "code");

	const md = await app.vault.read(file);
	const lines = md.split("\n");
	const outLines: string[] = [];

	let i = 0;
	let pythonBlockIndex = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Check for start of python code block
		if (line.trim().startsWith("```python")) {
			outLines.push(line);
			i++;

			// Copy the code block content through the closing fence
			while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
				outLines.push(lines[i]);
				i++;
			}

			// Add closing fence
			if (i < lines.length) {
				outLines.push(lines[i]);
				i++;
			}

			// Skip any existing jupymd output region immediately after
			if (i < lines.length && lines[i].trim() === OUTPUT_START_MARKER) {
				i++; // skip start marker
				while (i < lines.length && lines[i].trim() !== OUTPUT_END_MARKER) {
					i++;
				}
				if (i < lines.length) {
					i++; // skip end marker
				}
			}

			// Insert fresh output if cell has outputs
			const cell = codeCells[pythonBlockIndex];
			pythonBlockIndex++;

			if (cell?.outputs && cell.outputs.length > 0) {
				const { text, images } = outputsToMarkdown(cell.outputs);
				if (text || images.length > 0) {
					const outputBlock = buildOutputBlock(text, images);
					outLines.push(...outputBlock);
				}
			}

			continue;
		}

		// Regular line, just copy through
		outLines.push(line);
		i++;
	}

	const newMd = outLines.join("\n");
	await app.vault.modify(file, newMd);
}

export async function clearBakedOutputs(app: App, file: TFile): Promise<void> {
	const md = await app.vault.read(file);
	const lines = md.split("\n");
	const outLines: string[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		if (line.trim() === OUTPUT_START_MARKER) {
			// Skip until end marker
			i++;
			while (i < lines.length && lines[i].trim() !== OUTPUT_END_MARKER) {
				i++;
			}
			if (i < lines.length) {
				i++; // skip end marker
			}
			continue;
		}

		outLines.push(line);
		i++;
	}

	const newMd = outLines.join("\n");
	await app.vault.modify(file, newMd);
}
