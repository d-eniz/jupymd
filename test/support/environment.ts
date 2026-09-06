import {existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {mkdtemp, mkdir, writeFile, readFile, rm, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
export function testPython(name: 'tooling' | 'kernel') {
    const executable = resolve('.test-env', name, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    if (!existsSync(executable)) throw new Error('Test Python missing. Run: python test/setup-python.py (Python 3.12 recommended).');
    return executable;
}
export async function workspace() {
    return mkdtemp(join(tmpdir(), 'jupymd-test-'));
}
export async function installKernel(dataDir: string, name = 'jupymd-test-python') {
    const directory = join(dataDir, 'kernels', name);
    await mkdir(directory, {recursive: true});
    await writeFile(join(directory, 'kernel.json'), JSON.stringify({
        argv: [testPython('kernel'), '-m', 'ipykernel_launcher', '-f', '{connection_file}'],
        display_name: 'JupyMD Test Python', language: 'python',
    }));
    return name;
}
export async function preserveFailure(directory: string, title: string) {
    const destination = resolve('test-results', `${Date.now()}-${title.replace(/[^a-z0-9]+/gi, '-').slice(0, 100)}`);
    await mkdir(destination, {recursive: true});
    await cp(directory, join(destination, 'workspace'), {recursive: true});
    await writeFile(join(destination, 'runtime.json'), JSON.stringify({node: process.version, platform: process.platform}, null, 2));
    console.error(`Failure workspace: ${destination}`);
}
export {join, readFile, writeFile, mkdir, rm};
