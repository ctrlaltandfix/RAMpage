"use strict";

// Browser-side transport for the RAMpage Hydra download panel.
// All permissions are determined on the server, never in this client.
function createHydraWebClient({ csrfToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch required");
  const base = "/api/hydra/bridge";
  async function request(path, payload) {
    const isPost = payload !== undefined;
    const response = await fetchImpl(base + path, {
      method: isPost ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: isPost ? { "Content-Type": "application/json", "X-Rampage-CSRF": csrfToken || "" } : {},
      ...(isPost ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "Hydra bridge request failed");
      error.code = result.error || "REQUEST_FAILED";
      throw error;
    }
    return result.data;
  }
  return Object.freeze({
    status: () => request("/status"),
    downloads: () => request("/downloads"),
    search: (title) => request("/search", { title }),
    queue: (gameId, optionId) => request("/command", { action: "queue", gameId, optionId }),
    pause: (gameId, downloadId) => request("/command", { action: "pause", gameId, downloadId }),
    resume: (gameId, downloadId) => request("/command", { action: "resume", gameId, downloadId }),
    cancel: (gameId, downloadId) => request("/command", { action: "cancel", gameId, downloadId }),
    requestInstall: (gameId) => request("/install", { gameId }),
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { createHydraWebClient };
if (typeof window !== "undefined") window.RAMpageHydraWebClient = createHydraWebClient;
