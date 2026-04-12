import {App, PluginSettingTab, Setting, Notice} from "obsidian";
import {CodeExecutor} from "./CodeExecutor";
import JupyMDPlugin from "../main";
import {validatePythonPath} from "../utils/pythonPathUtils";
import {installLibs} from "../utils/helpers";
import {runQuickSetup} from "../utils/quickSetup";
import {KernelSelectorModal} from "./KernelSelector";

export class JupyMDSettingTab extends PluginSettingTab {
	plugin: JupyMDPlugin;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Quick setup")
			.setDesc("Automatically create a virtual environment (.jupymd) in your vault root and install the required libraries. Requires restart to take effect.")
			.addButton((btn) => {
				btn.setButtonText("Run")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("Setting up...");

						const success = await runQuickSetup(this.app, this.plugin);

						btn.setDisabled(false);
						btn.setButtonText(success ? "Setup Complete" : "Run Quick Setup");

						if (success) {
							this.display();
						}
					});
			});

		const desc = document.createDocumentFragment();
		desc.appendText("Select the Python interpreter.");
		desc.createEl("br");
		desc.createEl("a", {
			text: "Read manual setup guide.",
			href: "https://github.com/d-eniz/jupymd/blob/master/README.md#manual-setup",
		});

		const interpreterSetting = new Setting(containerEl)
			.setName("Python interpreter")
			.setDesc(desc)
			.addButton((btn) => {
				btn.setButtonText("Select interpreter")
					.setCta()
					.onClick(() => {
						new KernelSelectorModal(this.app, this.plugin).open();
					});
			});

		interpreterSetting.controlEl.prepend(
			createDiv({
				cls: "jupymd-interpreter-display",
				text: this.plugin.settings.pythonInterpreter || "No interpreter selected",
			})
		);

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
}
