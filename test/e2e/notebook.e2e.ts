import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import {freshVault,openNote,note,pair,command,chooseKernel,runCell,expectOutput,notebook,cells,waitForCounts,browser,$,$$,expect,obsidianPage} from '../support/obsidian';

describe('Notebook user journeys',()=>{
    beforeEach(async()=>{await freshVault();});
    afterEach(async()=>{
        await browser.executeObsidian(async({plugins})=>{await plugins.jupymd?.executor.cleanup();});
    });
    it('creates a notebook, executes dependent cells, and restores saved output after restart',async()=>{
        await openNote('analysis.md',note(['answer = 40','print(answer + 2)']));
        await pair('analysis.md');
        await runCell(0); await waitForCounts('analysis.md',[1,null]);
        await runCell(1); await expectOutput(1,'42');
        await waitForCounts('analysis.md',[1,2]);
        await browser.reloadObsidian({plugins:['jupymd']});
        await openNote('analysis.md');
        await expectOutput(1,'42');
        assert.deepEqual((await notebook('analysis.md')).cells.filter((c:any)=>c.cell_type==='code').map((c:any)=>c.execution_count),[1,2]);
    });
    it('pairs an ordinary note on its first Run click',async()=>{
        await openNote('first-run.md',note(['print(42)']));
        await runCell(0); await chooseKernel();
        await expectOutput(0,'42');
        await waitForCounts('first-run.md',[1]);
    });
    it('cancels notebook creation without creating a paired file',async()=>{
        await openNote('cancel.md',note(['print(42)']));
        await command('create-jupyter-notebook');
        await $('input[placeholder="Select a kernel source…"]').waitForDisplayed();
        await browser.keys('Escape');
        await $('input[placeholder="Select a kernel source…"]').waitForExist({reverse:true});
        await assert.rejects(notebook('cancel.md'),/ENOENT/);
    });
    it('runs all cells in order and clears all saved and visible outputs (#43)',async()=>{
        await openNote('all.md',note(['value = 10','print(value + 1)','print(value + 2)']));
        await pair('all.md'); await command('run-all-code-blocks');
        await waitForCounts('all.md',[1,2,3]);
        await expectOutput(1,'11'); await expectOutput(2,'12');
        await command('clear-all-code-block-outputs');
        await waitForCounts('all.md',[null,null,null]);
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) .code-output')).not.toExist();
        assert.ok((await notebook('all.md')).cells.filter((c:any)=>c.cell_type==='code').every((c:any)=>c.outputs.length===0));
    });
    it('runs above and cell-and-below using the cell menu',async()=>{
        await openNote('ranges.md',note(['value = 10','print(value + 1)','print(value + 2)']));
        await pair('ranges.md');
        await (await cells())[1].$('[aria-label="More run actions"]').waitForEnabled();
        await (await cells())[1].$('[aria-label="More run actions"]').click();
        await $('[role="menuitem"][aria-label="Run above"]').click();
        await waitForCounts('ranges.md',[1,null,null]);
        await (await cells())[1].$('[aria-label="More run actions"]').waitForEnabled();
        await (await cells())[1].$('[aria-label="More run actions"]').click();
        await $('[role="menuitem"][aria-label="Run below"]').waitForDisplayed();
        await $('[role="menuitem"][aria-label="Run below"]').click();
        await waitForCounts('ranges.md',[1,2,3]); await expectOutput(2,'12');
    });
    it('clears only the selected cell and retains its neighbours',async()=>{
        await openNote('clear.md',note(['print(11)','print(22)']));
        await pair('clear.md'); await command('run-all-code-blocks');
        await waitForCounts('clear.md',[1,2]); await expectOutput(0,'11');
        await (await cells())[0].$('[aria-label="Clear output"]').click();
        await waitForCounts('clear.md',[null,2]); await expectOutput(1,'22');
        assert.equal((await notebook('clear.md')).cells.filter((c:any)=>c.cell_type==='code')[0].outputs.length,0);
    });
    it('imports a notebook through the selector with persisted outputs',async()=>{
        await obsidianPage.write('import.ipynb',JSON.stringify({
            nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'jupymd-test-python',display_name:'JupyMD Test Python',language:'python'}},
            cells:[{id:'import-cell',cell_type:'code',metadata:{},source:['print(42)'],execution_count:1,outputs:[{output_type:'stream',name:'stdout',text:['42\n']}]}],
        }));
        await command('create-note-from-jupyter-notebook');
        await $('input[placeholder="Select a Jupyter notebook to convert…"]').waitForDisplayed();
        await $('.suggestion-item*=import.ipynb').click();
        await expect($('.notice-container')).toHaveText(expect.stringContaining('Note created and paired:'));
        await browser.waitUntil(()=>browser.executeObsidian(({app})=>app.workspace.getActiveFile()?.path==='import.md'));
        await openNote('import.md'); await expectOutput(0,'42');
    });
    it('displays execution errors and remains usable for another run',async()=>{
        await openNote('errors.md',note(["raise ValueError('expected failure')",'print(42)']));
        await pair('errors.md'); await runCell(0); await expectOutput(0,'ValueError: expected failure');
        await runCell(1); await expectOutput(1,'42');
        await expect((await cells())[0].$('[aria-label="Run cell"]')).toBeEnabled();
    });
});
