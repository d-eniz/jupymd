import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import {freshVault,openNote,seedPair,command,chooseKernel,runCell,expectOutput,notebook,browser,$,expect,obsidianPage} from '../support/obsidian';
import {testPython} from '../support/environment';

async function openToolingSelector() {
    await browser.executeObsidian(({app})=>{(app as any).setting.open();(app as any).setting.openTabById('jupymd');});
    await $('.vertical-tab-content').$('button=Select environment').click();
    await $('input[placeholder="Select a Python environment or type a custom path…"]').waitForDisplayed();
}
describe('Setup and kernel lifecycle',()=>{
    beforeEach(async()=>{await freshVault();});
    afterEach(async()=>{await browser.executeObsidian(async({plugins})=>{await plugins.jupymd?.executor.cleanup();});});
    it('rejects an invalid custom tooling interpreter and preserves settings',async()=>{
        await openToolingSelector();
        const input=await $('input[placeholder="Select a Python environment or type a custom path…"]');
        await input.setValue('/does-not-exist/jupymd-python');
        await $('.suggestion-item*=Use custom path').waitForDisplayed();
        await $('.suggestion-item*=Use custom path').click();
        await expect($('.notice-container')).toHaveText(expect.stringContaining('Invalid Python path'));
        assert.equal(await browser.executeObsidian(({plugins})=>plugins.jupymd.settings.toolingPython),testPython('tooling'));
    });
    it('cancels tooling installation without changing the selected interpreter',async()=>{
        await openToolingSelector();
        const input=await $('input[placeholder="Select a Python environment or type a custom path…"]');
        await input.setValue(testPython('kernel'));
        await $('.suggestion-item*=Use custom path').waitForDisplayed();
        await $('.suggestion-item*=Use custom path').click();
        await $('.modal-title=Install required Jupyter tooling').waitForDisplayed();
        await $('button=Cancel').click();
        assert.equal(await browser.executeObsidian(({plugins})=>plugins.jupymd.settings.toolingPython),testPython('tooling'));
    });
    it('recovers from an unavailable saved kernel by selecting an installed kernel',async()=>{
        await seedPair('missing.md',['print(42)']);
        const nb=await notebook('missing.md'); nb.metadata.kernelspec.name='missing-kernel';
        await obsidianPage.write('missing.ipynb',JSON.stringify(nb));
        await openNote('missing.md'); await runCell(0); await chooseKernel();
        await expectOutput(0,'42');
        assert.equal((await notebook('missing.md')).metadata.kernelspec.name,'jupymd-test-python');
    });
    it('restarts the selected notebook kernel through its command',async()=>{
        await seedPair('restart.md',['marker = 1',"print('marker' in globals())"]);
        await openNote('restart.md'); await runCell(0);
        await browser.waitUntil(async()=> (await notebook('restart.md')).cells[1].execution_count===1);
        await command('restart-notebook-kernel');
        await expect($('.notice-container')).toHaveText(expect.stringContaining('Notebook kernel restarted'));
        await runCell(1); await expectOutput(1,'False');
    });
    it('interrupts running code through its command and restores the Run control',async()=>{
        // Short sleeps allow Windows IPykernel to deliver its deferred interrupt.
        await seedPair('interrupt.md',["from pathlib import Path\nimport time\nPath('started.txt').touch()\nwhile True:\n    time.sleep(0.05)"]);
        await openNote('interrupt.md'); await runCell(0);
        await browser.waitUntil(()=>browser.executeObsidian(({app})=>app.vault.adapter.exists('started.txt')));
        await command('interrupt-notebook-kernel');
        await expectOutput(0,'KeyboardInterrupt');
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) [aria-label="Run cell"]')).toBeEnabled();
    });
});
