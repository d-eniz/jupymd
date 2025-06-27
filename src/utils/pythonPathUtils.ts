import {exec} from "child_process";

export async function validatePythonPath(pythonPath?: string): Promise<boolean> {
    if (!pythonPath?.trim()) return false;

    return new Promise((resolve) => {
        exec(`"${pythonPath.trim()}" --version`, { timeout: 3000 }, (error) => {
            resolve(!error);
        });
    });
}

export function getDefaultPythonPath(): string {
    if (process.platform === "win32") {
        return "python";
    }
    return "python3";  // macOS and Linux typically use 'python3'
}

export function getPackageExecutablePath(packageName: string, pythonPath: string): string {
    // Method 1: Use Python's -m flag to run modules
    return `"${pythonPath}" -m ${packageName}`;
}