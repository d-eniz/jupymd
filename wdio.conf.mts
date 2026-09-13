import {resolve} from 'node:path';
import {mkdir, writeFile, cp} from 'node:fs/promises';
import {browser} from '@wdio/globals';
import {obsidianPage} from 'wdio-obsidian-service';

const versions = (process.env.OBSIDIAN_VERSIONS || 'latest/latest').split(/\s+/);
export const config: WebdriverIO.Config = {
    runner:'local', framework:'mocha', specs:['./test/e2e/**/*.e2e.ts'],
    maxInstances:1,
    capabilities:versions.map(version => {
        const [appVersion,installerVersion='earliest']=version.split('/');
        return {
            browserName:'obsidian',
            'wdio:obsidianOptions':{
                appVersion,installerVersion,
                plugins:[{path:'.test-build/plugin',enabled:false}],
                vault:'test/fixtures/vault',
            },
            'goog:chromeOptions':{args:['--disable-gpu']},
        };
    }),
    services:['obsidian'], reporters:['obsidian'],
    cacheDir:resolve('.obsidian-cache'), outputDir:resolve('test-results/wdio'),
    logLevel:'warn', waitforTimeout:15000, waitforInterval:100,
    mochaOpts:{ui:'bdd',timeout:90000},
    afterTest:async function(test,_context,{passed}) {
        if(passed) return;
        const directory=resolve('test-results',`${Date.now()}-${test.title.replace(/[^a-z0-9]+/gi,'-').slice(0,100)}`);
        await mkdir(directory,{recursive:true});
        const captures=await Promise.allSettled([
            browser.saveScreenshot(resolve(directory,'screenshot.png')),
            browser.getPageSource().then(source=>writeFile(resolve(directory,'page.html'),source)),
            cp(obsidianPage.getVaultPath(),resolve(directory,'vault'),{recursive:true}),
            browser.executeObsidian(()=>(globalThis as any).__jupymdTestErrors || []).then(log=>writeFile(resolve(directory,'console.json'),JSON.stringify(log,null,2))),
        ]);
        await writeFile(resolve(directory,'runtime.json'),JSON.stringify({
            node:process.version,platform:process.platform,
            app:browser.getObsidianVersion(),installer:browser.getObsidianInstallerVersion(),
            captureErrors:captures.filter(c=>c.status==='rejected').map(c=>String((c as PromiseRejectedResult).reason)),
        },null,2));
    },
};
