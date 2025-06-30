import {App, PluginSettingTab, Setting, Notice} from "obsidian";
import {CodeExecutor} from "./CodeExecutor";
import JupyMDPlugin from "../main";
import {validatePythonPath} from "../utils/pythonPathUtils";

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
            .setName("Enable custom Python code block")
            .setDesc("If disabled, the default Obsidian code block will be used. Requires restart to take effect.")
            .addToggle((toggle) => {
                toggle.setValue(this.plugin.settings.enableCodeBlocks)
                toggle.onChange(async (value) => {
                    this.plugin.settings.enableCodeBlocks = value;
                    await this.plugin.saveSettings();
                })
            })

        new Setting(containerEl)
            .setName("Install Jupytext")
            .setDesc("Attempt to install Jupytext using pip")
            .addButton((btn) =>
                btn
                    .setButtonText("Install")
                    .setCta()
                    .onClick(async () => {
                        new Notice("Installing Jupytext...");

                        try {
                            const {stdout, stderr} = await this.executor.installLibs(["jupytext"]);

                            if (stderr) {
                                new Notice("Failed to install Jupytext.");
                                console.error(stderr);
                            } else {
                                new Notice("Jupytext installed successfully.");
                                console.log(stdout);
                            }
                        } catch (error) {
                            new Notice("Failed to install Jupytext.");
                            console.error(error);
                        }
                    })
            );
        new Setting(containerEl)
            .setName("Python Interpreter")
            .setDesc("Select the python interpreter. Requires restart to take effect.")
            .addText((text) => {
                text.setValue(this.plugin.settings.pythonInterpreter)
                text.setPlaceholder("python3")
                text.onChange(async (value) => {
                    const cleaned = value.trim();
                    const valid = await validatePythonPath(cleaned);
                    if (cleaned && !valid) {
                        new Notice("Invalid Python path");
                        return; // Don't save invalid paths
                    }

                    this.plugin.settings.pythonInterpreter = cleaned;
                    await this.plugin.saveSettings();
                    await this.plugin.onload();
                })
            })

    }
}
