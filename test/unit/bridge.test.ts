import {strict as assert} from 'node:assert';
import {EventEmitter} from 'node:events';
import * as childProcess from 'child_process';
import {beforeEach, afterEach, describe, it} from 'mocha';
// Bundled as CJS: stubbing this Node module affects the client without a production test hook.
import FakeTimers from '@sinonjs/fake-timers';
import {JupyterBridgeClient} from '../../src/bridge/JupyterBridgeClient';

describe('Bridge transport failures and framing', () => {
    let originalSpawn: typeof childProcess.spawn;
    let processDouble: any;
    let client: JupyterBridgeClient;
    let clock: any;
    let requests: any[];
    let errors: unknown[][];
    let originalError: typeof console.error;
    beforeEach(() => {
        clock = FakeTimers.install({toFake: ['setTimeout', 'clearTimeout', 'Date']});
        requests = []; errors = [];
        originalError = console.error;
        console.error = (...args) => errors.push(args);
        processDouble = new EventEmitter();
        processDouble.stdout = Object.assign(new EventEmitter(), {setEncoding() {}});
        processDouble.stderr = Object.assign(new EventEmitter(), {setEncoding() {}});
        processDouble.stdin = {write(line: string) {
            const request = JSON.parse(line); requests.push(request);
            if (request.operation === 'shutdown_all') queueMicrotask(() => reply(request.id, {shutdown:true}));
            return true;
        }};
        processDouble.kill = () => true;
        const module = require('child_process');
        originalSpawn = module.spawn;
        module.spawn = () => {queueMicrotask(() => processDouble.stdout.emit('data', '{"event":"ready"}\n')); return processDouble;};
        client = new JupyterBridgeClient('test-python', '/test/kernels');
    });
    afterEach(async () => {
        await client.dispose();
        require('child_process').spawn = originalSpawn;
        console.error = originalError;
        clock.uninstall();
    });
    function reply(id: number, result: unknown) {
        processDouble.stdout.emit('data', JSON.stringify({id,ok:true,result})+'\n');
    }
    it('rejects a failed process launch without leaving requests pending', async () => {
        require('child_process').spawn = () => {
            queueMicrotask(() => processDouble.emit('error', new Error('ENOENT: test interpreter')));
            return processDouble;
        };
        await assert.rejects(client.listKernels(), /ENOENT: test interpreter/);
    });
    it('bounds startup when the process never announces readiness', async () => {
        require('child_process').spawn = () => processDouble;
        const pending = assert.rejects(client.listKernels(), /initialization timed out/);
        await clock.tickAsync(15001);
        await pending;
    });
    it('buffers fragmented messages and correlates out-of-order responses', async () => {
        const first = client.listKernels(); const second = client.listKernels();
        await clock.tickAsync(0);
        processDouble.stdout.emit('data', '{"id":'+requests[1].id+',"ok":true,"result":');
        processDouble.stdout.emit('data', '[] }\n');
        reply(requests[0].id, [{name:'first'}]);
        assert.deepEqual(await first, [{name:'first'}]);
        assert.deepEqual(await second, []);
    });
    it('logs malformed messages without preventing a later valid response', async () => {
        const pending = client.listKernels(); await clock.tickAsync(0);
        processDouble.stdout.emit('data', 'not json\nnull\n');
        reply(requests[0].id, []);
        assert.deepEqual(await pending, []);
        assert.equal(errors.length, 2);
    });
    it('rejects kernel errors with the bridge message', async () => {
        const pending = client.listKernels();
        const rejected = assert.rejects(pending, /missing dependency/);
        await clock.tickAsync(0);
        processDouble.stdout.emit('data', JSON.stringify({id:requests[0].id,ok:false,error:'missing dependency'})+'\n');
        await rejected;
    });
    it('rejects a timed-out request and ignores its late response', async () => {
        const pending = client.listKernels();
        const rejected = assert.rejects(pending, /timed out: list_kernels/);
        await clock.tickAsync(30001); await rejected;
        reply(requests[0].id, []);
        const next = client.listKernels(); await clock.tickAsync(0);
        reply(requests[1].id, []);
        assert.deepEqual(await next, []);
    });
    it('rejects pending work when the process exits and allows another start', async () => {
        const pending = client.listKernels();
        const rejected = assert.rejects(pending, /exited with code 1/);
        await clock.tickAsync(0); processDouble.emit('close',1); await rejected;
        const next = client.listKernels(); await clock.tickAsync(0);
        reply(requests[1].id, []); assert.deepEqual(await next, []);
    });
});
