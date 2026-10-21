'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Module = require('node:module');

const root = process.env.RAMPAGE_APP_ROOT;
assert.ok(root && fs.existsSync(path.join(root, 'src', 'renderer', 'app.js')), 'Unpacked application path required');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8');

test('update labels display the full version, including patch number', () => {
  const source = renderer.match(/^function updLabel\(x\) \{.*\}$/m)?.[0];
  assert.ok(source, 'updLabel source not found');
  const label = vm.runInNewContext('(' + source.replace('function updLabel', 'function') + ')', {
    esc: (x) => String(x)
  });
  assert.equal(label('1.3.1'), ' 1.3.1');
  assert.equal(label('v1.4.0'), ' 1.4.0');
  assert.equal(label('1.4.1'), ' 1.4.1');
  assert.equal(label(''), '');
});

test('version 1.3.0 updater discovers latest 1.4.0 release assets', async () => {
  const original = Module._load;
  const release = {
    tag_name: 'v1.4.0',
    assets: [
      { name: 'RAMpage-Setup-1.4.exe', browser_download_url: 'https://github.com/ctrlaltandfix/RAMpage/releases/download/v1.4.0/RAMpage-Setup-1.4.exe', size: 111000000 },
      { name: 'RAMpage-Setup-1.4.exe.sha256', browser_download_url: 'https://github.com/ctrlaltandfix/RAMpage/releases/download/v1.4.0/RAMpage-Setup-1.4.exe.sha256' }
    ],
    html_url: 'https://github.com/ctrlaltandfix/RAMpage/releases/tag/v1.4.0',
    published_at: '2026-10-22T00:00:00Z'
  };
  Module._load = function(id, ...args) {
    if (id === 'electron') return {
      app: { getVersion: () => '1.3.0' },
      net: { fetch: async () => ({ status:200, ok:true, json:async () => release }) }
    };
    return original.call(this, id, ...args);
  };
  try {
    const updater = require(path.join(root, 'src', 'updater.js'));
    const result = await updater.check();
    assert.equal(result.status, 'available');
    assert.equal(result.version, '1.4.0');
    assert.match(result.url, /RAMpage-Setup-1\.4\.exe$/);
    assert.match(result.shaUrl, /RAMpage-Setup-1\.4\.exe\.sha256$/);
  } finally {
    Module._load = original;
  }
});
