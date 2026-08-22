import {Plugin, TFile, TAbstractFile, MarkdownView, Notice, setTooltip} from "obsidian";
import {createRoot} from "react-dom/client";
import * as fs from "fs";
import {JupyMDSettingTab} from "./components/Settings";
import {CodeExecutor} from "./components/CodeExecutor";
import {FileSync} from "./components/FileSync";
import {NotebookKernelSelectorModal} from "./components/KernelSelector";
import {DEFAULT_SETTINGS, JupyMDPluginSettings} from "./components/types";
import {registerCommands} from "./commands";
import {NotebookCodeBlock} from "./components/CodeBlock";
import {HighlightedCodeBlock} from "./components/HighlightedCodeBlock";
import {getAbsolutePath, isNotebookPaired, runJupytext} from "./utils/helpers";
import {getDefaultPythonPath} from "./utils/pythonPathUtils";
import {ManagedKernelSpecStore} from "./kernels/ManagedKernelSpecStore";
import {JupyterBridgeClient} from "./bridge/JupyterBridgeClient";
import {NotebookKernelService} from "./kernels/NotebookKernelService";
import {KernelConnection} from "./kernels/types";
import {languageSupportRegistry} from "./languages/LanguageSupport";
import {getExecutableCellIndex} from "./notebook/NotebookCellIndex";
import {formatKernelLabel, getInterpreterInfo} from "./utils/kernelDiscovery";
import * as path from "path";

export default class JupyMDPlugin extends Plugin {
	settings: JupyMDPluginSettings;
	executor: CodeExecutor;
	fileSync: FileSync;
	kernelService: NotebookKernelService;
	private bridge: JupyterBridgeClient;
	private managedKernelSpecs: ManagedKernelSpecStore;
	private kernelStatusBarItem: HTMLElement;
	private settingTab: JupyMDSettingTab;
	private registeredFenceLanguages = new Set<string>();

	async onload() {
		await this.loadSettings();

		this.managedKernelSpecs = new ManagedKernelSpecStore(this.app, this.manifest.id);
		this.bridge = new JupyterBridgeClient(
			this.settings.toolingPython,
			this.managedKernelSpecs.jupyterDataDir
		);
		this.kernelService = new NotebookKernelService(this.bridge, this.managedKernelSpecs);
		this.executor = new CodeExecutor(this, this.kernelService, this.app);
		this.fileSync = new FileSync(this.app, this.settings.toolingPython, this.settings);

		this.kernelStatusBarItem = this.addStatusBarItem();
		this.kernelStatusBarItem.addClass("kernel-status");
		void this.updateStatusBar();
		this.registerDomEvent(this.kernelStatusBarItem, "click", (event: MouseEvent) => {
			void this.handleKernelStatusBarClick(event);
		});

		registerCommands(this);
		this.settingTab = new JupyMDSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.registerVaultEvents();
		if (this.settings.enableCodeBlocks) {
			for (const language of languageSupportRegistry.builtInFenceLanguages) {
				this.registerNotebookCodeBlockProcessor(language);
			}
			void this.registerDiscoveredKernelLanguages();
		}
	}

	async onunload() {
		await this.executor.cleanup();
	}

	async loadSettings() {
		const loaded = await this.loadData() as Partial<JupyMDPluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
		if (!this.settings.toolingPython) {
			this.settings.toolingPython = loaded?.pythonInterpreter || getDefaultPythonPath();
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async updateToolingPython(newPath: string): Promise<void> {
		this.settings.toolingPython = newPath;
		await this.saveSettings();
		await this.bridge.setToolingPython(newPath);
		this.fileSync = new FileSync(this.app, newPath, this.settings);
		this.settingTab?.display();
		void this.registerDiscoveredKernelLanguages();
		new Notice(`Jupyter tooling environment set to: ${newPath}`);
	}

	async createNotebookWithKernel(refreshView = true, preferredLanguage?: string): Promise<boolean> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile) || activeFile.extension !== "md") {
			new Notice("Open a Markdown note before creating a notebook.");
			return false;
		}

		if (await isNotebookPaired(this.app, activeFile)) {
			new Notice("Notebook is already paired with this note.");
			return true;
		}

		const kernel = await new NotebookKernelSelectorModal(this.app, this, undefined, preferredLanguage).openAndGetValue();
		if (!kernel) return false;
		if (this.settings.enableCodeBlocks) this.registerNotebookCodeBlockProcessor(kernel.language);
		const created = await this.fileSync.createNotebook(kernel, refreshView);
		if (created) await this.updateStatusBar();
		return created;
	}

	async ensureKernelForNote(notePath: string): Promise<KernelConnection | null> {
		try {
			const existing = await this.kernelService.resolveKernelForNote(notePath);
			if (existing) return existing;
		} catch (error) {
			console.error("Failed to resolve notebook kernel:", error);
		}

		return this.selectKernelForNote(notePath);
	}

	async selectKernelForNote(notePath?: string): Promise<KernelConnection | null> {
		const activeFile = this.app.workspace.getActiveFile();
		const targetPath = notePath || (activeFile instanceof TFile ? getAbsolutePath(activeFile) : null);
		if (!targetPath) {
			new Notice("No active notebook note.");
			return null;
		}

		const ipynbPath = targetPath.replace(/\.md$/, ".ipynb");
		if (!fs.existsSync(ipynbPath)) {
			new Notice("Create the paired notebook before selecting its kernel.");
			return null;
		}

		let currentName: string | undefined;
		try {
			const notebook = JSON.parse(fs.readFileSync(ipynbPath, "utf-8"));
			currentName = notebook?.metadata?.kernelspec?.name;
		} catch {
			// The selector can still offer recovery for malformed/missing metadata.
		}

		const selected = await new NotebookKernelSelectorModal(this.app, this, currentName).openAndGetValue();
		if (!selected) return null;

		await this.kernelService.setKernelForNote(targetPath, selected);
		await runJupytext(this.settings.toolingPython, ["--sync", ipynbPath]);
		if (this.settings.enableCodeBlocks) this.registerNotebookCodeBlockProcessor(selected.language);
		await this.updateStatusBar();
		new Notice(`Notebook kernel set to: ${selected.displayName}`);
		return selected;
	}

	openKernelSelector(): void {
		void this.selectKernelForNote();
	}

	private registerVaultEvents(): void {
		this.registerEvent(this.app.vault.on("modify", async (file: TAbstractFile) => {
			if (file instanceof TFile && this.settings.autoSync) {
				await this.fileSync.handleSync(file);
			}
		}));

		this.registerEvent(this.app.vault.on("delete", async (file: TAbstractFile) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			try {
				const mdPath = getAbsolutePath(file);
				await this.kernelService.shutdown(mdPath).catch(() => undefined);
				const ipynbPath = mdPath.replace(/\.md$/, ".ipynb");
				if (fs.existsSync(ipynbPath)) fs.unlinkSync(ipynbPath);
			} catch (error) {
				console.error("Failed to delete paired notebook:", error);
			}
		}));

		this.registerEvent(this.app.vault.on("rename", async (file: TAbstractFile, oldPath: string) => {
			if (!(file instanceof TFile) || file.extension !== "md") return;
			try {
				const newMdPath = getAbsolutePath(file);
				const oldMdPath = newMdPath.substring(0, newMdPath.length - file.path.length) + oldPath;
				await this.kernelService.shutdown(oldMdPath).catch(() => undefined);
				const oldIpynbPath = oldMdPath.replace(/\.md$/, ".ipynb");
				const newIpynbPath = newMdPath.replace(/\.md$/, ".ipynb");
				if (fs.existsSync(oldIpynbPath)) {
					fs.renameSync(oldIpynbPath, newIpynbPath);
					this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
						const view = leaf.view;
						if (view instanceof MarkdownView && view.file?.path === file.path) {
							(leaf as any).rebuildView();
						}
					});
				}
			} catch (error) {
				console.error("Failed to rename paired notebook:", error);
			}
		}));

		this.registerEvent(this.app.workspace.on("file-open", () => void this.updateStatusBar()));
		this.registerEvent(this.app.metadataCache.on("changed", (file) => {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile && activeFile.path === file.path) void this.updateStatusBar();
		}));
	}

	private async registerDiscoveredKernelLanguages(): Promise<void> {
		try {
			const kernels = await this.kernelService.listKernels();
			for (const kernel of kernels) {
				const language = kernel.language.trim().toLowerCase();
				if (language) this.registerNotebookCodeBlockProcessor(language);
			}
		} catch (error) {
			console.error("Could not register discovered kernel languages:", error);
		}
	}

	private registerNotebookCodeBlockProcessor(language: string): void {
		const normalizedLanguage = language.trim().toLowerCase();
		if (!normalizedLanguage || this.registeredFenceLanguages.has(normalizedLanguage)) return;
		this.registeredFenceLanguages.add(normalizedLanguage);

		this.registerMarkdownCodeBlockProcessor(normalizedLanguage, async (source, el, ctx) => {
			const sectionInfo = ctx.getSectionInfo(el);
			el.empty();
			const reactRoot = document.createElement("div");
			el.appendChild(reactRoot);
			const sourceFile = this.app.vault.getFileByPath(ctx.sourcePath);
			if (!(sourceFile instanceof TFile)) {
				createRoot(reactRoot).render(<HighlightedCodeBlock code={source} language={normalizedLanguage}/>);
				return;
			}

			const filePath = getAbsolutePath(sourceFile);
			let selectedKernel: KernelConnection | null = null;
			if (await isNotebookPaired(this.app, sourceFile)) {
				selectedKernel = await this.kernelService.resolveKernelForNote(filePath).catch(() => null);
				if (selectedKernel && !languageSupportRegistry.matches(normalizedLanguage, selectedKernel.language)) {
					createRoot(reactRoot).render(
						<NotebookCodeBlock
							code={source}
							path={filePath}
							sourceLineStart={sectionInfo?.lineStart}
							language={normalizedLanguage}
							executionEnabled={false}
							plugin={this}
						/>
					);
					return;
				}
			}
			const fileContent = await this.app.vault.read(sourceFile);
			const kernelLanguage = selectedKernel?.language || normalizedLanguage;
			const index = sectionInfo
				? getExecutableCellIndex(fileContent, sectionInfo.lineStart, kernelLanguage)
				: null;
			if (!sectionInfo || index === null) {
				createRoot(reactRoot).render(<HighlightedCodeBlock code={source} language={normalizedLanguage}/>);
				return;
			}

			createRoot(reactRoot).render(
				<NotebookCodeBlock
					code={source}
					path={filePath}
					index={index}
					sourceLineStart={sectionInfo.lineStart}
					language={normalizedLanguage}
					executor={this.executor}
					plugin={this}
				/>
			);
		});
	}
	private async formatInterpreterForStatusBar(interpreter: string): Promise<string> {
		const info = await getInterpreterInfo(this.app, interpreter);
		if (info) {
			return formatKernelLabel(info.label, info.version);
		}

		return path.basename(interpreter) || interpreter;
	}

	private async updateStatusBar(): Promise<void> {
		if (!this.kernelStatusBarItem) return;

		const activeFile = this.app.workspace.getActiveFile();
		if (!(activeFile instanceof TFile)) {
			this.kernelStatusBarItem.hide();
			return;
		}

		const isPaired = await isNotebookPaired(this.app, activeFile);
		if (!isPaired) {
			this.kernelStatusBarItem.hide();
			return;
		}

		const interpreter = this.settings.pythonInterpreter ? this.settings.pythonInterpreter : "No interpreter";
		const statusText = await this.formatInterpreterForStatusBar(interpreter);
		this.kernelStatusBarItem.show();
		this.kernelStatusBarItem.setText(statusText);
		setTooltip(this.kernelStatusBarItem, `Current Python interpreter: ${interpreter}\nClick to change interpreter\nShift + click to copy path`, {placement: "top"});
		
	}

	private async handleKernelStatusBarClick(event: MouseEvent): Promise<void> {
		if (!event.shiftKey) {
			this.openKernelSelector();
			return;
		}

		const interpreter = this.settings.pythonInterpreter;
		if (!interpreter) {
			new Notice("No interpreter path to copy");
			return;
		}

		try {
			await navigator.clipboard.writeText(interpreter);
			new Notice("Interpreter path copied");
		} catch (error) {
			console.error("Failed to copy interpreter path:", error);
			new Notice("Failed to copy interpreter path");
		}
	}

}
