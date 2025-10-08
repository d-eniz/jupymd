import * as React from "react";
import {useState, useEffect, JSX, useRef} from "react";
import * as fs from 'fs/promises';
import {isNotebookPaired} from "../utils/helpers";
import {RunIcon} from "../svg/RunIcon";
import {ClearIcon} from "../svg/ClearIcon";
import {LoadIcon} from "../svg/LoadIcon";
import {CodeBlock, PythonBlockProps} from "./types";
import {HighlightedCodeBlock} from "./HighlightedCodeBlock";

export const PythonCodeBlock: React.FC<PythonBlockProps> = ({
																code = "# No code provided",
																path,
																index,
																executor,
																plugin,
															}) => {
	const [output, setOutput] = useState<string | JSX.Element>("");
	const [hasOutput, setHasOutput] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isPaired, setIsPaired] = useState<boolean>(false);
	const [blockCount, setBlockCount] = useState<number>(0);
	const [currentIndex, setCurrentIndex] = useState<number>(index ?? 0);

	const activeFile = plugin.app.workspace.getActiveFile();
	const prevBlockCountRef = useRef<number>(0);
	const prevCodeRef = useRef<string>(code);
	const codeBlockRef = useRef<HTMLDivElement>(null);

	const SYNC_CHECK_INTERVAL = 100; // ms
	const MAX_SYNC_WAIT_TIME = 5000;

	const handleEditClick = async () => {
		if (!activeFile || !plugin.app.workspace.activeEditor) return;

		const editor = plugin.app.workspace.activeEditor.editor;
		if (!editor) return;

		const content = editor.getValue();

		const escapedCode = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		const codeBlockPattern = new RegExp(`\`\`\`python\\n${escapedCode}(\\n\`\`\`|$)`, 'gm');
		const match = codeBlockPattern.exec(content);

		if (match) {
			const startPos = match.index;
			const endPos = startPos + match[0].length;

			const codeStart = startPos + "```python\n".length;
			const codeEnd = endPos - (match[0].endsWith("```") ? "\n```".length : 0);

			editor.setSelection(
				editor.offsetToPos(codeStart),
				editor.offsetToPos(codeEnd)
			);
			editor.focus();

			editor.scrollIntoView({
				from: editor.offsetToPos(codeStart),
				to: editor.offsetToPos(codeEnd)
			}, true);
		}
	};

	const getCodeBlocks = async () => {
		if (!path) return [];

		try {
			const ipynbPath = path.replace(/\.md$/, ".ipynb");
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			return notebook.cells
				.filter((c: { cell_type: string }) => c.cell_type === "code")
				.map((cell: { source: string[] }) => cell.source.join("").trim());
		} catch (err) {
			console.error("Error reading notebook:", err);
			return [];
		}
	};

	const reindexBlock = async () => {
		if (!path) return;

		if (!await isNotebookPaired(activeFile)) {
			return;
		}

		const codeBlocks = await getCodeBlocks();
		const newBlockCount = codeBlocks.length;
		setBlockCount(newBlockCount);

		const newIndex = codeBlocks.findIndex((blockCode: string) => blockCode === code.trim());

		if (newIndex !== -1 && (newIndex !== currentIndex || newBlockCount !== prevBlockCountRef.current)) {
			setCurrentIndex(newIndex);
		}

		prevBlockCountRef.current = newBlockCount;
	};

	const renderOutputs = async () => {
		if (!executor || !path || currentIndex === undefined) return;

		try {
			if (!await isNotebookPaired(activeFile)) {
				setOutput("");
				setHasOutput(false);
				return;
			}

			const ipynbPath = path.replace(/\.md$/, ".ipynb");
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

			if (cells.length <= currentIndex || !cells[currentIndex] || !cells[currentIndex].outputs) {
				setOutput("");
				setHasOutput(false);
				return;
			}

			const cellOutputs = cells[currentIndex].outputs;
			let outputText = "";
			const outputImages: JSX.Element[] = [];
			let hasActualOutput = false;

			for (const out of cellOutputs) {
				if (out.output_type === "stream") {
					const text = Array.isArray(out.text) ? out.text.join("") : out.text;
					if (text.trim()) {
						outputText += text;
						hasActualOutput = true;
					}
				} else if (out.output_type === "execute_result" && out.data && out.data["text/plain"]) {
					const text = Array.isArray(out.data["text/plain"])
						? out.data["text/plain"].join("")
						: out.data["text/plain"];
					if (text.trim()) {
						outputText += text;
						hasActualOutput = true;
					}
				} else if (out.output_type === "display_data" && out.data) {
					if (out.data["image/png"]) {
						const imageData = out.data["image/png"];
						outputImages.push(
							<img
								key={outputImages.length}
								src={`data:image/png;base64,${imageData}`}
								alt="Cell output"
								style={{maxWidth: '100%'}}
							/>
						);
						hasActualOutput = true;
					}
				}
			}

			const outputContent = (
				<>
					{outputText && <div className="text-output">{outputText}</div>}
					{outputImages}
				</>
			);

			setOutput(outputContent);
			setHasOutput(hasActualOutput);

		} catch (err) {
			console.error("Error fetching outputs:", err);
			setOutput("Error fetching outputs");
			setHasOutput(true);
		}
	};

	const waitForSyncUnblocked = async (): Promise<boolean> => {
		const startTime = Date.now();
		
		return new Promise((resolve) => {
			const checkSync = () => {
				const elapsedTime = Date.now() - startTime;
				
				if (elapsedTime >= MAX_SYNC_WAIT_TIME) {
					console.warn("Max sync wait time exceeded, proceeding with execution");
					resolve(false);
					return;
				}
				
				if (!plugin?.fileSync?.isSyncBlocked?.()) {
					resolve(true);
					return;
				}
				
				setTimeout(checkSync, SYNC_CHECK_INTERVAL);
			};
			
			checkSync();
		});
	};

	const handleRun = async () => {

		if (!executor || !path || currentIndex === undefined) return;

		setIsLoading(true);

		try {

			const syncUnblocked = await waitForSyncUnblocked();

			if (!syncUnblocked) {
				console.warn("Code execution proceeding despite sync being blocked (timeout reached)");
			}

			const codeBlock: CodeBlock = {
				code: code,
				cellIndex: currentIndex
			};

			if (!activeFile) {
				setIsLoading(false);
				return;
			}

			await executor.executeCodeBlock(codeBlock);

			await reindexBlock();

			setTimeout(async () => {
				await renderOutputs();
				await fs.utimes(path, new Date(), new Date()); 
				/* when the output is pushed to the .ipynb file, the modification time 
				of it becomes more recent than the markdown file's. this causes the sync
				to be biased towards the .ipynb file which in reality is older than the
				markdown file. to mitigate, the markdown file is force modified after the 
				output is pushed to the .ipynb file. */
				setIsLoading(false);
			}, 100);
		} catch (err) {
			console.error("Error executing code:", err);
			setIsLoading(false);
		}
	};

	const handleClear = async () => {
		if (!path || currentIndex === undefined) return;

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

			if (cells.length <= currentIndex || !cells[currentIndex]) {
				return;
			}

			cells[currentIndex].outputs = [];
			await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			setOutput("");
			setHasOutput(false);
		} catch (err) {
			console.error("Error clearing outputs:", err);
		}
	};

	useEffect(() => {
		const interval = setInterval(() => {
			if (code !== prevCodeRef.current || currentIndex === undefined || currentIndex >= blockCount) {
				reindexBlock();
				prevCodeRef.current = code;
			}
		}, 2000);

		return () => clearInterval(interval);
	}, [path, code, currentIndex, blockCount]);

	useEffect(() => {
		reindexBlock();
	}, [path, code]);

	useEffect(() => {
		renderOutputs();
	}, [currentIndex]);

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
				{isPaired && (
					<div className="code-buttons">
						<button onClick={handleRun} disabled={isLoading} className="icon-button">
							{isLoading ? (
								<LoadIcon className="icon grey-icon"/>
							) : (
								<RunIcon className="icon grey-icon"/>
							)}
						</button>
						{hasOutput && (
							<button onClick={handleClear} className="icon-button">
								<ClearIcon className="icon grey-icon"/>
							</button>
						)}
					</div>
				)}
				{!isPaired && <div/>}
				<div className="code-lang-label">
					Python
				</div>
			</div>

			<div
				ref={codeBlockRef}
				onClick={handleEditClick}
				style={{cursor: 'text'}}
			>
				<HighlightedCodeBlock
					code={code}
				/>
			</div>

			{hasOutput && (
				<pre className="code-output">
                    {output}
                </pre>
			)}
		</div>
	);
};

