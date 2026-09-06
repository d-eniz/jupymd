import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
import {beforeEach,afterEach,describe,it} from 'mocha';
import {runQuickSetup} from '../../src/utils/quickSetup';
import {validatePythonPath} from '../../src/utils/pythonPathUtils';
import {FileSystemAdapter} from '../support/obsidian-stub';
import {workspace,testPython,join,readFile,rm,preserveFailure} from '../support/environment';

describe('Python environment setup',()=>{
    let directory:string;
    beforeEach(async()=>{directory=await workspace();});
    afterEach(async function(){
        if(this.currentTest?.state==='failed') await preserveFailure(directory,this.currentTest.fullTitle());
        await rm(directory,{recursive:true,force:true});
    });
    it('validates a configured interpreter and rejects absent executables',async()=>{
        assert.equal(await validatePythonPath(testPython('tooling')),true);
        assert.equal(await validatePythonPath(join(directory,'missing-python')),false);
        assert.equal(await validatePythonPath('  '),false);
    });
    it('creates a usable vault-local virtual environment without installing packages',async()=>{
        const app:any={vault:{adapter:new FileSystemAdapter(directory)}};
        const python=await runQuickSetup(app,testPython('tooling'),'test environment','');
        const expected=join(directory,'.test environment',process.platform==='win32'?'Scripts/python.exe':'bin/python');
        assert.equal(python,expected);
        assert.ok((await readFile(join(directory,'.test environment','pyvenv.cfg'),'utf8')).includes('include-system-site-packages = false'));
        const prefix=execFileSync(python!,['-c','import sys; print(sys.prefix)'],{encoding:'utf8'}).trim();
        assert.equal(prefix,join(directory,'.test environment'));
    });
});
