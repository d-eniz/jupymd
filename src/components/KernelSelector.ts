import {App, FuzzySuggestModal, FuzzyMatch, Modal, Notice, Setting} from "obsidian";
import {execFile} from "child_process";
import {promisify} from "util";
import * as path from "path";
import JupyMDPlugin from "../main";
import {CreateVenvModal} from "./CreateVenvModal";
import {
	discoverPythonEnvironments,
	PythonEnvironmentInfo,
} from "../utils/pythonEnvironmentDiscovery";
import {validatePythonPath} from "../utils/pythonPathUtils";
import {runQuickSetup} from "../utils/quickSetup";
import {installLibs} from "../utils/helpers";
import {KernelConnection} from "../kernels/types";
import {languageSupportRegistry} from "../languages/LanguageSupport";

const execFileAsync = promisify(execFile);
const TOOLING_PACKAGES = "jupytext jupyter_client";

type CustomPathOption = {
	label: string;
	path: string;
	version: string;
	type: "system";
	isCustomPath: true;
};

type CreateVenvOption = {
	label: string;
	path: string;
	version?: string;
	type: "venv";
	isCreateVenv: true;
};

type PythonEnvironmentOption = PythonEnvironmentInfo | CustomPathOption | CreateVenvOption;

function isCustomPathOption(option: PythonEnvironmentOption): option is CustomPathOption {
	return "isCustomPath" in option;
}

function isCreateVenvOption(option: PythonEnvironmentOption): option is CreateVenvOption {
	return "isCreateVenv" in option;
}

function createVenvOption(): CreateVenvOption {
	return {
		label: "Create Python environment",
		path: "Create a virtual environment in the vault",
		type: "venv",
		isCreateVenv: true,
	};
}

class ConfirmModal extends Modal {
	private resolver: ((value: boolean) => void) | null = null;

	constructor(app: App, private titleText: string, private description: string, private confirmText: string) {
		super(app);
	}

	openAndGetValue(): Promise<boolean> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		this.setTitle(this.titleText);
		this.contentEl.createEl("p", {text: this.description});
		new Setting(this.contentEl)
			.addButton((button) => button.setButtonText(this.confirmText).setCta().onClick(() => {
				this.resolver?.(true);
				this.resolver = null;
				this.close();
			}))
			.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
		this.resolver?.(false);
		this.resolver = null;
	}
}

export async function selectAndPrepareToolingEnvironment(
	app: App,
	currentPythonPath: string
): Promise<string | null> {
	const selectedPath = await new PythonEnvironmentSelectorModal(
		app,
		currentPythonPath,
		""
	).openAndGetValue();
	if (!selectedPath) return null;

	const confirmed = await new ConfirmModal(
		app,
		"Install required Jupyter tooling",
		`JupyMD requires Jupytext to synchronize notebooks and Jupyter Client to discover and run kernels. They will be installed in ${selectedPath}. Proceed with this tooling environment?`,
		"Install and use"
	).openAndGetValue();
	if (!confirmed) return null;

	new Notice("Installing required Jupyter tooling…");
	return await installLibs(selectedPath, TOOLING_PACKAGES) ? selectedPath : null;
}

export class PythonEnvironmentSelectorModal extends FuzzySuggestModal<PythonEnvironmentOption> {
	private environments: PythonEnvironmentInfo[] = [];
	private resolver: ((path: string | null) => void) | null = null;
	private resolved = false;
	private isChoosing = false;
	private isLoading = true;

	constructor(
		app: App,
		private initialPythonPath: string,
		private createEnvironmentPackages = "ipykernel"
	) {
		super(app);
		this.setPlaceholder("Select a Python environment or type a custom path…");
		this.setInstructions([
			{command: "↑↓", purpose: "navigate"},
			{command: "↵", purpose: "select"},
			{command: "esc", purpose: "dismiss"},
		]);
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		super.onOpen();
		this.isLoading = true;
		this.emptyStateText = "Discovering Python environments…";
		// @ts-ignore - internal Obsidian API
		this.updateSuggestions();
		void this.loadEnvironments();
	}

	onClose() {
		super.onClose();
		if (this.isChoosing) return;
		if (!this.resolved) this.resolver?.(null);
		this.resolver = null;
	}

	selectSuggestion(value: FuzzyMatch<PythonEnvironmentOption>, evt: MouseEvent | KeyboardEvent): void {
		this.isChoosing = true;
		super.selectSuggestion(value, evt);
	}

	getItems(): PythonEnvironmentOption[] {
		return this.environments;
	}

	getSuggestions(query: string): FuzzyMatch<PythonEnvironmentOption>[] {
		if (this.isLoading) return [];

		const suggestions = super.getSuggestions(query);
		const createSuggestion: FuzzyMatch<PythonEnvironmentOption> = {
			item: createVenvOption(),
			match: {score: -2, matches: []},
		};
		const typed = query.trim();

		if (!typed) {
			const initial = this.environments.find((environment) => environment.path === this.initialPythonPath);
			const ordered = initial
				? [
					{item: initial, match: {score: Number.MAX_SAFE_INTEGER, matches: []}},
					...suggestions.filter((suggestion) => suggestion.item.path !== initial.path),
				]
				: suggestions;
			return [createSuggestion, ...ordered];
		}

		const exact = this.environments.some((environment) => environment.path.toLowerCase() === typed.toLowerCase());
		if (exact) return [createSuggestion, ...suggestions];

		return [
			createSuggestion,
			{
				item: {
					label: `Use custom path: ${typed}`,
					path: typed,
					version: "Validate on select",
					type: "system",
					isCustomPath: true,
				},
				match: {score: -1, matches: []},
			},
			...suggestions,
		];
	}

	getItemText(item: PythonEnvironmentOption): string {
		return `${item.label} ${item.version || ""} ${item.path} ${item.type}`;
	}

	renderSuggestion(match: FuzzyMatch<PythonEnvironmentOption>, el: HTMLElement) {
		const item = match.item;
		const badge = isCreateVenvOption(item)
			? null
			: isCustomPathOption(item)
				? {cls: "kernel-badge-custom", text: "custom"}
				: item.source === "pyenv"
					? {cls: "kernel-badge-pyenv", text: "pyenv"}
					: {cls: `kernel-badge-${item.type}`, text: item.type};

		const wrapper = el.createDiv({cls: "kernel-suggestion"});
		const topRow = wrapper.createDiv({cls: "kernel-suggestion-top"});
		topRow.createSpan({cls: "kernel-suggestion-label", text: item.label});
		if (badge) {
			topRow.createSpan({cls: `kernel-suggestion-badge ${badge.cls}`, text: badge.text});
		}
		const bottomRow = wrapper.createDiv({cls: "kernel-suggestion-bottom"});
		if (item.version) bottomRow.createSpan({cls: "kernel-suggestion-version", text: item.version});
		bottomRow.createSpan({cls: "kernel-suggestion-path", text: item.path});
	}

	async onChooseItem(item: PythonEnvironmentOption) {
		let selectedPath: string | null = null;
		try {
			if (isCreateVenvOption(item)) {
				const config = await new CreateVenvModal(this.app, this.initialPythonPath).openAndGetValue();
				if (config) {
					selectedPath = await runQuickSetup(
						this.app,
						config.basePythonPath,
						config.envName,
						this.createEnvironmentPackages
					);
				}
			} else {
				if (isCustomPathOption(item) && !await validatePythonPath(item.path)) {
					new Notice(`Invalid Python path: ${item.path}`);
				} else {
					selectedPath = item.path;
				}
			}
		} catch (error) {
			console.error("Failed to select Python environment:", error);
			new Notice("Failed to prepare Python environment. Check the console for details.");
		}

		if (selectedPath) {
			this.resolved = true;
			this.resolver?.(selectedPath);
			this.resolver = null;
		} else {
			this.resolver?.(null);
			this.resolver = null;
		}
		this.isChoosing = false;
	}

	private async loadEnvironments() {
		try {
			this.environments = await discoverPythonEnvironments(this.app);
		} catch (error) {
			console.error("Python environment discovery failed:", error);
			this.environments = [];
		} finally {
			this.isLoading = false;
			this.emptyStateText = "No Python environments found. Type a Python executable path to use it directly.";
			// @ts-ignore - internal Obsidian API
			this.updateSuggestions();
		}
	}
}
class JupyterKernelSelectorModal extends FuzzySuggestModal<KernelConnection> {
	private kernels: KernelConnection[] = [];
	private resolver: ((kernel: KernelConnection | null) => void) | null = null;
	private resolved = false;
	private isChoosing = false;
	private recoveryAttempted = false;

	constructor(
		app: App,
		private plugin: JupyMDPlugin,
		private currentKernelName?: string,
		private preferredLanguage?: string
	) {
		super(app);
		this.setPlaceholder("Select an installed Jupyter kernel…");
		this.setInstructions([
			{command: "↑↓", purpose: "navigate"},
			{command: "↵", purpose: "select"},
			{command: "esc", purpose: "back"},
		]);
	}

	openAndGetValue(): Promise<KernelConnection | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		super.onOpen();
		this.emptyStateText = "No installed Jupyter kernels found.";
		void this.loadKernels();
	}

	onClose() {
		super.onClose();
		if (this.isChoosing) return;
		if (!this.resolved) this.resolver?.(null);
		this.resolver = null;
	}

	selectSuggestion(value: FuzzyMatch<KernelConnection>, evt: MouseEvent | KeyboardEvent): void {
		this.isChoosing = true;
		super.selectSuggestion(value, evt);
	}

	getItems(): KernelConnection[] {
		return this.kernels;
	}

	getSuggestions(query: string): FuzzyMatch<KernelConnection>[] {
		const suggestions = super.getSuggestions(query);
		if (query.trim()) return suggestions;

		const current = this.currentKernelName
			? suggestions.find((suggestion) => suggestion.item.name.toLowerCase() === this.currentKernelName?.toLowerCase())
			: undefined;
		let ordered = current
			? [current, ...suggestions.filter((suggestion) => suggestion.item !== current.item)]
			: suggestions;
		if (!current && this.preferredLanguage) {
			const preferred = this.preferredLanguage.toLowerCase();
			ordered = [
				...ordered.filter((suggestion) => languageSupportRegistry.matches(preferred, suggestion.item.language)),
				...ordered.filter((suggestion) => !languageSupportRegistry.matches(preferred, suggestion.item.language)),
			];
		}
		return ordered;
	}

	getItemText(item: KernelConnection): string {
		return `${item.displayName} ${item.name} ${item.language} ${item.resourceDir}`;
	}

	renderSuggestion(match: FuzzyMatch<KernelConnection>, el: HTMLElement) {
		const item = match.item;
		const wrapper = el.createDiv({cls: "kernel-suggestion"});
		const topRow = wrapper.createDiv({cls: "kernel-suggestion-top"});
		topRow.createSpan({cls: "kernel-suggestion-label", text: item.displayName});
		const badgeText = item.isManaged ? "managed" : item.language || "kernel";
		topRow.createSpan({cls: "kernel-suggestion-badge kernel-badge-system", text: badgeText});
		const bottomRow = wrapper.createDiv({cls: "kernel-suggestion-bottom"});
		bottomRow.createSpan({cls: "kernel-suggestion-version", text: item.name});
		bottomRow.createSpan({cls: "kernel-suggestion-path", text: item.resourceDir});
	}

	onChooseItem(item: KernelConnection) {
		this.resolved = true;
		this.resolver?.(item);
		this.resolver = null;
		this.isChoosing = false;
	}

	private async loadKernels() {
		try {
			this.kernels = (await (this.plugin as any).kernelService.listKernels())
				.filter((kernel: KernelConnection) => !kernel.isManaged);
		} catch (error) {
			let discoveryError = error;
			if (!this.recoveryAttempted) {
				this.recoveryAttempted = true;
				const repaired = await this.offerToolingRepair();
				if (repaired) {
					try {
						this.kernels = (await (this.plugin as any).kernelService.listKernels())
				.filter((kernel: KernelConnection) => !kernel.isManaged);
						discoveryError = null;
					} catch (retryError) {
						discoveryError = retryError;
					}
				}
			}

			if (discoveryError) {
				console.error("Jupyter kernel discovery failed:", discoveryError);
				new Notice("Jupyter tooling is unavailable. Repair it here or select another tooling environment in settings.");
				this.emptyStateText = "Jupyter tooling is unavailable. Press Esc to choose another source.";
				this.kernels = [];
			}
		} finally {
			// @ts-ignore - internal Obsidian API
			this.updateSuggestions();
		}
	}

	private async offerToolingRepair(): Promise<boolean> {
		const toolingPython = this.plugin.settings.toolingPython;
		const executableExists = await validatePythonPath(toolingPython);
		const title = executableExists ? "Install Jupyter tooling" : "Repair Jupyter tooling";
		const description = executableExists
			? `The tooling environment at ${toolingPython} cannot start the Jupyter bridge. Install Jupytext and Jupyter Client into it?`
			: `The configured tooling Python no longer exists: ${toolingPython}. Recreate the vault-local .jupymd environment with Jupytext and Jupyter Client?`;
		const confirmed = await new ConfirmModal(this.app, title, description, executableExists ? "Install" : "Repair")
			.openAndGetValue();
		if (!confirmed) return false;

		if (executableExists) {
			if (!await installLibs(toolingPython, TOOLING_PACKAGES)) return false;
			await (this.plugin as any).updateToolingPython(toolingPython);
			return true;
		}

		const repairedPython = await runQuickSetup(
			this.app,
			undefined,
			".jupymd",
			TOOLING_PACKAGES
		);
		if (!repairedPython) return false;
		await (this.plugin as any).updateToolingPython(repairedPython);
		return true;
	}
}

export class KernelSelectorModal {
	constructor(private app: App, private plugin: JupyMDPlugin) {}

	open(): void {
		void new PythonEnvironmentSelectorModal(
			this.app,
			this.plugin.settings.pythonInterpreter
		).openAndGetValue().then(async (selectedPath) => {
			if (selectedPath) await this.plugin.updateInterpreter(selectedPath);
		});
	}
}
