import * as path from "path";
import * as fs from "fs";
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
	source?: "pyenv";
};

export function formatKernelLabel(label: string, version: string): string {
	return version && version !== "unknown" ? `${label} (${version})` : label;
}

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
	type: "venv" | "system",
	source?: KernelInfo["source"]
): Promise<KernelInfo | null> {
	const valid = await validatePythonPath(pythonPath);
	if (!valid) return null;

	const version = await getPythonVersion(pythonPath);
	return {label, path: pythonPath, version, type, source};
}

export async function getInterpreterInfo(app: App, interpreter: string): Promise<KernelInfo | null> {
	const kernels = await discoverKernels(app);
	const match = kernels.find((kernel) => kernel.path === interpreter);
	if (match) {
		return match;
	}

	const label = path.isAbsolute(interpreter) ? path.basename(interpreter) || interpreter : interpreter;
	return probeInterpreter(interpreter, label, "system");
}

function getVenvPythonPath(envDir: string): string {
	return Platform.isWin
		? path.join(envDir, "Scripts", "python.exe")
		: path.join(envDir, "bin", "python");
}

function getPyenvRoots(): string[] {
	const homeDir = process.env.HOME || process.env.USERPROFILE || "";
	const roots = Platform.isWin
		? [
			process.env.PYENV_ROOT || "",
			path.join(homeDir, ".pyenv", "pyenv-win"),
			path.join(homeDir, ".pyenv"),
		]
		: [
			process.env.PYENV_ROOT || "",
			path.join(homeDir, ".pyenv"),
		];

	return Array.from(new Set(roots.filter(Boolean)));
}

function getPyenvVersionPythonPath(versionDir: string): string {
	return Platform.isWin
		? path.join(versionDir, "python.exe")
		: path.join(versionDir, "bin", "python");
}

function getPyenvInterpreterCandidates(): string[] {
	const candidates: string[] = [];

	for (const pyenvRoot of getPyenvRoots()) {
		candidates.push(
			path.join(pyenvRoot, "shims", "python"),
			path.join(pyenvRoot, "shims", "python3")
		);

		const versionsDir = path.join(pyenvRoot, "versions");
		if (!fs.existsSync(versionsDir)) {
			continue;
		}

		try {
			const versionEntries = fs.readdirSync(versionsDir, {withFileTypes: true});
			for (const entry of versionEntries) {
				if (!entry.isDirectory()) {
					continue;
				}

				candidates.push(getPyenvVersionPythonPath(path.join(versionsDir, entry.name)));
			}
		} catch {
			//
		}
	}

	return Array.from(new Set(candidates));
}

function isPyenvInterpreterCandidate(candidate: string): boolean {
	if (!path.isAbsolute(candidate)) {
		return false;
	}

	return getPyenvRoots().some((pyenvRoot) => {
		const shimsDir = path.join(pyenvRoot, "shims");
		const versionsDir = path.join(pyenvRoot, "versions");
		return candidate.startsWith(`${shimsDir}${path.sep}`) || candidate.startsWith(`${versionsDir}${path.sep}`);
	});
}

async function discoverVenvs(app: App): Promise<KernelInfo[]> {
	const basePath = getVaultBasePath(app);
	if (!basePath) return [];

	const results: KernelInfo[] = [];

	try {
		const entries = fs.readdirSync(basePath, {withFileTypes: true});
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.startsWith(".")) {
				continue;
			}

			const envDir = path.join(basePath, entry.name);
			const pyvenvCfgPath = path.join(envDir, "pyvenv.cfg");
			if (!fs.existsSync(pyvenvCfgPath)) {
				continue;
			}

			const pythonPath = getVenvPythonPath(envDir);
			const result = await probeInterpreter(pythonPath, entry.name, "venv");
			if (result) {
				results.push(result);
			}
		}
	} catch {
		return [];
	}

	return results;
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

	return Array.from(new Set([
		...candidates,
		...getPyenvInterpreterCandidates(),
	]));
}

async function discoverGlobalInterpreters(): Promise<KernelInfo[]> {
	const results: KernelInfo[] = [];

	for (const candidate of getGlobalInterpreterCandidates()) {
		const label = path.isAbsolute(candidate) ? path.basename(candidate) : candidate;
		const source = isPyenvInterpreterCandidate(candidate) ? "pyenv" : undefined;
		const result = await probeInterpreter(candidate, label, "system", source);
		if (result) {
			results.push(result);
		}
	}

	return results;
}

export async function discoverKernels(app: App): Promise<KernelInfo[]> {
	const [venvs, globals] = await Promise.all([
		discoverVenvs(app),
		discoverGlobalInterpreters(),
	]);

	return [
		...venvs,
		...globals,
	];
}
