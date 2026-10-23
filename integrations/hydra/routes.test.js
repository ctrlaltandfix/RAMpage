"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");
const { createHydraRoutes } = require("./routes");
const { createHydraBridge } = require("./bridge");
const { createHydraWebClient } = require("./web-client");

const bridge = createHydraBridge({
  supported: true,
  async search({ title }) { return [{ id: "game:1", title, optionCount: 1, secret: "no" }]; },
  async downloads() { return [{ id: "download:1", state: "paused", progress: 40, path: "no" }]; },
  async command() { return { accepted: true }; },
});
const handler = createHydraRoutes({
  bridge,
  resolveSession: async (req) => req.testSession || null,
  verifyOrigin: async (req) => req.headers.origin === "http://localhost",
  verifyCsrf: async (req) => req.headers["x-csrf-token"] === "good",
  checkRateLimit: async () => true,
});
const session = { authenticated: true, hydraEnabled: true, canManageDownloads: true };

async function invoke(method, url, body, overrides = {}) {
  const data = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(data ? [Buffer.from(data)] : []);
  req.method = method; req.url = url; req.testSession = overrides.session === undefined ? session : overrides.session;
  req.headers = { "content-type": "application/json", origin: "http://localhost",
    "x-csrf-token": "good", ...overrides.headers };
  const output = [];
  const res = new Writable({ write(chunk, enc, callback) { output.push(Buffer.from(chunk)); callback(); } });
  res.writeHead = (status, headers) => { res.statusCode = status; res.responseHeaders = headers; return res; };
  res.end = (body) => { if (body) output.push(Buffer.from(body)); Writable.prototype.end.call(res); };
  const handled = await handler(req, res);
  return { handled, status: res.statusCode, body: JSON.parse(Buffer.concat(output).toString("utf8")) };
}

test("rejects anonymous web access", async () => {
  const r = await invoke("GET", "/api/hydra/bridge/status", undefined, { session: null });
  assert.equal(r.status, 403);
});

test("rejects bad CSRF and origin on mutations", async () => {
  for (const headers of [{ "x-csrf-token": "bad" }, { origin: "https://evil.invalid" }]) {
    const r = await invoke("POST", "/api/hydra/bridge/command",
      { action: "pause", gameId: "game:1", downloadId: "download:1" }, { headers });
    assert.equal(r.status, 403);
  }
});

test("search and downloads are redacted", async () => {
  const searched = await invoke("POST", "/api/hydra/bridge/search", { title: "Example" });
  assert.equal(searched.status, 200);
  assert.deepEqual(searched.body.data, [{ id: "game:1", title: "Example", optionCount: 1 }]);
  const downloads = await invoke("GET", "/api/hydra/bridge/downloads");
  assert.deepEqual(downloads.body.data, [{ id: "download:1", state: "paused", progress: 40 }]);
});

test("download mutation requires server-issued management privilege", async () => {
  const r = await invoke("POST", "/api/hydra/bridge/command",
    { action: "pause", gameId: "game:1", downloadId: "download:1" },
    { session: { authenticated: true, hydraEnabled: true, canManageDownloads: false } });
  assert.equal(r.status, 403);
});

test("remote install never launches an installer", async () => {
  const r = await invoke("POST", "/api/hydra/bridge/install", { gameId: "game:1" });
  assert.deepEqual(r.body.data, {
    accepted: false, requiresLocalApproval: true,
    message: "Confirm installation on the gaming PC in Hydra Launcher",
  });
});

test("web client sends same-origin credentials and CSRF", async () => {
  const calls = [];
  const client = createHydraWebClient({
    csrfToken: "csrf",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { data: { accepted: true } }; } };
    },
  });
  await client.queue("game:1", "option:1");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.headers["X-CSRF-Token"], "csrf");
  assert.equal(calls[0].url, "/api/hydra/bridge/command");
});
