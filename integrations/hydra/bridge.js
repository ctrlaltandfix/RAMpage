"use strict";

/**
 * RAMpage <-> Hydra bridge boundary (v1.6.8 development).
 *
 * This module deliberately DOES NOT hook Hydra's private Electron IPC,
 * invoke a downloader, open arbitrary URIs, or run installers.
 * Wire a supported, opted-in Hydra-side adapter before enabling commands.
 */
const ACTIONS = new Set(["queue", "pause", "resume", "cancel"]);
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/;
const STATES = new Set(["queued", "downloading", "paused", "completed", "failed", "cancelled"]);
const MAX_RESULTS = 50;

class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

function safeId(value, field) {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new BridgeError("INVALID_INPUT", `Invalid ${field}`);
  }
  return value;
}

function trustedContext(context, mutate = false) {
  if (!context || context.authenticated !== true || context.hydraEnabled !== true) {
    throw new BridgeError("FORBIDDEN", "An authenticated session and desktop Hydra opt-in are required");
  }
  if (mutate && (context.canManageDownloads !== true || context.csrfValidated !== true)) {
    throw new BridgeError("FORBIDDEN", "Download management permission and CSRF verification are required");
  }
}

function requireAdapter(adapter, operation) {
  if (!adapter || adapter.supported !== true || typeof adapter[operation] !== "function") {
    throw new BridgeError("UNAVAILABLE", "A supported Hydra-side companion is not connected");
  }
}

// Convert adapter records to browser-safe fields. Never expose source links,
// torrent metadata, auth credentials, installer filenames or filesystem paths.
function projectDownload(row) {
  if (!row || typeof row !== "object") throw new BridgeError("BAD_RESPONSE", "Invalid companion response");
  const id = safeId(row.id, "download id");
  const state = STATES.has(row.state) ? row.state : "unknown";
  const progress = Number.isFinite(row.progress)
    ? Math.max(0, Math.min(100, row.progress))
    : null;
  return { id, state, progress };
}

function createHydraBridge(adapter) {
  return Object.freeze({
    async status(context) {
      trustedContext(context);
      return { connected: adapter?.supported === true, capabilities: adapter?.supported === true
        ? ["search", "queue", "pause", "resume", "cancel", "readStatus"] : [] };
    },

    async search(context, { title } = {}) {
      trustedContext(context);
      requireAdapter(adapter, "search");
      if (typeof title !== "string" || title.trim().length < 2 || title.length > 160) {
        throw new BridgeError("INVALID_INPUT", "Search title must contain 2–160 characters");
      }
      const results = await adapter.search({ title: title.trim() });
      if (!Array.isArray(results)) throw new BridgeError("BAD_RESPONSE", "Invalid search response");
      return results.slice(0, MAX_RESULTS).map((row) => ({
        id: safeId(row.id, "game id"),
        title: typeof row.title === "string" ? row.title.slice(0, 160) : "",
        // Counts and opaque IDs only. No direct download links or installers.
        optionCount: Number.isSafeInteger(row.optionCount)
          ? Math.max(0, Math.min(9999, row.optionCount)) : 0,
      }));
    },

    async downloads(context) {
      trustedContext(context);
      requireAdapter(adapter, "downloads");
      const rows = await adapter.downloads();
      if (!Array.isArray(rows)) throw new BridgeError("BAD_RESPONSE", "Invalid downloads response");
      return rows.slice(0, MAX_RESULTS).map(projectDownload);
    },

    async command(context, input = {}) {
      trustedContext(context, true);
      requireAdapter(adapter, "command");
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new BridgeError("INVALID_INPUT", "Invalid download command");
      }
      const { action, gameId, downloadId, optionId } = input;
      if (!ACTIONS.has(action)) throw new BridgeError("INVALID_INPUT", "Unknown action");
      const safeGameId = safeId(gameId, "game id");
      const safeDownloadId = action === "queue" ? undefined : safeId(downloadId, "download id");
      const safeOptionId = action === "queue" ? safeId(optionId, "option id") : undefined;

      // Explicit local destination/source selection must be handled INSIDE the
      // trusted Hydra companion; never accept a path, URI or executable via HTTP.
      const payload = action === "queue"
        ? { action, gameId: safeGameId, optionId: safeOptionId }
        : { action, gameId: safeGameId, downloadId: safeDownloadId };
      const result = await adapter.command(payload);
      if (!result || result.accepted !== true) {
        throw new BridgeError("REJECTED", "Hydra did not accept the request");
      }
      return { accepted: true };
    },

    async requestInstaller(context, { gameId } = {}) {
      trustedContext(context, true);
      safeId(gameId, "game id");
      // A remote request must never silently launch an executable.
      return { accepted: false, requiresLocalApproval: true,
        message: "Confirm installation on the gaming PC in Hydra Launcher" };
    },
  });
}

module.exports = { createHydraBridge, BridgeError };
