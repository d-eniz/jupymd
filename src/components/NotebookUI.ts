import { App, Editor} from "obsidian";
import { CodeExecutor } from "./CodeExecutor";
import { FileSync } from "./FileSync";

export class NotebookUI {
	executor: CodeExecutor;
	fileSync: FileSync;

	constructor(private app: App) {
		this.fileSync = new FileSync(app);
	}

	setExecutor(executor: CodeExecutor) {
		this.executor = executor;
	}

	getActiveCodeBlock(editor: Editor | undefined) {
		// @ts-ignore
		const cursor = editor.getCursor();
		// @ts-ignore
		const content = editor.getValue();
		const lines = content.split("\n");

		let inCodeBlock = false;
		let codeBlockStart = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line.trim().startsWith("```")) {
				if (!inCodeBlock) {
					inCodeBlock = true;
					codeBlockStart = i;
				} else {
					const codeBlockEnd = i;
					// Include the cursor being on the backtick lines
					if (
						cursor.line >= codeBlockStart &&
						cursor.line <= codeBlockEnd
					) {
						const code = lines
							.slice(codeBlockStart + 1, codeBlockEnd)
							.join("\n");
						return {
							code,
							startPos: codeBlockStart,
							endPos: codeBlockEnd,
						};
					}
					inCodeBlock = false;
				}
			}
		}

		return null;
	}

}
