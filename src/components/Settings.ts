import {App, PluginSettingTab, Setting, Notice} from "obsidian";
import {CodeExecutor} from "./CodeExecutor";
import JupyMDPlugin from "../main";
import {validatePythonPath} from "../utils/pythonPathUtils";
import { installLibs } from "../utils/helpers";

export class JupyMDSettingTab extends PluginSettingTab {
    plugin: JupyMDPlugin;
    executor: CodeExecutor;

    constructor(app: App, plugin: JupyMDPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.executor = new CodeExecutor(this.plugin, this.app);
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl("h4", { text: "Setup" });

        new Setting(containerEl)
            .setName("Python interpreter")
            .setDesc("Select the Python interpreter. Requires restart to take effect.")
            .addText((text) => {
                text.setValue(this.plugin.settings.pythonInterpreter)
                text.setPlaceholder("python3")
                text.onChange(async (value) => {
                    const cleaned = value.trim();
                    const valid = await validatePythonPath(cleaned);
                    if (cleaned && !valid) {
                        new Notice("Invalid Python path")
                        return;
                    }
                    if (valid) {
                        new Notice("Valid Python path, saving interpreter location...")
                    }

                    this.plugin.settings.pythonInterpreter = cleaned;
                    await this.plugin.saveSettings();
                })
            })

        new Setting(containerEl)
            .setName("Install required libraries")
            .setDesc("Attempt to install Jupytext and matplotlib for specified interpreter using pip.")
            .addButton((btn) =>
                btn
                    .setButtonText("Install")
                    .setCta()
                    .onClick(async () => {
                        new Notice("Installing libraries...");

                        await installLibs(this.plugin.settings.pythonInterpreter,"jupytext matplotlib")
                    })
            );

        containerEl.createEl('hr');
        containerEl.createEl("h4", { text: "General" });

        new Setting(containerEl)
            .setName("Jupyter notebook editor launch command")
            .setDesc("Specify the command to launch Jupyter notebooks in your preferred editor (e.g., 'code' for VS Code, 'jupyter-lab' for Jupyter Lab, 'pycharm64.exe' for PyCharm, etc.)")
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
    }
}
