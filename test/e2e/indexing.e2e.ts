import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import {freshVault,openNote,seedPair,cells,expectOutput,notebook,browser,$,expect} from '../support/obsidian';

describe('Editing notebook cells',()=>{
    beforeEach(async()=>{await freshVault();});
    afterEach(async()=>{await browser.executeObsidian(async({plugins})=>{await plugins.jupymd?.executor.cleanup();});});
    it('runs and clears the right mounted cell after insertion above it (#54)',async()=>{
        await seedPair('editing.md',['print(11)','print(22)']);
        await openNote('editing.md',undefined,'source');
        await browser.executeObsidian(({app})=>{app.workspace.activeEditor?.editor?.setCursor({line:0,ch:0});});
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) [aria-label="Run cell"]')).toExist();
        await browser.execute(()=>{
            const target=document.querySelectorAll('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) .code-container')[1];
            if(!target) throw new Error('Target cell missing');
            target.setAttribute('data-original-target','true');
        });
        await browser.executeObsidian(({app})=>{
            const editor=app.workspace.activeEditor?.editor;
            if(!editor) throw new Error('Missing editor');
            const line=editor.getValue().split('\n').findIndex(line=>line==='```python');
            editor.replaceRange('```python\nprint(0)\n```\n\n',{line,ch:0});
            editor.setCursor({line:0,ch:0});
        });
        await browser.waitUntil(async()=> (await cells()).length===3);
        await expect($('[data-original-target="true"]')).toExist();
        await $('[data-original-target="true"] [aria-label="Run cell"]').click();
        await expectOutput(2,'22');
        const code=(await notebook('editing.md')).cells.filter((c:any)=>c.cell_type==='code');
        assert.equal(code[2].outputs[0].text.join(''),'22\n');
        assert.ok(code.slice(0,2).every((c:any)=>c.outputs.length===0));
        await $('[data-original-target="true"] [aria-label="Clear output"]').click();
        await browser.waitUntil(async()=> (await notebook('editing.md')).cells.filter((c:any)=>c.cell_type==='code')[2].outputs.length===0);
    });
});
