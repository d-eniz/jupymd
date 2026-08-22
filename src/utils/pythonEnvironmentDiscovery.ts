import * as path from "path";
import * as fs from "fs";
import {execFile} from "child_process";
import {promisify} from "util";
import {App, FileSystemAdapter, Platform} from "obsidian";
import {validatePythonPath} from "./pythonPathUtils";

const execFileAsync = promisify(execFile);

export type PythonEnvironmentInfo = {
	label: string;
	path: string;
	version: string;
	type: "venv" | "system";
	source?: "pyenv";
};

export function formatPythonEnvironmentLabel(label: string, version: string): string {
	return version && version !== "unknown" ? `${label} (${version})` : label;
}

function getVaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

async function getPythonVersion(pythonPath: string): Promise<string> {
	try {
		const {stdout, stderr} = await execFileAsync(pythonPath, ["--version"], {timeout: 3000});
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
	source?: PythonEnvironmentInfo["source"]
): Promise<PythonEnvironmentInfo | null> {
	if (!await validatePythonPath(pythonPath)) return null;
	return {
		label,
		path: pythonPath,
		version: await getPythonVersion(pythonPath),
		type,
		source,
	};
}

export async function getPythonEnvironmentInfo(
	app: App,
	interpreter: string
): Promise<PythonEnvironmentInfo | null> {
	const environments = await discoverPythonEnvironments(app);
	const match = environments.find((environment) => environment.path === interpreter);
	if (match) return match;

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
		if (!fs.existsSync(versionsDir)) continue;

		try {
			for (const entry of fs.readdirSync(versionsDir, {withFileTypes: true})) {
				if (entry.isDirectory()) {
					candidates.push(getPyenvVersionPythonPath(path.join(versionsDir, entry.name)));
				}
			}
		} catch {
			// Ignore unreadable pyenv roots.
		}
	}

	return Array.from(new Set(candidates));
}

function isPyenvInterpreterCandidate(candidate: string): boolean {
	if (!path.isAbsolute(candidate)) return false;

	return getPyenvRoots().some((pyenvRoot) => {
		const shimsDir = path.join(pyenvRoot, "shims");
		const versionsDir = path.join(pyenvRoot, "versions");
		return candidate.startsWith(`${shimsDir}${path.sep}`) || candidate.startsWith(`${versionsDir}${path.sep}`);
	});
}

async function discoverVenvs(app: App): Promise<PythonEnvironmentInfo[]> {
	const basePath = getVaultBasePath(app);
	if (!basePath) return [];

	const results: PythonEnvironmentInfo[] = [];
	try {
		for (const entry of fs.readdirSync(basePath, {withFileTypes: true})) {
			if (!entry.isDirectory() || !entry.name.startsWith(".")) continue;

			const envDir = path.join(basePath, entry.name);
			if (!fs.existsSync(path.join(envDir, "pyvenv.cfg"))) continue;

			const result = await probeInterpreter(getVenvPythonPath(envDir), entry.name, "venv");
			if (result) results.push(result);
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

	return Array.from(new Set([...candidates, ...getPyenvInterpreterCandidates()]));
}

async function discoverGlobalInterpreters(): Promise<PythonEnvironmentInfo[]> {
	const results: PythonEnvironmentInfo[] = [];
	for (const candidate of getGlobalInterpreterCandidates()) {
		const label = path.isAbsolute(candidate) ? path.basename(candidate) : candidate;
		const source = isPyenvInterpreterCandidate(candidate) ? "pyenv" : undefined;
		const result = await probeInterpreter(candidate, label, "system", source);
		if (result) results.push(result);
	}
	return results;
}

export async function discoverPythonEnvironments(app: App): Promise<PythonEnvironmentInfo[]> {
	const [venvs, globals] = await Promise.all([
		discoverVenvs(app),
		discoverGlobalInterpreters(),
	]);
	return [...venvs, ...globals];
}
