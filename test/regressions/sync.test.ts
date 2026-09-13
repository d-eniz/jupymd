import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import FakeTimers from '@sinonjs/fake-timers';
import {utimes} from 'node:fs/promises';
import {FileSync} from '../../src/components/FileSync';
import {FileSystemAdapter,TFile} from '../support/obsidian-stub';
import {runJupytext} from '../../src/utils/helpers';
import {workspace,testPython,join,readFile,writeFile,rm,preserveFailure} from '../support/environment';

describe('Sync acceptance regressions',()=>{
    it('does not drop a second note modified during the debounce window',async()=>{
        const clock=FakeTimers.install({now:10000,toFake:['setTimeout','clearTimeout','Date']});
        try {
            const sync=new FileSync({} as any,'unused'); const synced:string[]=[];
            sync.syncFiles=async(file)=>{synced.push(file.path);};
            await sync.handleSync({path:'first.md'} as any);
            await clock.tickAsync(100);
            await sync.handleSync({path:'second.md'} as any);
            await clock.tickAsync(5000);
            assert.deepEqual([...new Set(synced)].sort(),['first.md','second.md']);
        }finally{clock.uninstall();}
    });
    it('retains an edit arriving after a sync snapshot but during deadtime (#17)',async()=>{
        const clock=FakeTimers.install({now:10000,toFake:['setTimeout','clearTimeout','Date']});
        try {
            const sync=new FileSync({} as any,'unused'); let source='first'; let persisted='';
            sync.syncFiles=async()=>{persisted=source;};
            await sync.handleSync({path:'note.md'} as any); await clock.tickAsync(500);
            source='latest'; await sync.handleSync({path:'note.md'} as any);
            await clock.tickAsync(5000);
            assert.equal(persisted,'latest');
        }finally{clock.uninstall();}
    });
    it('preserves Markdown authority and existing output when bidirectional sync is disabled (#17)',async function(){
        const directory=await workspace(); const md=join(directory,'note.md'); const ipynb=join(directory,'note.ipynb');
        try {
            await writeFile(md,'# Old prose\n\n```python\nprint(42)\n```\n');
            await runJupytext(testPython('tooling'),['--to','ipynb',md]);
            await runJupytext(testPython('tooling'),[ipynb,'--set-formats','ipynb,md']);
            const nb=JSON.parse(await readFile(ipynb,'utf8'));
            nb.cells.find((c:any)=>c.cell_type==='code').outputs=[{output_type:'stream',name:'stdout',text:['42\n']}];
            await writeFile(ipynb,JSON.stringify(nb));
            const intended=(await readFile(md,'utf8')).replace('Old prose','New prose must survive');
            await writeFile(md,intended);
            // A saved output makes the notebook newer even though its source is stale.
            await utimes(md,new Date('2025-01-01'),new Date('2025-01-01'));
            await utimes(ipynb,new Date('2025-01-02'),new Date('2025-01-02'));
            const vault={adapter:new FileSystemAdapter(directory)};
            const app:any={vault,metadataCache:{getFileCache:()=>({frontmatter:{jupyter:{}}})}};
            // FileSync currently has no settings input; the product's default is unidirectional.
            await new FileSync(app,testPython('tooling')).syncFiles(new TFile('note.md',vault) as any);
            assert.equal(await readFile(md,'utf8'),intended);
            const synced=JSON.parse(await readFile(ipynb,'utf8'));
            assert.ok(JSON.stringify(synced.cells).includes('New prose must survive'));
            assert.equal(synced.cells.find((c:any)=>c.cell_type==='code').outputs[0].text.join(''),'42\n');
        }catch(error){await preserveFailure(directory,this.test!.fullTitle());throw error;}
        finally{await rm(directory,{recursive:true,force:true});}
    });
});
