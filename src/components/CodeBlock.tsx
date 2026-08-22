import * as React from "react";
import {useState, useEffect, useLayoutEffect, JSX, useRef} from "react";
import * as fs from 'fs/promises';
import {createPortal} from "react-dom";
import {getAbsolutePath, isNotebookPaired, runJupytext} from "../utils/helpers";
import RunIcon from "../svg/RunIcon";
import {ClearIcon} from "../svg/ClearIcon";
import {LoadIcon} from "../svg/LoadIcon";
import RunAboveIcon from "../svg/RunAboveIcon";
import RunBelowIcon from "../svg/RunBelowIcon";
import ChevronDownIcon from "../svg/ChevronDownIcon";
import {CodeBlock, CodeExecutionMode, NotebookCodeBlockProps, OUTPUTS_UPDATED_EVENT} from "./types";
import {HighlightedCodeBlock} from "./HighlightedCodeBlock";
import {sanitizeHTMLToDom} from "obsidian";
import {languageSupportRegistry} from "../languages/LanguageSupport";
import {getEditorPositionForCodeOffset} from "../notebook/NotebookCellIndex";
import {stripAnsiSequences} from "../utils/textOutput";

export const NotebookCodeBlock: React.FC<NotebookCodeBlockProps> = ({
																		code = "# No code provided",
																			path,
															index,
															sourceLineStart,
															language = "python",
															executionEnabled = true,
															executor,
																plugin,
															}) => {
	const [output, setOutput] = useState<string | JSX.Element>("");
	const [hasOutput, setHasOutput] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isPaired, setIsPaired] = useState<boolean>(false);
	const [isRunMenuOpen, setIsRunMenuOpen] = useState<boolean>(false);
	const [runMenuPosition, setRunMenuPosition] = useState<{ top: number; left: number } | null>(null);
	const currentIndex = index ?? 0;

	const activeFile = plugin.app.workspace.getActiveFile();
	const runMenuRef = useRef<HTMLDivElement>(null);
	const runDropdownMenuRef = useRef<HTMLDivElement>(null);

	const SYNC_CHECK_INTERVAL = 100; // ms
	const MAX_SYNC_WAIT_TIME = 5000;

	const notifyOutputsUpdated = () => {
		if (!path) return;

		document.dispatchEvent(new CustomEvent(OUTPUTS_UPDATED_EVENT, {
			detail: {path},
		}));
	};

	const getCodeOffsetAtPoint = (root: HTMLElement, clientX: number, clientY: number): number => {
		const documentWithCaret = document as Document & {
			caretPositionFromPoint?: (x: number, y: number) => {offsetNode: Node; offset: number} | null;
			caretRangeFromPoint?: (x: number, y: number) => Range | null;
		};
		const caretPosition = documentWithCaret.caretPositionFromPoint?.(clientX, clientY);
		const caretRange = caretPosition ? null : documentWithCaret.caretRangeFromPoint?.(clientX, clientY);
		const node = caretPosition?.offsetNode || caretRange?.startContainer;
		const nodeOffset = caretPosition?.offset ?? caretRange?.startOffset;
		if (!node || nodeOffset === undefined || !root.contains(node)) return 0;

		try {
			const range = document.createRange();
			range.selectNodeContents(root);
			range.setEnd(node, nodeOffset);
			return range.toString().length;
		} catch {
			return 0;
		}
	};

	const handleCodeClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (sourceLineStart === undefined || !path) return;
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) return;

		const currentFile = plugin.app.workspace.getActiveFile();
		const editor = plugin.app.workspace.activeEditor?.editor;
		if (!currentFile || !editor || getAbsolutePath(currentFile) !== path) return;

		const codeElement = event.currentTarget.querySelector("code");
		const offset = codeElement
			? getCodeOffsetAtPoint(codeElement, event.clientX, event.clientY)
			: 0;
		const position = getEditorPositionForCodeOffset(code, sourceLineStart, offset);
		event.preventDefault();
		event.stopPropagation();
		editor.setCursor(position);
		editor.focus();
	};

	const renderOutputs = async () => {
		if (!executor || !path || currentIndex === undefined) return;

		try {
			if (!await isNotebookPaired(plugin.app, activeFile)) {
				setOutput("");
				setHasOutput(false);
				return;
			}

			const ipynbPath = path.replace(/\.md$/, ".ipynb");
			try {
				await fs.access(ipynbPath);
			} catch (e) {
				return;
			}
			
			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

			if (cells.length <= currentIndex || !cells[currentIndex] || !cells[currentIndex].outputs) {
				setOutput("");
				setHasOutput(false);
				return;
			}

			const cellOutputs = cells[currentIndex].outputs;
			const outputParts: JSX.Element[] = [];
			let hasActualOutput = false;
			const addMimeBundle = (data: Record<string, any>, keyPrefix: string) => {
				if (data["text/html"]) {
					const html = Array.isArray(data["text/html"]) ? data["text/html"].join("") : String(data["text/html"]);
					const holder = document.createElement("div");
					holder.appendChild(sanitizeHTMLToDom(html));
					outputParts.push(<div key={keyPrefix} dangerouslySetInnerHTML={{__html: holder.innerHTML}}/>);
					return true;
				}
				if (data["image/svg+xml"]) {
					const svg = Array.isArray(data["image/svg+xml"]) ? data["image/svg+xml"].join("") : String(data["image/svg+xml"]);
					const holder = document.createElement("div");
					holder.appendChild(sanitizeHTMLToDom(svg));
					outputParts.push(<div key={keyPrefix} dangerouslySetInnerHTML={{__html: holder.innerHTML}}/>);
					return true;
				}
				for (const mime of ["image/png", "image/jpeg"]) {
					if (data[mime]) {
						outputParts.push(<img key={keyPrefix} src={`data:${mime};base64,${data[mime]}`} alt="Cell output"/>);
						return true;
					}
				}
				for (const mime of ["text/markdown", "text/plain"]) {
					if (data[mime] !== undefined) {
						const rawText = Array.isArray(data[mime]) ? data[mime].join("") : String(data[mime]);
						const text = stripAnsiSequences(rawText);
						outputParts.push(<div className="text-output" key={keyPrefix}>{text}</div>);
						return text.length > 0;
					}
				}
				if (data["application/json"] !== undefined) {
					outputParts.push(<div className="text-output" key={keyPrefix}>{JSON.stringify(data["application/json"], null, 2)}</div>);
					return true;
				}
				return false;
			};

			for (let outputIndex = 0; outputIndex < cellOutputs.length; outputIndex++) {
				const out = cellOutputs[outputIndex];
				if (out.output_type === "stream") {
					const rawText = Array.isArray(out.text) ? out.text.join("") : out.text;
					const text = stripAnsiSequences(rawText);
					if (text.trim()) {
						outputParts.push(<div className="text-output" key={`stream-${outputIndex}`}>{text}</div>);
						hasActualOutput = true;
					}
				} else if ((out.output_type === "execute_result" || out.output_type === "display_data") && out.data) {
					hasActualOutput = addMimeBundle(out.data, `${out.output_type}-${outputIndex}`) || hasActualOutput;
				} else if (out.output_type === "error") {
					const rawTraceback = Array.isArray(out.traceback) && out.traceback.length
						? out.traceback.join("\n")
						: `${out.ename || "Error"}: ${out.evalue || ""}`;
					const traceback = stripAnsiSequences(rawTraceback);
					outputParts.push(<div className="text-output error-output" key={`error-${outputIndex}`}>{traceback}</div>);
					hasActualOutput = true;
				}
			}

			const outputContent = (
				<>{outputParts}</>
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

	const runCodeBlock = async (mode: CodeExecutionMode = "cell") => {
		if (!executor || !path || currentIndex === undefined) return;

		setIsRunMenuOpen(false);
		setIsLoading(true);

		try {

			const syncUnblocked = await waitForSyncUnblocked();

			if (!syncUnblocked) {
				console.warn("Code execution proceeding despite sync being blocked (timeout reached)");
			}

			const codeBlock: CodeBlock = {
				code: code,
				cellIndex: currentIndex,
				language,
			};

			if (!activeFile) {
				setIsLoading(false);
				return;
			}

			await executor.executeCodeBlock(codeBlock, mode);

			setTimeout(async () => {
				await renderOutputs();
				notifyOutputsUpdated();
				try {
					await fs.utimes(path, new Date(), new Date());
				} catch(e) {
					// ignore
				}
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

	const handleRun = async () => {
		await runCodeBlock("cell");
	};

	const handleRunAbove = async () => {
		await runCodeBlock("above");
	};

	const handleRunCellAndBelow = async () => {
		await runCodeBlock("cell-and-below");
	};

	const handleToggleRunMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setIsRunMenuOpen((value) => !value);
	};

	const handleClear = async () => {
		if (!path || currentIndex === undefined) return;

		setIsRunMenuOpen(false);
		setOutput("");
		setHasOutput(false);

		try {
			const ipynbPath = path.replace(/\.md$/, ".ipynb");

			try {
				await fs.access(ipynbPath);
			} catch (e) {
				await renderOutputs();
				return;
			}

			const raw = await fs.readFile(ipynbPath, "utf-8");
			const notebook = JSON.parse(raw);
			const cells = notebook.cells.filter((c: { cell_type: string }) => c.cell_type === "code");

			if (cells.length <= currentIndex || !cells[currentIndex]) {
				await renderOutputs();
				return;
			}

			cells[currentIndex].outputs = [];
			cells[currentIndex].execution_count = null;
			await fs.writeFile(ipynbPath, JSON.stringify(notebook, null, 2));
			await runJupytext(plugin.settings.toolingPython, ["--sync", ipynbPath]);
			notifyOutputsUpdated();
		} catch (err) {
			console.error("Error clearing outputs:", err);
			await renderOutputs();
		}
	};

	useEffect(() => {
		if (executionEnabled) void renderOutputs();
	}, [path, currentIndex, executionEnabled]);

	useEffect(() => {
		if (!executionEnabled) return;

		const checkPairing = async () => {
			if (activeFile) {
				const paired = await isNotebookPaired(plugin.app, activeFile);
				setIsPaired(paired);
			}
		};
		checkPairing();

		const eventRef = plugin.app.metadataCache.on("changed", (file: { path: any; }) => {
			if (activeFile && file.path === activeFile.path) {
				checkPairing();
			}
		});

		return () => {
			plugin.app.metadataCache.offref(eventRef);
		};
	}, [activeFile, executionEnabled]);

	useEffect(() => {
		const handleDocumentMouseDown = (event: MouseEvent) => {
			if (runMenuRef.current?.contains(event.target as Node)) {
				return;
			}

			if (runDropdownMenuRef.current?.contains(event.target as Node)) {
				return;
			}

			setIsRunMenuOpen(false);
		};

		const handleDocumentKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsRunMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleDocumentMouseDown);
		document.addEventListener("keydown", handleDocumentKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleDocumentMouseDown);
			document.removeEventListener("keydown", handleDocumentKeyDown);
		};
	}, []);

	useLayoutEffect(() => {
		if (!isRunMenuOpen) {
			setRunMenuPosition(null);
			return;
		}

		const updateRunMenuPosition = () => {
			if (!runMenuRef.current || !runDropdownMenuRef.current) {
				return;
			}

			const anchorRect = runMenuRef.current.getBoundingClientRect();
			const menuRect = runDropdownMenuRef.current.getBoundingClientRect();
			const gutter = 6;
			const viewportPadding = 8;

			let left = anchorRect.left;
			if (left + menuRect.width > window.innerWidth - viewportPadding) {
				left = Math.max(viewportPadding, window.innerWidth - menuRect.width - viewportPadding);
			}

			let top = anchorRect.bottom + gutter;
			const fitsBelow = top + menuRect.height <= window.innerHeight - viewportPadding;
			const aboveTop = anchorRect.top - menuRect.height - gutter;
			if (!fitsBelow && aboveTop >= viewportPadding) {
				top = aboveTop;
			}

			setRunMenuPosition({top, left});
		};

		updateRunMenuPosition();
		window.addEventListener("resize", updateRunMenuPosition);
		window.addEventListener("scroll", updateRunMenuPosition, true);

		return () => {
			window.removeEventListener("resize", updateRunMenuPosition);
			window.removeEventListener("scroll", updateRunMenuPosition, true);
		};
	}, [isRunMenuOpen]);

	useEffect(() => {
		if (!executionEnabled) return;

		const handleOutputsUpdated = (event: Event) => {
			const customEvent = event as CustomEvent<{path?: string}>;
			if (customEvent.detail?.path && customEvent.detail.path !== path) {
				return;
			}

			void renderOutputs();
		};

		document.addEventListener(OUTPUTS_UPDATED_EVENT, handleOutputsUpdated);

		return () => {
			document.removeEventListener(OUTPUTS_UPDATED_EVENT, handleOutputsUpdated);
		};
	}, [path, code, currentIndex, activeFile, executionEnabled]);

	return (
		<div className="code-container">
			<div className={`code-top-bar${executionEnabled ? "" : " code-top-bar-static"}`}>
				{executionEnabled && <div className="code-buttons">
					<div
						className={`run-action-group${isRunMenuOpen ? " run-action-group-open" : ""}`}
						ref={runMenuRef}
					>
						<button
							onClick={handleRun}
							disabled={isLoading}
							className="split-run-button split-run-button-main"
							aria-label="Run cell"
						>
							{isLoading ? (
								<LoadIcon className="icon grey-icon"/>
							) : (
								<RunIcon className="icon grey-icon"/>
							)}
						</button>
						<button
							onClick={handleToggleRunMenu}
							disabled={isLoading}
							className="split-run-button split-run-button-toggle"
							aria-label="More run actions"
							aria-haspopup="menu"
							aria-expanded={isRunMenuOpen}
						>
							<ChevronDownIcon className="icon grey-icon chevron-icon"/>
						</button>
					</div>
					{isRunMenuOpen && createPortal(
						<div
							className="run-dropdown-menu"
							role="menu"
							ref={runDropdownMenuRef}
							style={runMenuPosition ? {
								top: `${runMenuPosition.top}px`,
								left: `${runMenuPosition.left}px`,
							} : undefined}
						>
							<button
								onClick={handleRunAbove}
								disabled={isLoading || currentIndex === 0}
								className="run-dropdown-item"
								role="menuitem"
								aria-label="Run above"
							>
								<RunAboveIcon className="icon grey-icon"/>
							</button>
							<button
								onClick={handleRunCellAndBelow}
								disabled={isLoading}
								className="run-dropdown-item"
								role="menuitem"
								aria-label="Run below"
							>
								<RunBelowIcon className="icon grey-icon"/>
							</button>
						</div>,
						document.body
					)}
					<button
						onClick={handleClear}
						disabled={!hasOutput}
						className="icon-button"
						aria-label="Clear output"
					>
						<ClearIcon className="icon grey-icon"/>
					</button>
				</div>}
				<div className="code-lang-label">
					{languageSupportRegistry.getDisplayName(language)}
				</div>
			</div>

				<div className="code-source" onClick={handleCodeClick}>
				<HighlightedCodeBlock
					code={code}
					language={language}
				/>
			</div>

			{executionEnabled && isPaired && hasOutput && (
				<div className="code-output">
                    {output}
				</div>
			)}
		</div>
	);
};
