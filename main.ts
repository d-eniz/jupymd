import { Plugin } from "obsidian"

export default class JupytextPlugin extends Plugin {
	async onload() {
		this.addCommand({
			id: "create-jupyter-notebook",
			name: "Create Jupyter Notebook from Note",
			callback: () => this.createNotebook(),
		});
	}

	async createNotebook() {
		const note = this.app.workspace.getActiveFile();
		console.log(note);
	}
}
