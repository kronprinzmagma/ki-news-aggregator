import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { githubRequest } from '../lib/github.js';
test('GitHub response decoding preserves issue bodies across split UTF-8 bytes',async t=>{
  t.mock.method(https,'request',(_options,callback)=>{
    const req=new EventEmitter();req.setTimeout=()=>{};req.write=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=200;callback(res);
      const bytes=Buffer.from(JSON.stringify({body:'Frührente'}));const split=bytes.indexOf(Buffer.from('ü'))+1;
      res.emit('data',bytes.subarray(0,split));res.emit('data',bytes.subarray(split));res.emit('end');
    });return req;
  });
  const r=await githubRequest('test-token','GET','/issues/1');
  assert.equal(JSON.parse(r.body).body,'Frührente');
});
