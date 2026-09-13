import {strict as assert} from 'node:assert';
import {beforeEach, afterEach, describe, it} from 'mocha';
import {readFileSync} from 'node:fs';
import {FileSystemAdapter,TFile} from '../support/obsidian-stub';
import {CodeExecutor} from '../../src/components/CodeExecutor';
import {NotebookKernelService} from '../../src/kernels/NotebookKernelService';
import {ManagedKernelSpecStore} from '../../src/kernels/ManagedKernelSpecStore';
import {JupyterBridgeClient} from '../../src/bridge/JupyterBridgeClient';
import {runJupytext} from '../../src/utils/helpers';
import {DEFAULT_SETTINGS} from '../../src/components/types';
import {workspace,testPython,installKernel,join,readFile,writeFile,rm,preserveFailure} from '../support/environment';

describe('Executor with real notebooks and kernels',()=>{
    let directory:string, path:string, ipynb:string, executor:CodeExecutor, service:NotebookKernelService;
    let plugin:any, app:any;
    const markdown=(codes:string[])=>'# Notes\n\n'+codes.map(c=>'```python\n'+c+'\n```').join('\n\n')+'\n';
    const notebook=async()=>JSON.parse(await readFile(ipynb,'utf8'));
    beforeEach(async()=>{
        directory=await workspace(); path=join(directory,'note.md'); ipynb=join(directory,'note.ipynb');
        const vault={adapter:new FileSystemAdapter(directory), configDir:'.obsidian'};
        const file=new TFile('note.md',vault);
        app={vault,workspace:{getActiveFile:()=>file},metadataCache:{getFileCache:()=>({frontmatter:{jupyter:{}}})}};
        const store=new ManagedKernelSpecStore(app,'jupymd');
        const kernel=await installKernel(store.jupyterDataDir);
        service=new NotebookKernelService(new JupyterBridgeClient(testPython('tooling'),store.jupyterDataDir),store);
        plugin={settings:{...DEFAULT_SETTINGS,toolingPython:testPython('tooling')},ensureKernelForNote:(path:string)=>service.resolveKernelForNote(path)};
        executor=new CodeExecutor(plugin,service,app);
        await writeFile(path,markdown(['value = 10','print(value + 1)','print(value + 2)']));
        await runJupytext(testPython('tooling'),['--to','ipynb',path]);
        await runJupytext(testPython('tooling'),[ipynb,'--set-formats','ipynb,md','--update-metadata',JSON.stringify({kernelspec:{name:kernel,display_name:'Test',language:'python'}})]);
    });
    afterEach(async function(){
        await executor?.cleanup();
        if(this.currentTest?.state==='failed') await preserveFailure(directory,this.currentTest.fullTitle());
        if(directory) await rm(directory,{recursive:true,force:true});
    });
    it('runs all in order, persists counts and outputs, then clears them',async()=>{
        await executor.executeAllCodeBlocksInCurrentFile();
        const code=(await notebook()).cells.filter((c:any)=>c.cell_type==='code');
        assert.deepEqual(code.map((c:any)=>c.execution_count),[1,2,3]);
        assert.equal(code[1].outputs[0].text.join(''),'11\n');
        await executor.clearAllOutputsInCurrentFile();
        assert.ok((await notebook()).cells.filter((c:any)=>c.cell_type==='code').every((c:any)=>c.execution_count===null&&c.outputs.length===0));
    });
    it('executes current Markdown when the notebook source is stale',async()=>{
        const original=await readFile(path,'utf8');
        await writeFile(path,original.replace('print(value + 1)','print(99)'));
        await executor.executeCodeBlock({code:'print(99)',cellIndex:1,language:'python'});
        const code=(await notebook()).cells.filter((c:any)=>c.cell_type==='code');
        assert.equal(code[1].outputs[0].text.join(''),'99\n');
        assert.ok((await readFile(path,'utf8')).includes('print(99)'));
        assert.equal(code[0].execution_count,null);
    });
    it('executes after successful pairing while the metadata cache is still stale',async()=>{
        app.metadataCache.getFileCache=()=>({});
        let creations=0;
        // The paired files exist, but Obsidian has not indexed Jupytext's frontmatter yet.
        plugin.createNotebookWithKernel=async()=>{creations++;return true;};
        await executor.executeCodeBlock({code:'value = 10',cellIndex:0,language:'python'});
        assert.equal(creations,1);
        assert.equal((await notebook()).cells.filter((c:any)=>c.cell_type==='code')[0].execution_count,1);
    });
    it('rejects a stale index instead of attaching output to a different source',async()=>{
        await assert.rejects(executor.executeCodeBlock({code:'print(999)',cellIndex:1,language:'python'}),/does not match/);
        assert.ok((await notebook()).cells.filter((c:any)=>c.cell_type==='code').every((c:any)=>c.outputs.length===0));
    });
    it('does not execute a code fence with the wrong kernel language',async()=>{
        const original=await readFile(ipynb,'utf8');
        await executor.executeCodeBlock({code:'console.log(1)',cellIndex:1,language:'javascript'});
        assert.equal(await readFile(ipynb,'utf8'),original);
    });
    it('creates and rediscovers a managed Python kernel without global installation',async()=>{
        const kernel=await service.preparePythonEnvironment(testPython('kernel'),'test environment');
        assert.equal(kernel.interpreterPath,testPython('kernel'));
        const store=new ManagedKernelSpecStore({vault:{adapter:new FileSystemAdapter(directory),configDir:'.custom-config'}} as any,'jupymd');
        const created=await store.ensurePythonKernel(testPython('kernel'),'test environment');
        assert.ok(created.resourceDir.startsWith(join(directory,'.custom-config')));
        assert.deepEqual(JSON.parse(readFileSync(join(created.resourceDir,'kernel.json'),'utf8')).argv,[testPython('kernel'),'-m','ipykernel_launcher','-f','{connection_file}']);
        assert.equal((await store.ensurePythonKernel(testPython('kernel'),'test environment')).name,created.name);
    });
});
