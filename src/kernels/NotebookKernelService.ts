import * as fs from "fs/promises";
import * as path from "path";
import {execFile} from "child_process";
import {promisify} from "util";
import {JupyterBridgeClient} from "../bridge/JupyterBridgeClient";
import {KernelConnection, KernelExecutionResult} from "./types";
import {ManagedKernelSpecStore} from "./ManagedKernelSpecStore";
import {parseNotebook} from "../components/types";

const execFileAsync = promisify(execFile);

export class NotebookKernelService {
	constructor(
		private readonly bridge: JupyterBridgeClient,
		private readonly managedSpecs: ManagedKernelSpecStore
	) {}

	async listKernels(): Promise<KernelConnection[]> {
		return this.bridge.listKernels();
	}

	async resolveKernelForNote(notePath: string): Promise<KernelConnection | null> {
		const ipynbPath = notePath.replace(/\.md$/, ".ipynb");
		let notebook;
		try {
			notebook = parseNotebook(await fs.readFile(ipynbPath, "utf-8"));
		} catch {
			return null;
		}

		const kernelName = notebook?.metadata?.kernelspec?.name;
		if (!kernelName) return null;

		const kernels = await this.listKernels();
		return kernels.find((kernel) => kernel.name.toLowerCase() === String(kernelName).toLowerCase()) || null;
	}

	async setKernelForNote(notePath: string, kernel: KernelConnection): Promise<void> {
		const ipynbPath = notePath.replace(/\.md$/, ".ipynb");
		const notebook = parseNotebook(await fs.readFile(ipynbPath, "utf-8"));
		notebook.metadata = notebook.metadata || {};
		notebook.metadata.kernelspec = {
			display_name: kernel.displayName,
			language: kernel.language,
			name: kernel.name,
		};
		await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2), "utf-8");
		await this.bridge.shutdown(notePath).catch(() => undefined);
	}

	async preparePythonEnvironment(pythonPath: string, label?: string): Promise<KernelConnection> {
		await execFileAsync(pythonPath, ["-c", "import ipykernel"], {timeout: 5000});
		const {stdout} = await execFileAsync(
			pythonPath,
			["-c", "import sys; print(sys.executable)"],
			{timeout: 5000}
		);
		const resolvedPath = path.resolve(stdout.trim() || pythonPath);
		let kernels = await this.listKernels();
		let matchingKernel = kernels.find((kernel) =>
			kernel.interpreterPath && path.resolve(kernel.interpreterPath) === resolvedPath
		);
		if (matchingKernel) return matchingKernel;

		await this.managedSpecs.ensurePythonKernel(resolvedPath, label);
		kernels = await this.listKernels();
		matchingKernel = kernels.find((kernel) =>
			kernel.interpreterPath && path.resolve(kernel.interpreterPath) === resolvedPath
		);
		if (!matchingKernel) {
			throw new Error("The Python kernel was created but could not be discovered.");
		}
		return matchingKernel;
	}

	async execute(notePath: string, code: string): Promise<KernelExecutionResult> {
		const kernel = await this.resolveKernelForNote(notePath);
		if (!kernel) {
			throw new Error("No usable Jupyter kernel is selected for this notebook.");
		}
		return this.bridge.execute(notePath, kernel.name, path.dirname(notePath), code);
	}

	async interrupt(notePath: string): Promise<boolean> {
		return this.bridge.interrupt(notePath);
	}

	async restart(notePath: string): Promise<boolean> {
		return this.bridge.restart(notePath);
	}

	async shutdown(notePath: string): Promise<void> {
		await this.bridge.shutdown(notePath);
	}

	async dispose(): Promise<void> {
		await this.bridge.dispose();
	}
}
