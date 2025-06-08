import {promises as fs} from "fs";
import * as path from "path";
import {FileSystemAdapter, TFile} from "obsidian";

export function getAbsolutePath(file: TFile): string {
	const adapter = this.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const vaultPath = adapter.getBasePath();
		return path.join(vaultPath, file.path);
	} else {
		throw new Error("Cannot get base path: unsupported adapter type.");
	}
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
