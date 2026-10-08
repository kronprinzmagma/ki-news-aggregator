import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { claudeStructured } from '../lib/claude.js';
const schema={type:'object',properties:{value:{type:'integer'}},required:['value']};
const options={model:'test',messages:[{role:'user',content:'test'}],toolName:'result',schema,maxRetries:0};
function mockResponse(t,input,stopReason='tool_use') {
  t.mock.method(https,'request',(_options,callback)=>{
    const req=new EventEmitter();req.setTimeout=()=>{};req.write=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=200;res.headers={};callback(res);
      res.emit('data',Buffer.from(JSON.stringify({stop_reason:stopReason,content:[{type:'tool_use',name:'result',input}]})));
      res.emit('end');
    });return req;
  });
}

test('structured API helper rejects empty objects despite successful HTTP',async t=>{
  process.env.ANTHROPIC_API_KEY='test-only';mockResponse(t,{});
  await assert.rejects(()=>claudeStructured(options));
});
test('structured API helper rejects token-truncated responses',async t=>{
  process.env.ANTHROPIC_API_KEY='test-only';mockResponse(t,{value:4},'max_tokens');
  await assert.rejects(()=>claudeStructured(options),/Tokenlimit/);
});
test('structured API helper accepts a complete schema-valid response',async t=>{
  process.env.ANTHROPIC_API_KEY='test-only';mockResponse(t,{value:4});
  assert.deepEqual(await claudeStructured(options),{value:4});
});

test('batch scoring validates tool schema and rejects truncated responses too',async t=>{
  const { claudeBatch }=await import('../lib/claude.js');
  process.env.ANTHROPIC_API_KEY='test-only';
  const rows=[['valid',{value:4},'tool_use'],['empty',{},'tool_use'],['truncated',{value:4},'max_tokens']];
  const jsonl=rows.map(([id,input,stop_reason])=>JSON.stringify({custom_id:id,result:{type:'succeeded',message:{model:'test',stop_reason,content:[{type:'tool_use',name:'result',input}]}}})).join('\n');
  t.mock.method(https,'request',(options,callback)=>{
    const req=new EventEmitter();req.setTimeout=()=>{};req.write=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=200;res.headers={};callback(res);
      res.emit('data',Buffer.from(options.method==='POST'?JSON.stringify({id:'batch-test',processing_status:'ended',results_url:'https://api.anthropic.com/results'}):jsonl));
      res.emit('end');
    });return req;
  });
  const result=await claudeBatch(rows.map(([id])=>({custom_id:id,...options,tools:[{name:'result',input_schema:schema}],toolChoice:{type:'tool',name:'result'}})));
  assert.deepEqual(result.get('valid').tool_input,{value:4});
  assert.match(result.get('empty').error,/Ungültiges/);
  assert.match(result.get('truncated').error,/Tokenlimit/);
});

test('strict tool schema preserves types and keeps unsupported constraints for client validation', async () => {
  const { prepareStrictSchema } = await import('../lib/claude.js');
  const original={type:'object',properties:{rows:{type:'array',maxItems:5,items:{type:'object',properties:{rating:{type:'integer',minimum:1,maximum:5}},required:['rating']}}},required:['rows']};
  const sent=prepareStrictSchema(original);
  assert.equal(sent.additionalProperties,false);
  assert.equal(sent.properties.rows.items.additionalProperties,false);
  assert.equal(sent.properties.rows.maxItems,undefined);
  assert.equal(sent.properties.rows.items.properties.rating.minimum,undefined);
  assert.match(sent.properties.rows.items.properties.rating.description,/minimum: 1/);
  assert.equal(original.properties.rows.maxItems,5);
});
