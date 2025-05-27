import {promises as fs} from "fs";
import * as path from "path";
import {FileSystemAdapter, TFile, Editor} from "obsidian";
import {CodeBlock} from "../components/types";

export function getAbsolutePath(file: TFile): string {
	const adapter = this.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const vaultPath = adapter.getBasePath();
		return path.join(vaultPath, file.path);
	} else {
		throw new Error("Cannot get base path: unsupported adapter type.");
	}
}

export function getCellIndex(editor: Editor | undefined, codeBlock: CodeBlock) {
	// @ts-ignore
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
	return cellIndex;
}

export async function isNotebookPaired(file: any): Promise<boolean> {
	const mdPath = getAbsolutePath(file);
	const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

	try {
		await fs.access(ipynbPath, fs.constants.F_OK);
		return true;
	} catch (error) {
		return false;
	}
}
