import {App, PluginSettingTab, Setting, Notice} from "obsidian";
import {CodeExecutor} from "./CodeExecutor";
import JupyMDPlugin from "../main";
import {exec} from "child_process";

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

                        const command =
                            process.platform === "win32"
                                ? "pip install jupytext"
                                : "python3 -m pip install --user jupytext";

                        exec(command, (error, stdout, stderr) => {
                            if (error) {
                                new Notice("Failed to install Jupytext.");
                                console.error(stderr);
                            } else {
                                new Notice("Jupytext installed successfully.");
                                console.log(stdout);
                            }
                        });
                    })
            );

    }
}
