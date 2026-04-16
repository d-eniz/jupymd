import {App, PluginSettingTab, Setting, Notice} from "obsidian";
import {CodeExecutor} from "./CodeExecutor";
import JupyMDPlugin from "../main";
import {validatePythonPath} from "../utils/pythonPathUtils";
import {installLibs} from "../utils/helpers";
import {KernelSelectorModal} from "./KernelSelector";
import {formatKernelLabel, getInterpreterInfo} from "../utils/kernelDiscovery";

export class JupyMDSettingTab extends PluginSettingTab {
	plugin: JupyMDPlugin;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		const desc = document.createDocumentFragment();
		const descWrapper = document.createElement("div");
		const summaryEl = descWrapper.createEl("div");
		const pathEl = descWrapper.createEl("div");
		desc.appendChild(descWrapper);
		void this.updateInterpreterDescription(summaryEl, pathEl);

		new Setting(containerEl)
			.setName("Python interpreter")
			.setDesc(desc)
			.addButton((btn) => {
				btn.setButtonText("Select interpreter")
					.setCta()
					.onClick(() => {
						new KernelSelectorModal(this.app, this.plugin).open();
					});
			});

		new Setting(containerEl)
			.setName("Install required libraries")
			.setDesc("Install Jupytext and matplotlib for specified interpreter using pip.")
			.addButton((btn) =>
				btn
					.setButtonText("Install")
					.setCta()
					.onClick(async () => {
						new Notice("Installing libraries...");

						await installLibs(this.plugin.settings.pythonInterpreter, "jupytext matplotlib")
					})
			);

		containerEl.createEl("h4", {text: "General"});

		new Setting(containerEl)
			.setName("Jupyter notebook editor launch command")
			.setDesc("Specify the command to launch Jupyter notebooks in your preferred editor (e.g., 'code' for VS Code, 'jupyter-lab' for Jupyter Lab, etc.)")
			.addText((text) => {
				text.setValue(this.plugin.settings.notebookEditorCommand)
					.onChange(async (value) => {
						this.plugin.settings.notebookEditorCommand = value;
						await this.plugin.saveSettings();
					});
			})

		new Setting(containerEl)
			.setName("Custom Python code blocks")
			.setDesc("When disabled, the default Obsidian code block will be used. Requires restart to take effect.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enableCodeBlocks)
				toggle.onChange(async (value) => {
					this.plugin.settings.enableCodeBlocks = value;
					await this.plugin.saveSettings();
				})
			})

		new Setting(containerEl)
			.setName("Automatic sync")
			.setDesc("When disabled, linked markdown and Jupyter notebook files will have to be synced manually through the \"JupyMD: Sync files\" command. Disable if experiencing sync issues.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoSync)
				toggle.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
				})
			})

		new Setting(containerEl)
			.setName("Bidirectional sync")
			.setDesc("When disabled, changes made in a Jupyter notebook file will always be overwritten by changes made in its paired markdown file. Enabling may cause sync issues.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.bidirectionalSync)
				toggle.onChange(async (value) => {
					this.plugin.settings.bidirectionalSync = value;
					await this.plugin.saveSettings();
				})
			})

		new Setting(containerEl)
			.setName("Automatically convert notes to notebooks on run")
			.setDesc("When enabled, running code from an unpaired note will first create and pair a Jupyter notebook, then execute the requested code.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.autoConvertToNotebookOnRun)
				toggle.onChange(async (value) => {
					this.plugin.settings.autoConvertToNotebookOnRun = value;
					await this.plugin.saveSettings();
				})
			})
	}

	private async updateInterpreterDescription(summaryEl: HTMLElement, pathEl: HTMLElement): Promise<void> {
		const interpreter = this.plugin.settings.pythonInterpreter;

		summaryEl.empty();
		summaryEl.createEl("strong", {text: "Current interpreter:"});

		if (!interpreter) {
			summaryEl.appendText(" No interpreter selected");
			pathEl.empty();
			return;
		}

		pathEl.setText(interpreter);

		const info = await getInterpreterInfo(this.app, interpreter);
		if (info) {
			summaryEl.appendText(` ${formatKernelLabel(info.label, info.version)}`);
			return;
		}

		summaryEl.appendText(` ${interpreter}`);
	}
}
