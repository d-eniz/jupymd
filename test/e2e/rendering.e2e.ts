import {beforeEach,afterEach,describe,it} from 'mocha';
import {freshVault,openNote,note,seedPair,cells,expectOutput,browser,$,$$,expect,obsidianPage} from '../support/obsidian';

const stream=(text:string)=>[{output_type:'stream',name:'stdout',text:[text]}];
describe('Rendering and Obsidian contexts',()=>{
    beforeEach(async()=>{await freshVault();});
    afterEach(async()=>{await browser.executeObsidian(async({plugins})=>{await plugins.jupymd?.executor.cleanup();});});
    it('renders persisted Unicode and strips ANSI codes in reading view and Live Preview (#39, #50)',async()=>{
        await seedPair('outputs.md',['pass'],[stream('\u001b[31mé 漢字 🧪 e\u0301\u001b[0m')]);
        for(const mode of ['preview','source'] as const) {
            await openNote('outputs.md',undefined,mode);
            if(mode==='source') await browser.executeObsidian(({app})=>{app.workspace.activeEditor?.editor?.setCursor({line:0,ch:0});});
            await expectOutput(0,'é 漢字 🧪 e\u0301');
            await expect((await cells())[0].$('.code-output')).not.toHaveText(expect.stringContaining('\u001b'));
        }
    });
    it('renders HTML tables, SVG, PNG and text/JSON fallbacks from MIME bundles',async()=>{
        const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
        const bundles=[
            {'text/html':'<table><tr><td>table value</td></tr></table>','text/plain':'fallback hidden'},
            {'image/svg+xml':'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'},
            {'image/png':png}, {'application/json':{answer:42}}, {'text/plain':['plain',' text']},
        ];
        await seedPair('rich.md',bundles.map((_,i)=>`# output ${i}\npass`),bundles.map(data=>[{output_type:'display_data',data,metadata:{}}]));
        await openNote('rich.md');
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) .code-output table')).toHaveText('table value');
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) .code-output svg circle')).toExist();
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) .code-output img')).toHaveAttribute('src',expect.stringContaining('data:image/png;base64,'));
        await expectOutput(3,'"answer": 42'); await expectOutput(4,'plain text');
        await expect((await cells())[0].$('.code-output')).not.toHaveText(expect.stringContaining('fallback hidden'));
    });
    it('sanitizes active HTML while retaining supported output content',async()=>{
        await seedPair('html.md',['pass'],[[{output_type:'display_data',metadata:{},data:{'text/html':'<b>safe text</b><script>window.__unsafeOutput=true</script><img src="invalid:" onerror="window.__unsafeOutput=true">'}}]]);
        await openNote('html.md'); await expectOutput(0,'safe text');
        await expect($('.code-output script')).not.toExist();
        await expect($('.code-output [onerror]')).not.toExist();
        await expect(browser.execute(()=> (window as any).__unsafeOutput === true)).resolves.toBe(false);
    });
    it('keeps capitalized fences as ordinary highlighted examples (#52)',async()=>{
        await openNote('examples.md',note(['print(1)'])+'\n```PYTHON\nprint(2)\n```\n');
        await expect($('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) [aria-label="Run cell"]')).toExist();
        await expect($$('.workspace-leaf.mod-active .view-content > :not([style*="display: none"]) [aria-label="Run cell"]')).toBeElementsArrayOfSize(1);
        await expect($('.workspace-leaf.mod-active')).toHaveText(expect.stringContaining('print(2)'));
    });

});
