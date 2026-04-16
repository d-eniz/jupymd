import {App, FuzzyMatch, FuzzySuggestModal, Modal, Notice, Setting} from "obsidian";
import {discoverKernels, KernelInfo} from "../utils/kernelDiscovery";
import {validatePythonPath} from "../utils/pythonPathUtils";

export type CreateVenvResult = {
	basePythonPath: string;
	envName: string;
};

type CustomPathOption = {
	label: string;
	path: string;
	version: string;
	type: "system";
	isCustomPath: true;
};

type CreateVenvInterpreterOption = KernelInfo | CustomPathOption;

function isCustomPathOption(option: CreateVenvInterpreterOption): option is CustomPathOption {
	return "isCustomPath" in option;
}

function getInterpreterBadge(item: CreateVenvInterpreterOption): {cls: string; text: string} {
	if (isCustomPathOption(item)) {
		return {cls: "kernel-badge-custom", text: "custom"};
	}

	if (item.source === "pyenv") {
		return {cls: "kernel-badge-pyenv", text: "pyenv"};
	}

	return {cls: "kernel-badge-system", text: "system"};
}

class VenvNameModal extends Modal {
	private envName: string;
	private resolver: ((result: string | null) => void) | null = null;

	constructor(app: App, initialEnvName: string) {
		super(app);
		this.envName = initialEnvName;
	}

	openAndGetValue(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		const {contentEl} = this;
		// this.setTitle("Name virtual environment");
		contentEl.empty();

		const submit = () => {
			const envName = this.envName.trim();
			if (!envName) {
				new Notice("Environment name cannot be blank.");
				return;
			}

			if (/[\\/]/.test(envName)) {
				new Notice("Environment name should be a single folder name, not a path.");
				return;
			}

			this.resolver?.(envName);
			this.resolver = null;
			this.close();
		};

		new Setting(contentEl)
			.setName("Environment name")
			.setDesc("This folder will be created in the vault root.")
			.addText((text) => {
				text.setPlaceholder(".jupymd");
				text.setValue(this.envName);
				text.inputEl.focus();
				text.inputEl.select();
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						submit();
					}
				});
				text.onChange((value) => {
					this.envName = value.trim();
				});
			});

		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText("Create")
					.setCta()
					.onClick(() => {
						submit();
					});
			})
			.addButton((btn) => {
				btn.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					});
			});
	}

	onClose() {
		this.contentEl.empty();
		if (this.resolver) {
			this.resolver(null);
			this.resolver = null;
		}
	}
}

export class CreateVenvModal extends FuzzySuggestModal<CreateVenvInterpreterOption> {
	private readonly initialPythonPath: string;
	private readonly initialEnvName = ".jupymd";
	private availableKernels: KernelInfo[] = [];
	private isChoosingInterpreter = false;
	private resolver: ((result: CreateVenvResult | null) => void) | null = null;

	constructor(app: App, initialPythonPath: string) {
		super(app);
		this.initialPythonPath = initialPythonPath;
		this.setPlaceholder("Select a base interpreter or type a custom path to create the virtual environment…");
		this.setInstructions([
			{command: "↑↓", purpose: "navigate"},
			{command: "↵", purpose: "select"},
			{command: "esc", purpose: "dismiss"},
		]);
	}

	openAndGetValue(): Promise<CreateVenvResult | null> {
		return new Promise((resolve) => {
			this.resolver = resolve;
			this.open();
		});
	}

	onOpen() {
		super.onOpen();
		this.addLoadingHint();
		this.emptyStateText = "No Python interpreters available for environment creation.";
		void this.loadInterpreterOptions();
	}

	onClose() {
		this.removeLoadingHint();
		super.onClose();

		if (this.isChoosingInterpreter) {
			this.isChoosingInterpreter = false;
			return;
		}

		if (this.resolver) {
			this.resolver(null);
			this.resolver = null;
		}
	}

	selectSuggestion(value: FuzzyMatch<CreateVenvInterpreterOption>, evt: MouseEvent | KeyboardEvent): void {
		this.isChoosingInterpreter = true;
		super.selectSuggestion(value, evt);
	}

	getItems(): CreateVenvInterpreterOption[] {
		return this.availableKernels;
	}

	getItemText(item: CreateVenvInterpreterOption): string {
		return `${item.label} ${item.version} ${item.path} ${item.type}`;
	}

	getSuggestions(query: string): FuzzyMatch<CreateVenvInterpreterOption>[] {
		const suggestions = super.getSuggestions(query);
		const typed = query.trim();

		if (typed) {
			const normalizedTyped = typed.toLowerCase();
			const hasExactPathMatch = this.availableKernels.some((kernel) => kernel.path.toLowerCase() === normalizedTyped);
			if (hasExactPathMatch) {
				return suggestions;
			}

			return [
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

		const initialKernel = this.availableKernels.find((kernel) => kernel.path === this.initialPythonPath);
		if (!initialKernel) {
			return suggestions;
		}

		return [
			{
				item: initialKernel,
				match: {
					score: Number.MAX_SAFE_INTEGER,
					matches: [],
				},
			},
			...suggestions.filter((suggestion) => suggestion.item.path !== initialKernel.path),
		];
	}

	renderSuggestion(match: FuzzyMatch<CreateVenvInterpreterOption>, el: HTMLElement) {
		const item = match.item;
		const badge = getInterpreterBadge(item);

		const wrapper = el.createDiv({cls: "kernel-suggestion"});

		const topRow = wrapper.createDiv({cls: "kernel-suggestion-top"});
		topRow.createSpan({cls: "kernel-suggestion-label", text: item.label});
		topRow.createSpan({
			cls: `kernel-suggestion-badge ${badge.cls}`,
			text: badge.text,
		});

		const bottomRow = wrapper.createDiv({cls: "kernel-suggestion-bottom"});
		bottomRow.createSpan({cls: "kernel-suggestion-version", text: item.version});
		bottomRow.createSpan({cls: "kernel-suggestion-path", text: item.path});
	}

	async onChooseItem(item: CreateVenvInterpreterOption) {
		if (isCustomPathOption(item)) {
			const valid = await validatePythonPath(item.path);
			if (!valid) {
				this.isChoosingInterpreter = false;
				this.resolver?.(null);
				this.resolver = null;
				new Notice(`Invalid Python path: ${item.path}`);
				return;
			}
		}

		const envName = await new VenvNameModal(this.app, this.initialEnvName).openAndGetValue();
		if (!envName) {
			this.isChoosingInterpreter = false;
			this.resolver?.(null);
			this.resolver = null;
			return;
		}

		this.resolver?.({
			basePythonPath: item.path,
			envName,
		});
		this.isChoosingInterpreter = false;
		this.resolver = null;
	}

	private addLoadingHint() {
		const promptEl = this.containerEl.querySelector(".prompt-results");
		if (promptEl) {
			const hint = promptEl.createEl("div", {
				cls: "suggestion-empty",
				text: "Discovering Python interpreters…",
			});
			hint.dataset.loadingHint = "true";
		}
	}

	private removeLoadingHint() {
		const hint = this.containerEl.querySelector('[data-loading-hint="true"]');
		hint?.remove();
	}

	private async loadInterpreterOptions() {
		try {
			this.availableKernels = (await discoverKernels(this.app))
				.filter((kernel) => kernel.type === "system");
		} catch (error) {
			console.error("Failed to discover interpreters for venv creation:", error);
			this.availableKernels = [];
		} finally {
			this.removeLoadingHint();
			// @ts-ignore - internal Obsidian API
			this.updateSuggestions();
		}
	}
}
