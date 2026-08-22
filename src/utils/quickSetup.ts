import {App, Notice, Platform} from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import {execFile} from "child_process";
import {promisify} from "util";
import { installLibs } from "./helpers";
import {getDefaultPythonPath} from "./pythonPathUtils";

const execFileAsync = promisify(execFile);

export async function runQuickSetup(
	app: App,
	basePythonPath?: string,
	envNameInput?: string,
	packages = "ipykernel"
): Promise<string | null> {
	const adapter = app.vault.adapter as any;
	if (!adapter.getBasePath) {
		new Notice("Quick setup is only supported on local file systems.");
		return null;
	}

	const basePath = adapter.getBasePath();
	let envName = envNameInput?.trim() || ".jupymd";
	envName = envName.startsWith(".") ? envName : `.${envName}`;
	const venvPath = path.join(basePath, envName);

	new Notice("Creating virtual environment... Please wait.");

	try {
		const basePython = basePythonPath?.trim()
			|| getDefaultPythonPath();

		await execFileAsync(basePython, ["-m", "venv", venvPath]);

		const venvPythonPath = Platform.isWin
			? path.join(venvPath, "Scripts", "python.exe")
			: path.join(venvPath, "bin", "python");

		try {
			await fs.access(venvPythonPath);
		} catch {
			throw new Error("Could not locate Python in the newly created virtual environment.");
		}

		if (packages.trim()) {
			new Notice("Installing libraries...");
			if (!await installLibs(venvPythonPath, packages)) {
				throw new Error(`Failed to install required packages: ${packages}`);
			}
		}

		new Notice(`Quick setup complete! Virtual environment '${envName}' created successfully.`);
		return venvPythonPath;
	} catch (error: any) {
		console.error("Quick setup failed:", error);
		new Notice(`Quick setup failed: ${error.message || error}`);
		return null;
	}
}
