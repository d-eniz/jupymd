import {App, FileSystemAdapter} from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import {createHash} from "crypto";
import {KernelConnection, JupyterKernelSpec} from "./types";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 32) || "python";
}

export class ManagedKernelSpecStore {
	readonly jupyterDataDir: string;
	readonly kernelsDir: string;

	constructor(app: App, _pluginId: string) {
		const adapter = app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			throw new Error("Jupyter kernels require a local filesystem vault.");
		}

		this.jupyterDataDir = path.join(
			adapter.getBasePath(),
			app.vault.configDir,
			"jupymd",
			"jupyter"
		);
		this.kernelsDir = path.join(this.jupyterDataDir, "kernels");
	}

	async ensurePythonKernel(pythonPath: string, label?: string): Promise<KernelConnection> {
		const normalizedPath = path.resolve(pythonPath);
		const digest = createHash("sha256").update(normalizedPath).digest("hex").slice(0, 10);
		const environmentLabel = label?.trim() || path.basename(path.dirname(path.dirname(normalizedPath))) || "Python";
		const name = `jupymd-${slugify(environmentLabel)}-${digest}`;
		const displayName = `Python (${environmentLabel})`;
		const resourceDir = path.join(this.kernelsDir, name);
		const spec: JupyterKernelSpec = {
			argv: [normalizedPath, "-m", "ipykernel_launcher", "-f", "{connection_file}"],
			display_name: displayName,
			language: "python",
			metadata: {
				jupymd: {
					managed: true,
					interpreter: normalizedPath,
				},
			},
		};

		await fs.mkdir(resourceDir, {recursive: true});
		await fs.writeFile(path.join(resourceDir, "kernel.json"), JSON.stringify(spec, null, 2), "utf-8");

		return {
			id: `python-environment:${name}`,
			name,
			displayName,
			language: "python",
			resourceDir,
			spec,
			source: "python-environment",
			interpreterPath: normalizedPath,
			isManaged: true,
		};
	}
}
