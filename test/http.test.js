import assert from 'node:assert/strict';
import test from 'node:test';
import { isPrivateIpAddress, isSafeUrl, resolveSafeAddresses } from '../lib/http.js';

test('SSRF URL guard rejects private IPv4 and IPv6 literals', () => {
  assert.equal(isSafeUrl('https://127.0.0.1/feed'), false);
  assert.equal(isSafeUrl('https://10.1.2.3/feed'), false);
  assert.equal(isSafeUrl('https://[::1]/feed'), false);
  assert.equal(isSafeUrl('https://[fe80::1]/feed'), false);
  assert.equal(isSafeUrl('http://example.com/feed'), false);
  assert.equal(isSafeUrl('https://example.com/feed'), true);
});

test('private IP classifier covers internal and reserved ranges', () => {
  assert.equal(isPrivateIpAddress('192.168.1.10'), true);
  assert.equal(isPrivateIpAddress('169.254.169.254'), true);
  assert.equal(isPrivateIpAddress('fc00::1'), true);
  assert.equal(isPrivateIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateIpAddress('8.8.8.8'), false);
  assert.equal(isPrivateIpAddress('2606:4700:4700::1111'), false);
});

test('resolved DNS answers cannot point at internal addresses', async () => {
  const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];
  const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

  await assert.rejects(
    () => resolveSafeAddresses('feed.example.test', privateLookup),
    /Private Ziel-IP blockiert/
  );
  await assert.doesNotReject(() => resolveSafeAddresses('feed.example.test', publicLookup));
});

test('HTTP body decoding preserves UTF-8 characters split across network chunks', async t => {
  const { default: https } = await import('node:https');
  const { EventEmitter } = await import('node:events');
  const { httpGet } = await import('../lib/http.js');
  t.mock.method(https, 'get', (_url, _options, callback) => {
    const req = new EventEmitter(); req.setTimeout = () => {};
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; callback(res);
      const bytes = Buffer.from('Frührente');
      res.emit('data', bytes.subarray(0, 3));
      res.emit('data', bytes.subarray(3));
      res.emit('end');
    });
    return req;
  });
  assert.equal(await httpGet('https://example.test', { enforceSafeUrl: false }), 'Frührente');
});

test('HTTP body decoding respects ISO-8859-1 feed charset', async t => {
  const { default: https } = await import('node:https');
  const { EventEmitter } = await import('node:events');
  const { httpGet } = await import('../lib/http.js');
  t.mock.method(https, 'get', (_url, _options, callback) => {
    const req = new EventEmitter(); req.setTimeout = () => {};
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200;
      res.headers = { 'content-type': 'application/rss+xml; charset=ISO-8859-1' };
      callback(res); res.emit('data', Buffer.from('Frührente', 'latin1')); res.emit('end');
    }); return req;
  });
  assert.equal(await httpGet('https://example.test', { enforceSafeUrl: false }), 'Frührente');
});
