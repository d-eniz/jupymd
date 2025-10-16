import {promises as fs} from "fs";
import {exec} from "child_process";
import {promisify} from "util";
import * as path from "path";
import {FileSystemAdapter, TFile, Notice} from "obsidian";

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
	const absPath = getAbsolutePath(file);
	let targetPath: string;

	if (absPath.endsWith(".md")) {
		targetPath = absPath.replace(/\.md$/, ".ipynb");
	} else if (absPath.endsWith(".ipynb")) {
		targetPath = absPath.replace(/\.ipynb$/, ".md");
	} else {
		return false;
	}

	try {
		await fs.access(targetPath, fs.constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

export async function installLibs(interpreter: string, libraries: string): Promise<void> {

	const execAsync = promisify(exec)
	const command = `${interpreter} -m pip install ${libraries}`

	try {
		const {stdout, stderr} = await execAsync(command)

		new Notice(`Required libraries installed for ${interpreter}`)

		if (stderr) {
			new Notice("Warnings issued for installation, check console for details.");
			console.error(stderr)
		} 
	} 
	catch(err) {
		new Notice("Failed to install packages, check console for details.")
		console.error(err)
	}
}
