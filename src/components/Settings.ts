import {App, PluginSettingTab, Setting} from "obsidian";
import JupyMDPlugin from "../main";
import {selectAndPrepareToolingEnvironment} from "./KernelSelector";
import {
	formatPythonEnvironmentLabel,
	getPythonEnvironmentInfo,
} from "../utils/pythonEnvironmentDiscovery";

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
		void this.updateToolingDescription(summaryEl, pathEl);

		new Setting(containerEl)
			.setName("Jupyter tooling environment")
			.setDesc(desc)
			.addButton((btn) => {
				btn.setButtonText("Select environment")
					.setCta()
					.onClick(async () => {
						const selected = await selectAndPrepareToolingEnvironment(
							this.app,
							this.plugin.settings.toolingPython
						);
						if (selected) await this.plugin.updateToolingPython(selected);
					});
			});

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
			.setName("Custom notebook code blocks")
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

	private async updateToolingDescription(summaryEl: HTMLElement, pathEl: HTMLElement): Promise<void> {
		const interpreter = this.plugin.settings.toolingPython;

		summaryEl.empty();
		summaryEl.createEl("strong", {text: "Current tooling Python:"});

		if (!interpreter) {
			summaryEl.appendText(" No interpreter selected");
			pathEl.empty();
			return;
		}

		pathEl.setText(interpreter);

		const info = await getPythonEnvironmentInfo(this.app, interpreter);
		if (info) {
			summaryEl.appendText(` ${formatPythonEnvironmentLabel(info.label, info.version)}`);
			return;
		}

		summaryEl.appendText(` ${interpreter}`);
	}
}
