import * as React from "react";
import {useState, useEffect} from "react";
import * as fs from 'fs/promises';
import {isNotebookPaired} from "./utils/helpers";
import {RunIcon} from "./components/svg/RunIcon";
import {ClearIcon} from "./components/svg/ClearIcon";
import {PythonBlockProps} from "./components/types";

export const PythonCodeBlock: React.FC<PythonBlockProps> = ({
																code = "# No code provided",
																path,
																index,
																executor,
																plugin
															}) => {
	// This will likely be refactored to work for other languages in the future
	const [output, setOutput] = useState<string>("");
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isPaired, setIsPaired] = useState<boolean>(false);
	const activeFile = plugin.app.workspace.getActiveFile();

	const renderOutputs = async () => {
		if (!path) return;

		try {
			if (!await isNotebookPaired(activeFile)) {
				setOutput("");
				return;
			}
			const ipynbPath = path.replace(/\.md$/, ".ipynb");
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);

			const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

			if (cells.length <= index || !cells[index] || !cells[index].outputs) {
				setOutput("");
				return;
			}
			const cellOutputs = cells[index].outputs;
			let outputText = "";

			for (const out of cellOutputs) {
				if (out.output_type === "stream") {
					if (out.name === "stdout") {
						outputText += Array.isArray(out.text) ? out.text.join("") : out.text;
					} else if (out.name === "stderr") {
						outputText += Array.isArray(out.text) ? out.text.join("") : out.text;
					}
				} else if (out.output_type === "execute_result" && out.data && out.data["text/plain"]) {
					outputText += Array.isArray(out.data["text/plain"])
						? out.data["text/plain"].join("")
						: out.data["text/plain"];
				}
			}
			setOutput(outputText);

		} catch (err) {
			console.error("Error fetching outputs:", err);
			setOutput("Error fetching outputs");
		}
	};

	const handleRun = async () => {
		if (!executor || !path || index === undefined) return;

		setIsLoading(true);

		try {
			const codeBlock = {
				code,
				startPos: 0, // ???????
				endPos: 0
			};

			if (!activeFile) {
				setIsLoading(false);
				return;
			}

			await executor.executeCodeBlock(plugin.app.workspace.activeEditor?.editor, codeBlock);

			await renderOutputs();
		} catch (err) {
			console.error("Error executing code:", err);
		} finally {
			setIsLoading(false);
		}
	};

	const handleClear = async () => {
		if (!path || index === undefined) return;

		try {
			const ipynbPath = path.replace(/\.md$/, ".ipynb");

			try {
				await fs.access(ipynbPath);
			} catch (e) {
				return;
			}

			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);

			const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

			if (cells.length <= index || !cells[index]) {
				return;
			}

			cells[index].outputs = [];

			await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));

			setOutput("");

		} catch (err) {
			console.error("Error clearing outputs:", err);
		}
	};

	useEffect(() => {
		renderOutputs();
	}, [code, path, index]);

	useEffect(() => {
		const checkPairing = async () => {
			if (activeFile) {
				const paired = await isNotebookPaired(activeFile);
				setIsPaired(paired);
			}
		};
		checkPairing();
	}, [activeFile]);

	return (
		<div className="code-container">

			<div className="code-top-bar">

				{isPaired && ( // Display buttons only if paired
					<div className="code-buttons">
						<button onClick={handleRun} disabled={isLoading} className="icon-button">
							<RunIcon className="icon grey-icon"/>
						</button>
						<button onClick={handleClear} className="icon-button">
							<ClearIcon className="icon grey-icon"/>
						</button>
					</div>

				)}
				{!isPaired && <div/>} {/* Display empty div if not paired to keep python text on the right */}

				<div className="code-lang-label">
					python
				</div>
			</div>

			<pre className="code-body">
				<code>{code}</code>
			</pre>

			{output && (
				<div className="code-output">
					{output}
				</div>
			)}
		</div>
	);
};
