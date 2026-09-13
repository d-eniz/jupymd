import {browser, $,$$,expect} from '@wdio/globals';
import {obsidianPage} from 'wdio-obsidian-service';
import {join} from 'node:path';
import {writeFile, mkdir, readFile} from 'node:fs/promises';
import {testPython,installKernel} from './environment';

let mainWindow: string;

export async function freshVault(settings: Record<string,unknown>={}) {
    await browser.reloadObsidian({vault:'test/fixtures/vault',plugins:[]});
    mainWindow = await browser.getWindowHandle();
    const vault=obsidianPage.getVaultPath();
    const configDir=await obsidianPage.getConfigDir();
    const dataDir=join(vault,configDir,'jupymd','jupyter');
    await installKernel(dataDir);
    await mkdir(join(vault,configDir,'plugins','jupymd'),{recursive:true});
    await writeFile(join(vault,configDir,'plugins','jupymd','data.json'),JSON.stringify({
        toolingPython:testPython('tooling'), autoSync:false, ...settings,
    }));
    await browser.executeObsidian(()=>{
        const g=globalThis as any;
        if(!g.__jupymdOriginalError) {
            g.__jupymdOriginalError=console.error;
            console.error=(...args: unknown[])=>{
                g.__jupymdTestErrors.push(args.map(String));
                g.__jupymdOriginalError(...args);
            };
        }
        g.__jupymdTestErrors=[];
    });
    await obsidianPage.enablePlugin('jupymd');
    await browser.waitUntil(()=>browser.executeObsidian(({plugins})=>!!plugins.jupymd?.executor),{timeoutMsg:'JupyMD did not load'});
}
export function note(codes: string[]) {
    return '# Test notebook\n\n'+codes.map(code=>'```python\n'+code+'\n```').join('\n\n')+'\n';
}
export async function openNote(path: string,content?: string, mode:'preview'|'source'='preview') {
    if(content!==undefined) await obsidianPage.write(path,content);
    await obsidianPage.openFile(path);
    await browser.executeObsidian(async ({app},mode)=>{
        const leaf=app.workspace.getMostRecentLeaf();
        if(!leaf) throw new Error('No Markdown leaf');
        const state=leaf.getViewState();
        await leaf.setViewState({...state,state:{...state.state,mode,source:false}});
    },mode);
    await browser.waitUntil(()=>browser.executeObsidian(({app},path)=>{
        const file=app.vault.getFileByPath(path);
        return !!file && !!app.metadataCache.getFileCache(file);
    },path),{timeoutMsg:`Metadata cache not ready: ${path}`});
}
export async function command(id:string) {
    await browser.executeObsidianCommand(`jupymd:${id}`);
}
export async function returnToMainWindow() {
    // Reloading Obsidian can replace its window handle.
    const handles = await browser.getWindowHandles();
    if (handles.includes(mainWindow)) await browser.switchToWindow(mainWindow);
}
export async function switchToWindowWith(selector: string) {
    await browser.waitUntil(async () => {
        for (const handle of await browser.getWindowHandles()) {
            await browser.switchToWindow(handle);
            if (await $(selector).isDisplayed()) return true;
        }
        return false;
    }, {timeoutMsg: `No Obsidian window displays ${selector}`});
}
export async function openPluginSettings() {
    await returnToMainWindow();
    await browser.executeObsidian(async ({app}) => {
        await (app as any).setting.open();
        await (app as any).setting.openTabById('jupymd');
    });
    // Obsidian 1.13+ opens settings in a separate window by default.
    await switchToWindowWith('button=Select environment');
}
export async function chooseKernel() {
    await $('input[placeholder="Select a kernel source…"]').waitForDisplayed();
    await $('.suggestion-item*=Jupyter kernels').click();
    const input=await $('input[placeholder="Select an installed Jupyter kernel…"]');
    await input.waitForDisplayed();
    await input.setValue('JupyMD Test Python');
    await $('.suggestion-item*=JupyMD Test Python').waitForDisplayed();
    await $('.suggestion-item*=JupyMD Test Python').click();
    await input.waitForExist({reverse:true});
}
export async function pair(path:string) {
    await command('create-jupyter-notebook');
    await chooseKernel();
    await browser.waitUntil(async()=>{
        try{return !!(await notebook(path)).metadata?.kernelspec;}catch{return false;}
    },{timeoutMsg:'Notebook pairing did not finish'});
    await browser.waitUntil(()=>browser.executeObsidian(({app},path)=>{
        const file=app.vault.getFileByPath(path);
        return !!file && !!app.metadataCache.getFileCache(file)?.frontmatter?.jupyter;
    },path));
    await browser.waitUntil(()=>browser.executeObsidian(({plugins})=>!plugins.jupymd.fileSync.isSyncBlocked()));
}
export async function notebook(path:string) {
    return JSON.parse(await readFile(join(obsidianPage.getVaultPath(),path.replace(/\.md$/,'.ipynb')),'utf8'));
}
async function renderedCells() {
    const elements=await browser.execute(()=>{
        const view='.workspace-leaf.mod-active .view-content > :not([style*="display: none"])';
        // Processors mount asynchronously: a later cell can appear before an earlier one.
        const blocks=Array.from(document.querySelectorAll(`${view} [class*="block-language-"]`));
        if(blocks.some(block=>!block.querySelector('code'))) return [];
        return Array.from(document.querySelectorAll<HTMLElement>(`${view} .code-container`));
    });
    return $$(elements).getElements();
}
export async function cells(minimum=1) {
    let current=await renderedCells();
    await browser.waitUntil(async()=>{
        current=await renderedCells();
        return current.length>=minimum;
    },{timeoutMsg:`Expected at least ${minimum} rendered cells`});
    return current;
}
export async function runCell(index:number) {
    const cell=(await cells(index+1))[index];
    const button=await cell.$('[aria-label="Run cell"]');
    await button.waitForEnabled(); await button.click();
}
export async function expectOutput(index:number,text:string) {
    // Resolve the cell again while waiting: Obsidian can replace widgets after metadata updates.
    await browser.waitUntil(async()=>{
        const current=await renderedCells();
        if(!current[index]) return false;
        const output=await current[index].$('.code-output');
        return await output.isExisting() && (await output.getText()).includes(text);
    },{timeout:15000,timeoutMsg:`Cell ${index} did not display ${JSON.stringify(text)}`});
}
export async function waitForCounts(path:string,counts:(number|null)[]) {
    await browser.waitUntil(async()=>{
        const code=(await notebook(path)).cells.filter((c:any)=>c.cell_type==='code');
        return JSON.stringify(code.map((c:any)=>c.execution_count))===JSON.stringify(counts);
    },{timeout:30000,timeoutMsg:`Expected execution counts ${JSON.stringify(counts)} in ${path}`});
}
export {browser,$,$$,expect,obsidianPage};

export async function seedPair(path:string,codes:string[],outputs:any[][]=codes.map(()=>[])) {
    const metadata={kernelspec:{name:'jupymd-test-python',display_name:'JupyMD Test Python',language:'python'},jupytext:{formats:'ipynb,md'}};
    const frontmatter='---\njupyter:\n  kernelspec:\n    name: jupymd-test-python\n    display_name: JupyMD Test Python\n    language: python\n  jupytext:\n    formats: ipynb,md\n---\n\n';
    await obsidianPage.write(path.replace(/\.md$/,'.ipynb'),JSON.stringify({nbformat:4,nbformat_minor:5,metadata,
        cells:[{id:'heading',cell_type:'markdown',metadata:{},source:['# Test notebook']},...codes.map((source,i)=>({id:`cell-${i}`,cell_type:'code',metadata:{},source:[source],execution_count:outputs[i].length?i+1:null,outputs:outputs[i]}))],
    }));
    await obsidianPage.write(path,frontmatter+note(codes));
}
