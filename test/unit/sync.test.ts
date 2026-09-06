import {strict as assert} from 'node:assert';
import {beforeEach,afterEach,describe,it} from 'mocha';
import FakeTimers from '@sinonjs/fake-timers';
import {FileSync} from '../../src/components/FileSync';

describe('Sync scheduling',()=>{
    let clock:ReturnType<typeof FakeTimers.install>;
    let sync:FileSync;
    let synced:string[];
    beforeEach(()=>{
        clock=FakeTimers.install({now:10000,toFake:['setTimeout','clearTimeout','Date']});
        synced=[];
        sync=new FileSync({workspace:{getActiveFile:()=>({path:'active.md'})}} as any,'unused');
        sync.syncFiles=async(file)=>{synced.push(file.path);};
    });
    afterEach(()=>clock.uninstall());
    it('coalesces a burst of modifications to one file',async()=>{
        for(let i=0;i<5;i++) await sync.handleSync({path:'note.md'} as any);
        assert.deepEqual(synced,[]);
        await clock.tickAsync(500);
        assert.deepEqual(synced,['note.md']);
    });
    it('supports manually syncing the active note',async()=>{
        await sync.handleSync(); await clock.tickAsync(500);
        assert.deepEqual(synced,['active.md']);
    });
    it('accepts a later edit after the loop suppression period',async()=>{
        await sync.handleSync({path:'note.md'} as any); await clock.tickAsync(2001);
        await sync.handleSync({path:'note.md'} as any); await clock.tickAsync(500);
        assert.deepEqual(synced,['note.md','note.md']);
    });
});
