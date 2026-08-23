import {App, PluginSettingTab, Setting} from "obsidian";
import type {SettingDefinitionItem} from "obsidian";
import JupyMDPlugin from "../main";
import {selectAndPrepareToolingEnvironment} from "./KernelSelector";
import {
	formatPythonEnvironmentLabel,
	getPythonEnvironmentInfo,
} from "../utils/pythonEnvironmentDiscovery";

const NOTEBOOK_EDITOR_DESCRIPTION =
	"Specify the command used to launch Jupyter notebooks (for example, code for VS Code or jupyter-lab for JupyterLab).";
const CODE_BLOCK_DESCRIPTION =
	"When disabled, the default code block will be used. Requires restart to take effect.";
const AUTO_SYNC_DESCRIPTION =
	"When disabled, linked Markdown and Jupyter notebook files must be synced manually with the JupyMD: Sync files command.";
const BIDIRECTIONAL_SYNC_DESCRIPTION =
	"When disabled, changes in a notebook file are overwritten by its paired Markdown file. Enabling this may cause sync conflicts.";
const AUTO_CONVERT_DESCRIPTION =
	"When enabled, running code from an unpaired note first creates and pairs a Jupyter notebook.";

export class JupyMDSettingTab extends PluginSettingTab {
	plugin: JupyMDPlugin;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Jupyter tooling environment",
				desc: "Select the Python environment that provides Jupytext and Jupyter Client.",
				render: (setting) => this.configureToolingSetting(setting),
			},
			{
				type: "group",
				heading: "Notebook behavior",
				items: [
					{
						name: "Jupyter notebook editor launch command",
						desc: NOTEBOOK_EDITOR_DESCRIPTION,
						control: {type: "text", key: "notebookEditorCommand"},
					},
					{
						name: "Custom notebook code blocks",
						desc: CODE_BLOCK_DESCRIPTION,
						control: {type: "toggle", key: "enableCodeBlocks"},
					},
					{
						name: "Automatic sync",
						desc: AUTO_SYNC_DESCRIPTION,
						control: {type: "toggle", key: "autoSync"},
					},
					{
						name: "Bidirectional sync",
						desc: BIDIRECTIONAL_SYNC_DESCRIPTION,
						control: {type: "toggle", key: "bidirectionalSync"},
					},
					{
						name: "Automatically convert notes to notebooks on run",
						desc: AUTO_CONVERT_DESCRIPTION,
						control: {type: "toggle", key: "autoConvertToNotebookOnRun"},
					},
				],
			},
		];
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		this.configureToolingSetting(new Setting(containerEl));
		new Setting(containerEl).setName("Notebook behavior").setHeading();

		new Setting(containerEl)
			.setName("Jupyter notebook editor launch command")
			.setDesc(NOTEBOOK_EDITOR_DESCRIPTION)
			.addText((text) => text
				.setValue(this.plugin.settings.notebookEditorCommand)
				.onChange((value) => {
					this.plugin.settings.notebookEditorCommand = value;
					void this.plugin.saveSettings();
				}));

		this.addFallbackToggle("Custom notebook code blocks", CODE_BLOCK_DESCRIPTION, "enableCodeBlocks");
		this.addFallbackToggle("Automatic sync", AUTO_SYNC_DESCRIPTION, "autoSync");
		this.addFallbackToggle("Bidirectional sync", BIDIRECTIONAL_SYNC_DESCRIPTION, "bidirectionalSync");
		this.addFallbackToggle(
			"Automatically convert notes to notebooks on run",
			AUTO_CONVERT_DESCRIPTION,
			"autoConvertToNotebookOnRun"
		);
	}

	private configureToolingSetting(setting: Setting): void {
		let summaryEl!: HTMLElement;
		let pathEl!: HTMLElement;
		const desc = createFragment((fragment) => {
			summaryEl = fragment.createDiv();
			pathEl = fragment.createDiv();
			void this.updateToolingDescription(summaryEl, pathEl);
		});

		setting
			.setName("Jupyter tooling environment")
			.setDesc(desc)
			.addButton((button) => button
				.setButtonText("Select environment")
				.setCta()
				.onClick(() => void this.selectToolingEnvironment(summaryEl, pathEl)));
	}

	private addFallbackToggle(
		name: string,
		description: string,
		key: "enableCodeBlocks" | "autoSync" | "bidirectionalSync" | "autoConvertToNotebookOnRun"
	): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings[key])
				.onChange((value) => {
					this.plugin.settings[key] = value;
					void this.plugin.saveSettings();
				}));
	}

	private async selectToolingEnvironment(summaryEl: HTMLElement, pathEl: HTMLElement): Promise<void> {
		const selected = await selectAndPrepareToolingEnvironment(
			this.app,
			this.plugin.settings.toolingPython
		);
		if (selected) {
			await this.plugin.updateToolingPython(selected);
			await this.updateToolingDescription(summaryEl, pathEl);
		}
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
