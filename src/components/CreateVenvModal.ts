import {App, Modal, Notice, Setting} from "obsidian";
import {discoverKernels, KernelInfo} from "../utils/kernelDiscovery";

export type CreateVenvResult = {
	basePythonPath: string;
	envName: string;
};

export class CreateVenvModal extends Modal {
	private readonly initialPythonPath: string;
	private basePythonPath: string;
	private envName = ".jupymd";
	private availableKernels: KernelInfo[] = [];
	private resolver: ((result: CreateVenvResult | null) => void) | null = null;

	constructor(app: App, initialPythonPath: string) {
		super(app);
		this.initialPythonPath = initialPythonPath;
		this.basePythonPath = initialPythonPath;
	}

	openAndGetValue(): Promise<CreateVenvResult | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		const {contentEl} = this;
		this.setTitle("Create virtual environment");
		contentEl.empty();

		new Setting(contentEl)
			.setName("Base interpreter")
			.setDesc("Python executable used to create the virtual environment.")
			.addDropdown((dropdown) => {
				dropdown.addOption("", "Loading interpreters…");
				dropdown.setDisabled(true);
				void this.loadInterpreterOptions(dropdown);
			});

		new Setting(contentEl)
			.setName("Environment name")
			.setDesc("This folder will be created in the vault root.")
			.addText((text) => {
				text.setPlaceholder(".jupymd");
				text.setValue(this.envName)
					.onChange((value) => {
						this.envName = value.trim();
					});
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("Create")
					.setCta()
					.onClick(async () => {
						const basePythonPath = this.basePythonPath.trim();
						const envName = this.envName.trim();

						if (!basePythonPath) {
							new Notice("Enter a Python interpreter path.");
							return;
						}

						if (!envName) {
							new Notice("Enter an environment name.");
							return;
						}

						if (/[\\/]/.test(envName)) {
							new Notice("Environment name should be a single folder name, not a path.");
							return;
						}

						if (!basePythonPath) {
							new Notice("Select a base interpreter.");
							return;
						}

						this.resolver?.({basePythonPath, envName});
						this.resolver = null;
						this.close();
					});
			})
			.addButton((btn) => {
				btn.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					});
			});
	}

	onClose() {
		this.contentEl.empty();
		if (this.resolver) {
			this.resolver(null);
			this.resolver = null;
		}
	}

	private async loadInterpreterOptions(dropdown: import("obsidian").DropdownComponent) {
		try {
			this.availableKernels = (await discoverKernels(this.app))
				.filter((kernel) => kernel.type === "system");
		} catch (error) {
			console.error("Failed to discover interpreters for venv creation:", error);
			this.availableKernels = [];
		}

		dropdown.selectEl.empty();

		if (this.availableKernels.length === 0) {
			dropdown.addOption("", "No interpreters found");
			dropdown.setDisabled(true);
			return;
		}

		for (const kernel of this.availableKernels) {
			dropdown.addOption(kernel.path, `${kernel.label} (${kernel.version}) - ${kernel.path}`);
		}

		const initialValue = this.availableKernels.some((kernel) => kernel.path === this.initialPythonPath)
			? this.initialPythonPath
			: this.availableKernels[0].path;

		this.basePythonPath = initialValue;
		dropdown.setValue(initialValue);
		dropdown.onChange((value) => {
			this.basePythonPath = value;
		});
		dropdown.setDisabled(false);
	}
}
