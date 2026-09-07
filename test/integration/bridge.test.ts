import {strict as assert} from 'node:assert';
import {beforeEach, afterEach, describe, it} from 'mocha';
import {JupyterBridgeClient} from '../../src/bridge/JupyterBridgeClient';
import {workspace, testPython, installKernel, join, readFile, rm, preserveFailure} from '../support/environment';
import type {KernelExecutionResult} from '../../src/kernels/types';

function text(result: KernelExecutionResult) {
    return result.outputs.filter(o => o.output_type === 'stream').map(o => 'text' in o ? o.text : '').join('');
}
async function waitForFile(path: string) {
    const deadline = Date.now()+15000;
    while (Date.now()<deadline) {
        try {await readFile(path); return;} catch {}
        await new Promise(resolve => setTimeout(resolve,50));
    }
    throw new Error(`Kernel did not signal readiness: ${path}`);
}
describe('Real Jupyter bridge', function () {
    let directory: string, bridge: JupyterBridgeClient, kernel: string;
    const execute = (code: string, session = 'notebook') => bridge.execute(session,kernel,directory,code,20);
    beforeEach(async () => {
        directory = await workspace();
        kernel = await installKernel(join(directory,'jupyter'));
        bridge = new JupyterBridgeClient(testPython('tooling'),join(directory,'jupyter'));
    });
    afterEach(async function () {
        try {
            if (this.currentTest?.state === 'failed') await preserveFailure(directory,this.currentTest.fullTitle());
        } finally {
            try {await bridge?.dispose();}
            finally {if(directory) await rm(directory,{recursive:true,force:true});}
        }
    });
    it('discovers an external kernelspec and uses its separate interpreter (#51)', async () => {
        const found = (await bridge.listKernels()).find(k => k.name===kernel);
        assert.ok(found); assert.equal(found.language,'python');
        assert.equal(text(await execute('import sys; print(sys.executable)')).trim(),testPython('kernel'));
    });
    it('retains variables and increments execution counts within a session', async () => {
        const first = await execute('value = 40');
        const second = await execute('print(value + 2)');
        assert.equal(text(second),'42\n');
        assert.equal(second.executionCount, first.executionCount!+1);
    });
    it('uses the note directory for relative file reads and writes (#27)', async () => {
        const result = await execute("from pathlib import Path\nPath('relative.csv').write_text('a,b\\n1,2\\n')\nprint(Path('relative.csv').read_text(), end='')");
        assert.equal(text(result),'a,b\n1,2\n');
        assert.equal(await readFile(join(directory,'relative.csv'),'utf8'),'a,b\n1,2\n');
    });
    it('preserves Unicode across stdout, stderr and execution results (#39, #50)', async () => {
        const expected = 'é 漢字 🧪 e\u0301';
        const result = await execute(`import sys\nprint(${JSON.stringify(expected)})\nprint(${JSON.stringify(expected)}, file=sys.stderr)\n${JSON.stringify(expected)}`);
        assert.ok(result.outputs.some(o => o.output_type==='stream' && o.name==='stdout' && o.text===expected+'\n'));
        assert.ok(result.outputs.some(o => o.output_type==='stream' && o.name==='stderr' && o.text===expected+'\n'));
        assert.ok(result.outputs.some(o => o.output_type==='execute_result' && String(o.data['text/plain']).includes(expected)));
    });
    it('captures rich MIME bundles without requiring plotting libraries', async () => {
        const result = await execute("from IPython.display import display, HTML, SVG\ndisplay(HTML('<table><tr><td>42</td></tr></table>'))\ndisplay(SVG('<svg xmlns=\"http://www.w3.org/2000/svg\"><circle r=\"5\"/></svg>'))");
        assert.ok(result.outputs.some(o => 'data' in o && 'text/html' in o.data));
        assert.ok(result.outputs.some(o => 'data' in o && 'image/svg+xml' in o.data));
    });
    it('honors immediate and deferred clear_output', async () => {
        for (const wait of ['False','True']) {
            const result = await execute(`from IPython.display import display, clear_output\ndisplay('old')\nclear_output(wait=${wait})\ndisplay('new')`);
            assert.equal(result.outputs.length,1);
            assert.ok('data' in result.outputs[0] && String(result.outputs[0].data['text/plain']).includes('new'));
        }
    });
    it('replaces a display_id output with its updated value', async () => {
        const result = await execute("from IPython.display import display\nh = display('old', display_id=True)\nh.update('new')");
        assert.equal(result.outputs.length,1);
        assert.ok('data' in result.outputs[0] && String(result.outputs[0].data['text/plain']).includes('new'));
    });
    for (const code of ["raise ValueError('expected failure')",'raise SystemExit(2)']) {
        it(`recovers after ${code.split('(')[0]} (#35)`,async () => {
            const result = await execute(code);
            assert.ok(result.outputs.some(o => o.output_type==='error'));
            assert.equal(text(await execute('print(42)')),'42\n');
        });
    }
    it('interrupts running work and accepts another execution', async () => {
        const pending = execute("from pathlib import Path\nimport time\nPath('started').touch()\ntime.sleep(60)");
        await waitForFile(join(directory,'started'));
        assert.equal(await bridge.interrupt('notebook'),true);
        assert.ok((await pending).outputs.some(o => o.output_type==='error' && o.ename==='KeyboardInterrupt'));
        assert.equal(text(await execute('print(42)')),'42\n');
    });
    it('restart clears live state; shutdown reports no remaining session', async () => {
        await execute('restart_marker = 1');
        assert.equal(await bridge.restart('notebook'),true);
        assert.equal(text(await execute("print('restart_marker' in globals())")),'False\n');
        await bridge.shutdown('notebook');
        assert.equal(await bridge.interrupt('notebook'),false);
    });
    it('isolates different notebook sessions at the bridge boundary', async () => {
        await execute('isolated = 1','one');
        assert.equal(text(await execute("print('isolated' in globals())",'two')),'False\n');
        await bridge.shutdown('one'); await bridge.shutdown('two');
    });
});
