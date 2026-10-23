"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHydraBridge, BridgeError } = require("./bridge");

const allowed = { authenticated: true, hydraEnabled: true, canManageDownloads: true, csrfValidated: true };
const companion = {
  supported: true,
  async ping() { return true; },
  async search() {
    return [{ id: "steam:123", title: "Sample Game", optionCount: 2, magnet: "private", token: "secret" }];
  },
  async downloads() {
    return [{ id: "job-123", state: "downloading", progress: 52, path: "C:/secret", uri: "secret" }];
  },
  async command(input) { return { accepted: true, echo: input, secret: "must not leak" }; },
};

test("no companion means commands are unavailable", async () => {
  const bridge = createHydraBridge(null);
  assert.deepEqual(await bridge.status(allowed), { connected: false, capabilities: [] });
  await assert.rejects(bridge.search(allowed, { title: "Sample Game" }), { code: "UNAVAILABLE" });
});

test("anonymous and disabled sessions cannot read the bridge", async () => {
  const bridge = createHydraBridge(companion);
  await assert.rejects(bridge.downloads({ ...allowed, authenticated: false }), { code: "FORBIDDEN" });
  await assert.rejects(bridge.downloads({ ...allowed, hydraEnabled: false }), { code: "FORBIDDEN" });
});

test("browser receives only redacted game and progress fields", async () => {
  const bridge = createHydraBridge(companion);
  assert.deepEqual(await bridge.search(allowed, { title: "Sample" }),
    [{ id: "steam:123", title: "Sample Game", optionCount: 2 }]);
  assert.deepEqual(await bridge.downloads(allowed),
    [{ id: "job-123", state: "downloading", progress: 52 }]);
});

test("mutations need privileges and validated CSRF", async () => {
  const bridge = createHydraBridge(companion);
  const payload = { action: "queue", gameId: "steam:123", optionId: "option-1" };
  await assert.rejects(bridge.command({ ...allowed, csrfValidated: false }, payload), { code: "FORBIDDEN" });
  await assert.rejects(bridge.command({ ...allowed, canManageDownloads: false }, payload), { code: "FORBIDDEN" });
  assert.deepEqual(await bridge.command(allowed, payload), { accepted: true });
});

test("invalid actions and untrusted IDs are rejected", async () => {
  const bridge = createHydraBridge(companion);
  await assert.rejects(bridge.command(allowed, { action: "execute", gameId: "abc", optionId: "xyz" }),
    { code: "INVALID_INPUT" });
  await assert.rejects(bridge.command(allowed, { action: "queue", gameId: "../game", optionId: "id" }),
    { code: "INVALID_INPUT" });
});

test("installer request never executes a binary", async () => {
  const bridge = createHydraBridge(companion);
  assert.deepEqual(await bridge.requestInstaller(allowed, { gameId: "steam:123" }),
    { accepted: false, requiresLocalApproval: true,
      message: "Confirm installation on the gaming PC in Hydra Launcher" });
});
