import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import {freshVault,openNote,note,pair,seedPair,command,runCell,expectOutput,notebook,cells,waitForCounts,browser,$,$$,expect,obsidianPage} from '../support/obsidian';
import {openPluginSettings,returnToMainWindow} from '../support/obsidian';

describe('Vault lifecycle and settings',()=>{
    beforeEach(async()=>{await freshVault();});
    afterEach(async()=>{await returnToMainWindow();await browser.executeObsidian(async({plugins})=>{await plugins.jupymd?.executor.cleanup();});});
    it('moves the paired notebook and executes and clears using the new path (#41)',async()=>{
        await openNote('move.md',note(['print(42)'])); await pair('move.md');
        await obsidianPage.mkdir('folder');
        await browser.executeObsidian(async({app})=>{
            const file=app.vault.getFileByPath('move.md'); if(!file) throw new Error('Missing note');
            await app.fileManager.renameFile(file,'folder/moved.md');
        });
        await browser.waitUntil(async()=>{try{await notebook('folder/moved.md');return true;}catch{return false;}});
        await openNote('folder/moved.md'); await runCell(0); await expectOutput(0,'42');
        await (await cells())[0].$('[aria-label="Clear output"]').click();
        await waitForCounts('folder/moved.md',[null]);
        await assert.rejects(notebook('move.md'),/ENOENT/);
    });
    it('deletes the paired notebook when its Markdown note is deleted (#38)',async()=>{
        await seedPair('delete.md',['pass']);
        await openNote('delete.md');
        await obsidianPage.delete('delete.md');
        await browser.waitUntil(async()=>{try{await notebook('delete.md');return false;}catch{return true;}});
    });
    it('unlinks when pairing frontmatter is removed without recreating it (#38)',async()=>{
        await seedPair('unlink.md',['pass']); await openNote('unlink.md');
        await obsidianPage.write('unlink.md',note(['pass']));
        await browser.waitUntil(()=>browser.executeObsidian(({app})=>{
            const file=app.vault.getFileByPath('unlink.md');return !!file&&!app.metadataCache.getFileCache(file)?.frontmatter?.jupyter;
        }));
        await command('force-sync');
        await browser.waitUntil(()=>browser.executeObsidian(({plugins})=>!plugins.jupymd.fileSync.isSyncBlocked()));
        assert.equal(await obsidianPage.read('unlink.md'),note(['pass']));
    });
    it('ignores unrelated vault files during automatic sync (#21)',async()=>{
        await browser.executeObsidian(({plugins})=>{plugins.jupymd.settings.autoSync=true;});
        await obsidianPage.write('source.ts','const answer = 42;');
        await obsidianPage.write('script.sh','echo 42');
        await command('force-sync');
        await browser.waitUntil(()=>browser.executeObsidian(({plugins})=>!plugins.jupymd.fileSync.isSyncBlocked()));
        const files=await browser.executeObsidian(({app})=>app.vault.getFiles().map(f=>f.path));
        assert.ok(!files.some(f=>f.endsWith('.ipynb')));
        assert.equal(await obsidianPage.read('source.ts'),'const answer = 42;');
    });
    it('disabling auto-conversion leaves an unpaired note unpaired on Run',async()=>{
        await browser.executeObsidian(({plugins})=>{plugins.jupymd.settings.autoConvertToNotebookOnRun=false;});
        await openNote('ordinary.md',note(['print(42)'])); await runCell(0);
        await expect($('.notice-container')).toHaveText(expect.stringContaining('not paired'));
        await assert.rejects(notebook('ordinary.md'),/ENOENT/);
    });
    it('persists a settings toggle through reload',async()=>{
        await openPluginSettings();
        const setting=await $('.setting-item*=Automatic sync');
        await setting.waitForDisplayed(); await setting.$('.checkbox-container').click();
        await returnToMainWindow();
        await browser.waitUntil(()=>browser.executeObsidian(({plugins})=>plugins.jupymd.settings.autoSync===true));
        await browser.reloadObsidian({plugins:['jupymd']});
        assert.equal(await browser.executeObsidian(({plugins})=>plugins.jupymd.settings.autoSync),true);
    });
    it('keeps manual sync working with custom code rendering disabled (#36)',async()=>{
        await browser.executeObsidian(async({plugins})=>{plugins.jupymd.settings.enableCodeBlocks=false;await plugins.jupymd.saveSettings();});
        await browser.reloadObsidian({plugins:['jupymd']});
        await seedPair('plain.md',['print(1)']); await openNote('plain.md');
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) [aria-label="Run cell"]')).not.toExist();
        const content=await obsidianPage.read('plain.md');
        await obsidianPage.write('plain.md',content.replace('print(1)','print(2)'));
        await command('force-sync');
        await browser.waitUntil(async()=>JSON.stringify((await notebook('plain.md')).cells).includes('print(2)'));
    });
});
