import {build} from 'esbuild';
import {readdir, mkdir, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
const suite = process.argv[2];
if (!['unit', 'integration', 'regressions'].includes(suite)) throw new Error('Expected unit, integration or regressions');
const files = (await readdir(`test/${suite}`)).filter(file => file.endsWith('.test.ts'));
await rm(`.test-build/${suite}`, {recursive: true, force: true});
await mkdir(`.test-build/${suite}`, {recursive: true});
await build({
    entryPoints: files.map(file => `test/${suite}/${file}`),
    outdir: `.test-build/${suite}`, outExtension: {'.js': '.cjs'},
    bundle: true, platform: 'node', format: 'cjs', target: 'node22',
    packages: 'external', sourcemap: 'inline', loader: {'.py': 'text'},
    alias: {obsidian: resolve('test/support/obsidian-stub.ts')},
});
const child = spawn(process.execPath, [
    '--enable-source-maps', 'node_modules/mocha/bin/mocha.js',
    '--require', './test/support/node-globals.cjs',
    '--timeout', suite === 'unit' ? '5000' : '60000',
    `.test-build/${suite}/*.cjs`, ...process.argv.slice(3),
], {stdio: 'inherit'});
child.on('exit', code => {process.exitCode = code ?? 1;});
