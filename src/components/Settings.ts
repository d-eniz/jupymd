import { App, PluginSettingTab, Setting } from "obsidian";
import { CodeExecutor } from "./CodeExecutor";
import { KernelManager } from "./KernelManager";
import JupyMDPlugin from "../main";

export class JupyMDSettingTab extends PluginSettingTab {
	plugin: JupyMDPlugin;
	executor: CodeExecutor;
	kernelManager: KernelManager;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.kernelManager = new KernelManager(this.plugin, this.app);
		this.executor = new CodeExecutor(this.plugin, this.app);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default Python kernel")
			.setDesc("Select the default Python kernel for execution")
			.addDropdown((dropdown) => {
				this.plugin.settings.availableKernels.forEach((kernel) => {
					dropdown.addOption(kernel, kernel);
				});
				dropdown.setValue(this.plugin.settings.defaultKernel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultKernel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Detect kernels")
			.setDesc("Refresh list of available kernels")
			.addButton((button) => {
				button.setButtonText("Detect").onClick(async () => {
					await this.kernelManager.detectAvailableKernels();
					this.display();
				});
			});

		new Setting(containerEl)
			.setName("Jupyter notebook editor launch command")
			.setDesc("Specify the command to launch Jupyter notebooks in your preferred editor (e.g., 'code' for VS Code, 'jupyter-lab' for Jupyter Lab)")
			.addText((text) => {
				text.setValue(this.plugin.settings.notebookEditorCommand)
					.onChange(async (value) => {
						this.plugin.settings.notebookEditorCommand = value;
						await this.plugin.saveSettings();
					});
			})
	}
}
