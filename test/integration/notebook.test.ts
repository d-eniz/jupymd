import {strict as assert} from 'node:assert';
import {beforeEach, afterEach, describe, it} from 'mocha';
import {execFileSync} from 'node:child_process';
import {runJupytext, upgradeLegacyNotebook} from '../../src/utils/helpers';
import {getExecutableCellIndex, parseMarkdownCodeFences} from '../../src/notebook/NotebookCellIndex';
import {parseNotebook} from '../../src/components/types';
import {workspace, testPython, join, writeFile, readFile, rm, preserveFailure} from '../support/environment';

describe('Real notebook conversion and synchronization', () => {
    let directory: string;
    beforeEach(async () => {directory=await workspace();});
    afterEach(async function () {
        if(this.currentTest?.state==='failed') await preserveFailure(directory,this.currentTest.fullTitle());
        await rm(directory,{recursive:true,force:true});
    });
    const convert = (args: string[]) => runJupytext(testPython('tooling'),args);
    it('creates valid notebooks with kernel metadata and Unicode/spaced paths (#24, #34, #40)', async () => {
        const md=join(directory,'Notebook é 漢字 🧪.md');
        await writeFile(md,'# Analysis\n\n```python\nprint("é 漢字 🧪")\n```\n');
        await convert(['--to','ipynb',md]);
        const ipynb=md.replace(/\.md$/,'.ipynb');
        const kernelspec={name:'test-python',display_name:'Python "Test"',language:'python'};
        await convert([ipynb,'--set-formats','ipynb,md','--update-metadata',JSON.stringify({kernelspec})]);
        const nb=parseNotebook(await readFile(ipynb,'utf8'));
        assert.deepEqual(nb.metadata?.kernelspec,kernelspec);
        assert.ok(JSON.stringify(nb.cells).includes('é 漢字 🧪'));
        execFileSync(testPython('tooling'),['-c','import nbformat,sys; nbformat.validate(nbformat.read(sys.argv[1],as_version=4))',ipynb]);
    });
    it('agrees with Jupytext about executable indices in mixed-language notes', async () => {
        const md=['# Mixed', '```python','print("first")','```', '```javascript','console.log(1)','```',
            '```python .noeval','example only','```','```python','print("last")','```'].join('\n');
        const path=join(directory,'mixed.md'); await writeFile(path,md);
        await convert(['--to','ipynb',path]);
        const cells=parseNotebook(await readFile(join(directory,'mixed.ipynb'),'utf8')).cells.filter(c=>c.cell_type==='code');
        for(const fence of parseMarkdownCodeFences(md)) {
            const index=getExecutableCellIndex(md,fence.lineStart,'python');
            if(index===null) continue;
            const source=md.split('\n').slice(fence.lineStart+1,fence.lineEnd).join('\n');
            assert.equal([cells[index].source].flat().join('').trim(),source);
        }
    });
    it('updates Markdown source while preserving outputs of unchanged cells', async () => {
        const path=join(directory,'note.md');
        await writeFile(path,'# Original\n\n```python\nprint(42)\n```\n');
        await convert(['--to','ipynb',path]);
        const ipynb=join(directory,'note.ipynb');
        const nb=JSON.parse(await readFile(ipynb,'utf8'));
        const cell=nb.cells.find((c:any)=>c.cell_type==='code');
        cell.outputs=[{output_type:'stream',name:'stdout',text:['42\n']}]; cell.execution_count=7;
        await writeFile(ipynb,JSON.stringify(nb));
        await writeFile(path,'# Updated prose\n\n```python\nprint(42)\n```\n');
        await convert(['--update','--to','ipynb',path]);
        const updated=JSON.parse(await readFile(ipynb,'utf8'));
        assert.ok(JSON.stringify(updated.cells).includes('Updated prose'));
        assert.deepEqual(updated.cells.find((c:any)=>c.cell_type==='code').outputs,cell.outputs);
    });
    it('upgrades a legacy notebook in place and imports its source and output', async () => {
        const ipynb=join(directory,'legacy.ipynb');
        await writeFile(ipynb,JSON.stringify({nbformat:3,nbformat_minor:0,metadata:{},worksheets:[{cells:[
            {cell_type:'code',language:'python',input:['print(42)'],outputs:[{output_type:'stream',stream:'stdout',text:['42\n']}],prompt_number:1,metadata:{}},
        ]}]}));
        assert.equal(await upgradeLegacyNotebook(testPython('tooling'),ipynb),true);
        const notebook=JSON.parse(await readFile(ipynb,'utf8'));
        assert.equal(notebook.nbformat,4);
        assert.equal(notebook.cells[0].outputs[0].text.join(''),'42\n');
        await convert(['--to','markdown',ipynb]);
        assert.ok((await readFile(join(directory,'legacy.md'),'utf8')).includes('print(42)'));
        assert.equal(await upgradeLegacyNotebook(testPython('tooling'),ipynb),false);
    });
    it('leaves malformed notebook bytes intact when conversion fails', async () => {
        const ipynb=join(directory,'broken.ipynb'); const original='{broken';
        await writeFile(ipynb,original);
        await assert.rejects(upgradeLegacyNotebook(testPython('tooling'),ipynb));
        assert.equal(await readFile(ipynb,'utf8'),original);
    });
});
