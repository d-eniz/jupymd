import {exec} from "child_process";
import {promisify} from "util";
import * as path from "path";
import * as fs from "fs";
import {App, FileSystemAdapter, TFile, TAbstractFile, Notice} from "obsidian";

export function getAbsolutePath(file: TAbstractFile): string {
	if (!file) return "";

	const adapter = file.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		const vaultPath = adapter.getBasePath();
		return path.join(vaultPath, file.path);
	} else {
		throw new Error("Cannot get base path: unsupported adapter type.");
	}
}

export async function isNotebookPaired(app: App, file: TFile): Promise<boolean> {
	if (!file) return false;

	const mdPath = getAbsolutePath(file);
	if (!mdPath) return false;

	const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");

	if (!fs.existsSync(ipynbPath)) {
		return false;
	}

	const cache = app.metadataCache.getFileCache(file);
	const frontmatter = cache?.frontmatter;

	return !!(frontmatter && (frontmatter.jupyter !== undefined || frontmatter.jupytext !== undefined));
}

export async function installLibs(interpreter: string, libraries: string): Promise<void> {

	const execAsync = promisify(exec)
	const command = `${shellQuote(interpreter)} -m pip install ${libraries}`

	try {
		const {stdout, stderr} = await execAsync(command)

		new Notice(`Required libraries installed for ${interpreter}`)

		if (stderr) {
			new Notice("Warnings issued for installation, check console for details.");
			console.error(stderr)
		}
	} catch (err) {
		new Notice("Failed to install packages, check console for details.")
		console.error(err)
	}
}

function shellQuote(path: string): string {
	return `"${path.replace(/(["\\$`])/g, '\\$1')}"`;
}
