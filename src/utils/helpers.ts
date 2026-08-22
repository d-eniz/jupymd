import {execFile} from "child_process";
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

export async function runJupytext(pythonPath: string, args: string[]): Promise<void> {
		return new Promise((resolve, reject) => {
			execFile(
				pythonPath,
				["-m", "jupytext", ...args],
				(error, stdout, stderr) => {
					if (error) {
						console.error(stderr || error.message);
						reject(error);
						return;
					}
					resolve();
				}
			);
		});
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

export async function installLibs(interpreter: string, libraries: string): Promise<boolean> {
	const execFileAsync = promisify(execFile);
	const packages = libraries.split(/\s+/).map((item) => item.trim()).filter(Boolean);

	try {
		const {stderr} = await execFileAsync(interpreter, ["-m", "pip", "install", ...packages]);

		new Notice(`Required libraries installed for ${interpreter}`)

		if (stderr) {
			new Notice("Warnings issued for installation, check console for details.");
			console.error(stderr)
		}
		return true;
	} catch (err) {
		new Notice("Failed to install packages, check console for details.")
		console.error(err)
		return false;
	}
}
