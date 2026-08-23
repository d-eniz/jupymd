import {execFile} from "child_process";
import {promisify} from "util";
import {App} from "obsidian";
import {KernelConnection} from "../kernels/types";
import {
	formatPythonEnvironmentLabel,
	getPythonEnvironmentInfo,
} from "../utils/pythonEnvironmentDiscovery";
import {languageSupportRegistry, RuntimeVersionProbe} from "./LanguageSupport";

const execFileAsync = promisify(execFile);

function getProbeExecutable(kernel: KernelConnection, probe: RuntimeVersionProbe): string | null {
	if (probe.executable !== "kernel") return probe.executable;
	return kernel.spec.argv[0] || null;
}

async function probeRuntimeVersion(kernel: KernelConnection): Promise<string | null> {
	const languageModule = languageSupportRegistry.getModuleForKernelLanguage(kernel.language);
	if (!languageModule) return null;

	for (const probe of languageModule.runtimeVersionProbes || []) {
		const executable = getProbeExecutable(kernel, probe);
		if (!executable) continue;

		try {
			const {stdout, stderr} = await execFileAsync(executable, probe.args, {
				env: {...process.env, ...(kernel.spec.env || {})},
				timeout: 3000,
			});
			const match = `${stdout}\n${stderr}`.match(probe.pattern);
			if (match?.[1]) return `${probe.prefix || ""}${match[1]}`;
		} catch {
			// Try the next module-defined probe before falling back to the kernelspec label.
		}
	}

	return null;
}

export async function getKernelStatusLabel(app: App, kernel: KernelConnection): Promise<string> {
	const languageModule = languageSupportRegistry.getModuleForKernelLanguage(kernel.language);
	if (!languageModule) return kernel.displayName;

	if (languageModule.id === "python") {
		const interpreter = kernel.interpreterPath || kernel.spec.argv[0];
		if (!interpreter) return kernel.displayName;

		const environment = await getPythonEnvironmentInfo(app, interpreter);
		return environment
			? formatPythonEnvironmentLabel(environment.label, environment.version)
			: kernel.displayName;
	}

	const version = await probeRuntimeVersion(kernel);
	return version ? `${languageModule.displayName} (${version})` : kernel.displayName;
}
