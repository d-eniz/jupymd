import {execFile} from "child_process";
import {promisify} from "util";
import * as path from "path";
import * as fs from "fs";
import {App, FileSystemAdapter, TFile, TAbstractFile, Notice} from "obsidian";
import upgradeNotebookSource from "../notebook/upgradeNotebook.py";

const execFileAsync = promisify(execFile);

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

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function runJupytext(pythonPath: string, args: string[]): Promise<void> {
		return new Promise((resolve, reject) => {
			execFile(
				pythonPath,
				["-m", "jupytext", ...args],
				(error, stdout, stderr) => {
					if (error) {
						console.error(stderr || error.message);
						reject(error instanceof Error ? error : new Error(String(error)));
						return;
					}
					resolve();
				}
			);
		});
	}

export async function upgradeLegacyNotebook(
	pythonPath: string,
	notebookPath: string
): Promise<boolean> {
	const rawNotebook = await fs.promises.readFile(notebookPath, "utf-8");
	const notebook = JSON.parse(rawNotebook) as {nbformat?: unknown};
	if (typeof notebook.nbformat !== "number" || notebook.nbformat >= 4) return false;

	try {
		await execFileAsync(
			pythonPath,
			["-c", upgradeNotebookSource, notebookPath],
			{env: {...process.env, PYTHONIOENCODING: "UTF-8"}}
		);
		return true;
	} catch (error: unknown) {
		const processError = error as Error & {stderr?: string};
		const details = processError.stderr?.trim() || getErrorMessage(error);
		throw new Error(`Failed to upgrade legacy notebook to format v4: ${details}`);
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

export async function installLibs(interpreter: string, libraries: string): Promise<boolean> {
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
