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

// ─── 5.5-Modelle: modellabhängige Request-Parameter ─────────────────────────
import { buildMessageParams, extractText } from '../lib/claude.js';

test('buildMessageParams: Sonnet 5.5 ohne erzwungenes Werkzeug, Denken aus', () => {
  const tools = [{ name: 'submit_x', input_schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } }];
  const p = buildMessageParams({
    model: 'claude-sonnet-5-5', maxTokens: 100, messages: [{ role: 'user', content: 'x' }],
    system: [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }],
    tools, toolChoice: { type: 'tool', name: 'submit_x' },
  });
  assert.deepEqual(p.tool_choice, { type: 'auto' });
  assert.deepEqual(p.thinking, { type: 'between_tools' });
  assert.equal(p.system.length, 2);
  assert.match(p.system[1].text, /submit_x/);
});

test('buildMessageParams: Haiku 5.5 behält erzwungenes Werkzeug, Denken aus', () => {
  const p = buildMessageParams({
    model: 'claude-haiku-5-5', maxTokens: 100, messages: [], tools: [{ name: 't', input_schema: { type: 'object', properties: {} } }],
    toolChoice: { type: 'tool', name: 't' },
  });
  assert.deepEqual(p.tool_choice, { type: 'tool', name: 't' });
  assert.deepEqual(p.thinking, { type: 'disabled' });
});

test('buildMessageParams: ältere Modelle unverändert', () => {
  const p = buildMessageParams({ model: 'claude-sonnet-4-6', maxTokens: 10, messages: [], system: 'S', toolChoice: { type: 'tool', name: 't' } });
  assert.equal(p.thinking, undefined);
  assert.deepEqual(p.tool_choice, { type: 'tool', name: 't' });
  assert.equal(p.system, 'S');
});

test('extractText überspringt thinking-Blöcke', () => {
  assert.equal(extractText({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Hallo' }] }), 'Hallo');
  assert.equal(extractText({ content: [] }), null);
});

test('batch ueber dem Zeitlimit wirft BatchStuckError, damit score.js auf Einzelaufrufe zurueckfaellt',async t=>{
  const { claudeBatch, BatchStuckError }=await import('../lib/claude.js');
  process.env.ANTHROPIC_API_KEY='test-only';
  const calls=[];
  t.mock.method(https,'request',(options,callback)=>{
    calls.push(`${options.method} ${options.path}`);
    const req=new EventEmitter();req.setTimeout=()=>{};req.write=()=>{};
    req.end=()=>queueMicrotask(()=>{
      const res=new EventEmitter();res.statusCode=200;res.headers={};callback(res);
      // Batch laeuft nie zu Ende und meldet nie Fortschritt
      res.emit('data',Buffer.from(JSON.stringify({id:'batch-slow',processing_status:'in_progress',request_counts:{processing:1}})));
      res.emit('end');
    });return req;
  });
  await assert.rejects(
    ()=>claudeBatch([{custom_id:'a',...options,tools:[{name:'result',input_schema:schema}],toolChoice:{type:'tool',name:'result'}}],{pollIntervalMs:1,maxWaitMs:20,stuckTimeoutMs:60_000}),
    err=>err instanceof BatchStuckError&&/Zeitlimit/.test(err.message),
  );
  assert.ok(calls.some(c=>c.startsWith('POST')&&c.endsWith('/cancel')),'Batch wird abgebrochen');
});
