import {mkdir, copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const destination = '.test-build/plugin';
await mkdir(destination, {recursive: true});
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--skipLibCheck'], {stdio: 'inherit'});
execFileSync(process.execPath, ['esbuild.config.mjs', 'production', `${destination}/main.js`], {stdio: 'inherit'});
for (const file of ['manifest.json', 'styles.css']) await copyFile(file, `${destination}/${file}`);
execFileSync(process.execPath, ['scripts/verify-release-bundle.mjs', `${destination}/main.js`], {stdio: 'inherit'});
