import {App, Notice, Platform} from "obsidian";
import * as path from "path";
import * as fs from "fs/promises";
import {exec} from "child_process";
import {promisify} from "util";
import { installLibs } from "./helpers";
import JupyMDPlugin from "../main";
import {getDefaultPythonPath} from "./pythonPathUtils";

const execAsync = promisify(exec);

export async function runQuickSetup(
	app: App,
	plugin: JupyMDPlugin,
	basePythonPath?: string,
	envNameInput?: string
): Promise<boolean> {
	const adapter = app.vault.adapter as any;
	if (!adapter.getBasePath) {
		new Notice("Quick setup is only supported on local file systems.");
		return false;
	}

	const basePath = adapter.getBasePath();
	let envName = envNameInput?.trim() || ".jupymd";
	envName = envName.startsWith(".") ? envName : `.${envName}`;
	const venvPath = path.join(basePath, envName);

	new Notice("Creating virtual environment... Please wait.");

	try {
		const basePython = basePythonPath?.trim()
			|| plugin.settings.pythonInterpreter
			|| getDefaultPythonPath();

		await execAsync(`"${basePython}" -m venv "${venvPath}"`);

		const venvPythonPath = Platform.isWin
			? path.join(venvPath, "Scripts", "python.exe")
			: path.join(venvPath, "bin", "python");

		try {
			await fs.access(venvPythonPath);
		} catch {
			throw new Error("Could not locate Python in the newly created virtual environment.");
		}

		new Notice("Installing libraries...");
		await installLibs(venvPythonPath, "jupytext matplotlib")

		await plugin.updateInterpreter(venvPythonPath);

		new Notice(`Quick setup complete! Virtual environment '${envName}' created successfully.`);
		return true;
	} catch (error: any) {
		console.error("Quick setup failed:", error);
		new Notice(`Quick setup failed: ${error.message || error}`);
		return false;
	}
}
