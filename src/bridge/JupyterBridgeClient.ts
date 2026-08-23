import {spawn} from "child_process";
import * as path from "path";
import {KernelConnection, KernelExecutionResult} from "../kernels/types";
import {JUPYTER_BRIDGE_SOURCE} from "./pythonBridgeSource";

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: number;
};

type BridgeProcess = {
	stdin: {write(data: string): boolean};
	stdout: {
		setEncoding(encoding: string): unknown;
		on(event: "data", listener: (chunk: string) => void): unknown;
	};
	stderr: {
		setEncoding(encoding: string): unknown;
		on(event: "data", listener: (chunk: string) => void): unknown;
	};
	on(event: "error", listener: (error: Error) => void): unknown;
	on(event: "close", listener: (code: number | null) => void): unknown;
	kill(): boolean;
};

type BridgeMessage = {
	event?: string;
	id?: number;
	ok?: boolean;
	result?: unknown;
	error?: string;
	details?: unknown;
};

function isBridgeMessage(value: unknown): value is BridgeMessage {
	if (!value || typeof value !== "object") return false;
	const candidate = value as BridgeMessage;
	return candidate.event === "ready" || typeof candidate.id === "number";
}

export class JupyterBridgeClient {
	private process: BridgeProcess | null = null;
	private stdoutBuffer = "";
	private nextRequestId = 1;
	private pending = new Map<number, PendingRequest>();
	private readyPromise: Promise<void> | null = null;
	private readyResolve: (() => void) | null = null;
	private readyReject: ((error: Error) => void) | null = null;

	constructor(
		private toolingPython: string,
		private readonly jupyterDataDir: string
	) {}

	async setToolingPython(toolingPython: string): Promise<void> {
		if (this.toolingPython === toolingPython) return;
		await this.dispose();
		this.toolingPython = toolingPython;
	}

	async listKernels(): Promise<KernelConnection[]> {
		return this.request<KernelConnection[]>("list_kernels", {}, 30000);
	}

	async execute(
		sessionKey: string,
		kernelName: string,
		cwd: string,
		code: string,
		timeoutSeconds = 300
	): Promise<KernelExecutionResult> {
		return this.request<KernelExecutionResult>("execute", {
			sessionKey,
			kernelName,
			cwd,
			code,
			timeout: timeoutSeconds,
		}, (timeoutSeconds + 15) * 1000);
	}

	async interrupt(sessionKey: string): Promise<boolean> {
		const result = await this.request<{interrupted: boolean}>("interrupt", {sessionKey}, 10000);
		return result.interrupted;
	}

	async restart(sessionKey: string): Promise<boolean> {
		const result = await this.request<{restarted: boolean}>("restart", {sessionKey}, 30000);
		return result.restarted;
	}

	async shutdown(sessionKey: string): Promise<void> {
		await this.request("shutdown", {sessionKey}, 10000);
	}

	async dispose(): Promise<void> {
		const currentProcess = this.process;
		if (!currentProcess) return;

		try {
			await this.request("shutdown_all", {}, 5000);
		} catch {
			// Process termination below is the final cleanup path.
		}

		currentProcess.kill();
		this.resetProcess(new Error("Jupyter bridge stopped"));
	}

	private async request<T>(operation: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T> {
		await this.ensureStarted();
		const requestId = this.nextRequestId++;

		return new Promise<T>((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(requestId);
				reject(new Error(`Jupyter bridge request timed out: ${operation}`));
			}, timeoutMs);

			this.pending.set(requestId, {
				resolve: (value) => resolve(value as T),
				reject,
				timer,
			});
			if (!this.process) {
				window.clearTimeout(timer);
				this.pending.delete(requestId);
				reject(new Error("Jupyter bridge is not available"));
				return;
			}
			this.process.stdin.write(JSON.stringify({
				id: requestId,
				operation,
				...payload,
			}) + "\n");
		});
	}

	private async ensureStarted(): Promise<void> {
		if (this.process && this.readyPromise) {
			return this.readyPromise;
		}

		const env = {...process.env};
		env.JUPYTER_PATH = [this.jupyterDataDir, env.JUPYTER_PATH || ""]
			.filter(Boolean)
			.join(path.delimiter);

		this.readyPromise = new Promise<void>((resolve, reject) => {
			this.readyResolve = resolve;
			this.readyReject = reject;
		});

		const bridgeProcess: BridgeProcess = spawn(this.toolingPython, ["-u", "-c", JUPYTER_BRIDGE_SOURCE], {
			env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.process = bridgeProcess;

		bridgeProcess.stdout.setEncoding("utf-8");
		bridgeProcess.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
		bridgeProcess.stderr.setEncoding("utf-8");
		bridgeProcess.stderr.on("data", (chunk: string) => {
			console.error("Jupyter bridge stderr:", chunk.trimEnd());
		});
		bridgeProcess.on("error", (error) => {
			this.readyReject?.(error);
			this.resetProcess(error);
		});
		bridgeProcess.on("close", (code) => {
			const error = new Error(`Jupyter bridge exited with code ${code}`);
			this.readyReject?.(error);
			this.resetProcess(error);
		});

		const startupTimer = window.setTimeout(() => {
			if (this.readyReject) {
				const error = new Error("Jupyter bridge initialization timed out");
				this.readyReject(error);
				bridgeProcess.kill();
			}
		}, 15000);

		this.readyPromise.then(
			() => window.clearTimeout(startupTimer),
			() => window.clearTimeout(startupTimer)
		);
		return this.readyPromise;
	}

	private handleStdout(chunk: string): void {
		this.stdoutBuffer += chunk;
		let newlineIndex = this.stdoutBuffer.indexOf("\n");

		while (newlineIndex !== -1) {
			const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
			this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
			if (line) this.handleMessage(line);
			newlineIndex = this.stdoutBuffer.indexOf("\n");
		}
	}

	private handleMessage(line: string): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (error) {
			console.error("Invalid Jupyter bridge message:", line, error);
			return;
		}
		if (!isBridgeMessage(parsed)) {
			console.error("Invalid Jupyter bridge message shape:", line);
			return;
		}
		const message = parsed;

		if (message.event === "ready") {
			this.readyResolve?.();
			this.readyResolve = null;
			this.readyReject = null;
			return;
		}

		if (message.id === undefined) return;
		const pending = this.pending.get(message.id);
		if (!pending) return;
		window.clearTimeout(pending.timer);
		this.pending.delete(message.id);

		if (message.ok) {
			pending.resolve(message.result);
		} else {
			const error = new Error(message.error || "Jupyter bridge request failed");
			if (message.details) console.error("Jupyter bridge error details:", message.details);
			pending.reject(error);
		}
	}

	private resetProcess(error: Error): void {
		if (!this.process && !this.readyPromise) return;
		this.process = null;
		this.readyPromise = null;
		this.readyResolve = null;
		this.readyReject = null;
		this.stdoutBuffer = "";

		for (const pending of this.pending.values()) {
			window.clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}
