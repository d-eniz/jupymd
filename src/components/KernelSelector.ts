import {App, FuzzySuggestModal, FuzzyMatch, Notice} from "obsidian";
import JupyMDPlugin from "../main";
import {CreateVenvModal} from "./CreateVenvModal";
import {discoverKernels, KernelInfo} from "../utils/kernelDiscovery";
import {validatePythonPath} from "../utils/pythonPathUtils";
import {runQuickSetup} from "../utils/quickSetup";

const TYPE_BADGE: Record<KernelInfo["type"], string> = {
	venv: "venv",
	system: "system",
};

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

type KernelOption = KernelInfo | CustomPathOption | CreateVenvOption;

function isCustomPathOption(option: KernelOption): option is CustomPathOption {
	return "isCustomPath" in option;
}

function isCreateVenvOption(option: KernelOption): option is CreateVenvOption {
	return "isCreateVenv" in option;
}

function createVenvOption(): CreateVenvOption {
	return {
		label: "Create virtual environment",
		path: "Choose the base interpreter path and environment name",
		type: "venv",
		isCreateVenv: true,
	};
}

function getKernelBadge(item: KernelOption): {cls: string; text: string} {
	if (isCustomPathOption(item)) {
		return {cls: "kernel-badge-custom", text: "custom"};
	}

	if (isCreateVenvOption(item)) {
		return {cls: "kernel-badge-create", text: "recommended"};
	}

	if (item.source === "pyenv") {
		return {cls: "kernel-badge-pyenv", text: "pyenv"};
	}

	return {cls: `kernel-badge-${item.type}`, text: TYPE_BADGE[item.type]};
}

export class KernelSelectorModal extends FuzzySuggestModal<KernelOption> {
	private plugin: JupyMDPlugin;
	private kernels: KernelInfo[] = [];
	private isLoading = true;

	constructor(app: App, plugin: JupyMDPlugin) {
		super(app);
		this.plugin = plugin;
		this.setPlaceholder("Select a Python interpreter or type a custom path…");
		this.setInstructions([
			{command: "↑↓", purpose: "navigate"},
			{command: "↵", purpose: "select"},
			{command: "esc", purpose: "dismiss"},
		]);
	}

	onOpen() {
		super.onOpen();
		this.addLoadingHint();
		this.emptyStateText = "Type a Python path to use it directly.";
		this.loadKernels();
	}

	private addLoadingHint() {
		const promptEl = this.containerEl.querySelector(".prompt-results");
		if (promptEl) {
			const hint = promptEl.createEl("div", {
				cls: "suggestion-empty",
				text: "Discovering Python environments…",
			});
			hint.dataset.loadingHint = "true";
		}
	}

	private removeLoadingHint() {
		const hint = this.containerEl.querySelector('[data-loading-hint="true"]');
		hint?.remove();
	}

	private async loadKernels() {
		try {
			this.kernels = await discoverKernels(this.app);
		} catch (e) {
			console.error("Kernel discovery failed:", e);
			this.kernels = [];
		} finally {
			this.isLoading = false;
			this.removeLoadingHint();
			// Trigger re-render of the suggestion list
			// @ts-ignore – internal Obsidian API
			this.updateSuggestions();
		}
	}

	getItems(): KernelOption[] {
		return this.kernels;
	}

	getSuggestions(query: string): FuzzyMatch<KernelOption>[] {
		const suggestions = super.getSuggestions(query);
		const createOptionSuggestion: FuzzyMatch<KernelOption> = {
			item: createVenvOption(),
			match: {
				score: -2,
				matches: [],
			},
		};

		const typed = query.trim();
		if (!typed) {
			return [createOptionSuggestion, ...suggestions];
		}

		const normalizedTyped = typed.toLowerCase();
		const hasExactPathMatch = this.kernels.some((kernel) => kernel.path.toLowerCase() === normalizedTyped);
		if (hasExactPathMatch) {
			return [createOptionSuggestion, ...suggestions];
		}

		return [
			createOptionSuggestion,
			{
				item: {
					label: `Use custom path: ${typed}`,
					path: typed,
					version: "Validate on select",
					type: "system",
					isCustomPath: true,
				},
				match: {
					score: -1,
					matches: [],
				},
			},
			...suggestions,
		];
	}

	getItemText(item: KernelOption): string {
		// Used for fuzzy matching – include label, path and type so all are searchable
		return `${item.label} ${item.version} ${item.path} ${item.type}`;
	}

	renderSuggestion(match: FuzzyMatch<KernelOption>, el: HTMLElement) {
		const item = match.item;
		const badge = getKernelBadge(item);

		const wrapper = el.createDiv({cls: "kernel-suggestion"});

		const topRow = wrapper.createDiv({cls: "kernel-suggestion-top"});
		topRow.createSpan({cls: "kernel-suggestion-label", text: item.label});
		topRow.createSpan({
			cls: `kernel-suggestion-badge ${badge.cls}`,
			text: badge.text,
		});

		const bottomRow = wrapper.createDiv({cls: "kernel-suggestion-bottom"});
		if (item.version) {
			bottomRow.createSpan({cls: "kernel-suggestion-version", text: item.version});
		}
		bottomRow.createSpan({cls: "kernel-suggestion-path", text: item.path});
	}

	async onChooseItem(item: KernelOption) {
		if (isCreateVenvOption(item)) {
			const config = await new CreateVenvModal(
				this.app,
				this.plugin.settings.pythonInterpreter
			).openAndGetValue();
			if (!config) {
				return;
			}

			const success = await runQuickSetup(
				this.app,
				this.plugin,
				config.basePythonPath,
				config.envName
			);
			if (!success) {
				return;
			}

			this.kernels = await discoverKernels(this.app);
			this.close();
			return;
		}

		if (isCustomPathOption(item)) {
			const valid = await validatePythonPath(item.path);
			if (!valid) {
				new Notice(`Invalid Python path: ${item.path}`);
				return;
			}

			await this.plugin.updateInterpreter(item.path);
			new Notice(`Python kernel set to: ${item.path}`);
			return;
		}

		await this.plugin.updateInterpreter(item.path);
		new Notice(`Python kernel set to: ${item.label} (${item.version})`);
	}
}
