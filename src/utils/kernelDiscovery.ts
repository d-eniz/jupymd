import * as path from "path";
import {exec} from "child_process";
import {promisify} from "util";
import {App, FileSystemAdapter, Platform} from "obsidian";
import {validatePythonPath} from "./pythonPathUtils";

const execAsync = promisify(exec);

export type KernelInfo = {
	label: string;
	path: string;
	version: string;
	type: "venv" | "system";
};

function getVaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return null;
}

async function getPythonVersion(pythonPath: string): Promise<string> {
	try {
		const {stdout, stderr} = await execAsync(`"${pythonPath}" --version`, {timeout: 3000});
		const output = (stdout || stderr).trim();
		const match = output.match(/Python\s+(\S+)/i);
		return match ? match[1] : "unknown";
	} catch {
		return "unknown";
	}
}

async function probeInterpreter(
	pythonPath: string,
	label: string,
	type: "venv" | "system"
): Promise<KernelInfo | null> {
	const valid = await validatePythonPath(pythonPath);
	if (!valid) return null;

	const version = await getPythonVersion(pythonPath);
	return {label, path: pythonPath, version, type};
}

async function discoverVaultVenv(app: App): Promise<KernelInfo[]> {
	const basePath = getVaultBasePath(app);
	if (!basePath) return [];

	const pythonBin = Platform.isWin
		? path.join(basePath, ".jupymd", "Scripts", "python.exe")
		: path.join(basePath, ".jupymd", "bin", "python");

	const result = await probeInterpreter(pythonBin, ".jupymd (vault venv)", "venv");
	return result ? [result] : [];
}

function getGlobalInterpreterCandidates(): string[] {
	const candidates = Platform.isWin
		? [
			"python",
			"python3",
			path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "python.exe"),
			path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
		]
		: [
			"python3",
			"python",
			"/usr/bin/python3",
			"/usr/local/bin/python3",
			"/bin/python3",
			"/usr/bin/python",
			"/usr/local/bin/python",
			"/opt/homebrew/bin/python3",
			"/opt/homebrew/bin/python",
		];

	return candidates;
}

async function discoverGlobalInterpreters(): Promise<KernelInfo[]> {
	const results: KernelInfo[] = [];

	for (const candidate of getGlobalInterpreterCandidates()) {
		const label = path.isAbsolute(candidate) ? path.basename(candidate) : candidate;
		const result = await probeInterpreter(candidate, label, "system");
		if (result) {
			results.push(result);
		}
	}

	return results;
}

export async function discoverKernels(app: App): Promise<KernelInfo[]> {
	const [vaultVenv, globals] = await Promise.all([
		discoverVaultVenv(app),
		discoverGlobalInterpreters(),
	]);

	return [
		...vaultVenv,
		...globals,
	];
}