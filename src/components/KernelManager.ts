import { exec } from "child_process";
import JupyMDPlugin from "../main";
import { App, Modal, Notice } from "obsidian";
import { CodeExecutor } from "./CodeExecutor";

export class KernelManager {
	currentKernel: string | null = null;
	executor: CodeExecutor;

	constructor(private plugin: JupyMDPlugin, private app: App) {

	}

	async detectAvailableKernels(): Promise<Record<string, any>> {
		return new Promise((resolve) => {
			exec(
				`python -c "import json; from jupyter_client.kernelspec import KernelSpecManager; print(json.dumps(KernelSpecManager().get_all_specs()))"`,
				(error, stdout) => {
					if (error) {
						console.error("Error detecting kernels:", error);
						resolve({});
						return;
					}
					try {
						const result = JSON.parse(stdout);
						this.plugin.settings.availableKernels =
							Object.keys(result);
						this.plugin.saveSettings();
						const count = Object.keys(result).length;
						const plural = count === 1 ? "" : "s";
						new Notice(`Detected ${count} kernel${plural}`);
						resolve(result);
					} catch (e) {
						console.error("Error parsing kernels:", e);
						resolve({});
					}
				}
			);
		});
	}

	async selectKernel() {
		const kernelspecs = await this.detectAvailableKernels();

		const kernelEntries = Object.entries(kernelspecs);

		if (kernelEntries.length === 0) {
			new Notice("No kernels found.");
			return;
		}

		const modal = new (class extends Modal {
			constructor(
				app: App,
				private kernelEntries: [string, any][],
				private plugin: JupyMDPlugin
			) {
				super(app);
			}

			onOpen() {
				const contentEl = this.modalEl;
				contentEl.createEl("h2", { text: "Select Python Kernel" });

				this.kernelEntries.forEach(([kernelName, spec]) => {
					const display = spec.spec?.display_name || kernelName;
					contentEl
						.createEl("button", {
							text: display,
							cls: "mod-cta",
							attr: { style: "margin: 5px;" },
						})
						.addEventListener("click", () => {
							this.plugin.settings.defaultKernel = kernelName;
							this.plugin.saveSettings();
							new Notice(`Selected kernel: ${display}`);
							this.close();
						});
				});
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		})(this.app, kernelEntries, this.plugin);

		modal.open();
	}

	async restartKernel() {
		await this.executor.stopPythonProcess();
		this.plugin.currentNotePath = null;
		new Notice("Python kernel restarted");
	}

	async getKernelCommand(kernelName: string): Promise<string> {
		return new Promise((resolve) => {
			if (kernelName === "python3") {
				resolve("python");
				return;
			}

			exec(`jupyter kernelspec list --json`, (error, stdout) => {
				if (error) {
					resolve("python");
					return;
				}

				try {
					const result = JSON.parse(stdout);
					const kernelSpec = result.kernelspecs[kernelName];
					if (
						kernelSpec &&
						kernelSpec.spec &&
						kernelSpec.spec.argv &&
						kernelSpec.spec.argv.length > 0
					) {
						resolve(kernelSpec.spec.argv[0]);
					} else {
						resolve("python");
					}
				} catch {
					resolve("python");
				}
			});
		});
	}
}
