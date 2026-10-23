"use strict";

/**
 * Embeddable Hydra development panel.
 * Inject createHydraWebClient(...) as client. No HTML interpolation with external data.
 * Render only when desktop Hydra integration was enabled by the production server.
 */
function mountHydraDownloadPanel(root, { client, gameId, gameTitle, pollMs = 3000 } = {}) {
  if (!root || typeof root.appendChild !== "function") throw new TypeError("Root element required");
  if (!client || typeof client.status !== "function") throw new TypeError("Hydra client required");
  const doc = root.ownerDocument;
  let destroyed = false, timer = null, busy = false, supported = false;
  const make = (tag, text, parent, className) => {
    const el = doc.createElement(tag);
    if (text !== undefined) el.textContent = String(text);
    if (className) el.className = className;
    (parent || root).appendChild(el);
    return el;
  };
  const wrap = make("section", undefined, root, "hydra-download-panel");
  wrap.setAttribute("aria-label", "Hydra download management");
  make("h3", "Hydra downloads", wrap);
  const statusText = make("p", "Checking Hydra companion…", wrap, "hydra-status");
  statusText.setAttribute("role", "status");
  const controls = make("div", undefined, wrap, "hydra-actions");
  const results = make("div", undefined, wrap, "hydra-results");
  const transfers = make("div", undefined, wrap, "hydra-transfers");
  const safeRun = async (fn) => {
    if (busy || destroyed) return;
    busy = true;
    try { await fn(); }
    catch (error) {
      if (!destroyed) statusText.textContent = "Hydra request failed: " + (error && error.code ? error.code : "REQUEST_FAILED");
    }
    finally { busy = false; }
  };
  const button = (label, parent, action) => {
    const b = make("button", label, parent);
    b.type = "button";
    b.addEventListener("click", () => safeRun(action));
    return b;
  };
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  async function refresh() {
    const data = await client.downloads();
    if (destroyed) return;
    clear(transfers);
    make("h4", "Download queue", transfers);
    if (!Array.isArray(data) || !data.length) make("p", "No active downloads.", transfers);
    for (const item of Array.isArray(data) ? data : []) {
      const entry = make("div", undefined, transfers, "hydra-transfer");
      make("span", item.state + (typeof item.progress === "number" ? " — " + item.progress + "%" : ""), entry);
      if (typeof item.progress === "number") {
        const progress = make("progress", undefined, entry);
        progress.max = 100;
        progress.value = Math.max(0, Math.min(100, item.progress));
        progress.setAttribute("aria-label", "Download progress");
      }
      if (item.state === "downloading") button("Pause", entry, async () => { await client.pause(gameId, item.id); await refresh(); });
      if (item.state === "paused") button("Resume", entry, async () => { await client.resume(gameId, item.id); await refresh(); });
      if (["queued", "downloading", "paused"].includes(item.state)) button("Cancel", entry, async () => {
        if (typeof globalThis.confirm === "function" && !globalThis.confirm("Cancel this download?")) return;
        await client.cancel(gameId, item.id); await refresh();
      });
    }
  }
  async function search() {
    const rows = await client.search(gameTitle);
    if (destroyed) return;
    clear(results);
    make("h4", "Available matches", results);
    if (!Array.isArray(rows) || rows.length === 0) make("p", "No matching entries returned.", results);
    for (const item of Array.isArray(rows) ? rows : []) {
      const line = make("div", undefined, results, "hydra-result");
      make("span", item.title + " — " + item.optionCount + " option(s)", line);
      // Search result counts are not source selections; no fake Queue button.
      make("small", "Choose a permitted source inside Hydra when a companion supports it.", line);
    }
  }
  async function initialise() {
    const capability = await client.status();
    if (destroyed) return;
    supported = Boolean(capability && capability.connected && Array.isArray(capability.capabilities));
    clear(controls);
    if (!supported) {
      statusText.textContent = "Hydra companion not connected. Cached searches remain available in RAMpage v1.6.7.";
      return;
    }
    statusText.textContent = "Hydra companion connected.";
    if (capability.capabilities.includes("search")) button("Search for Downloads", controls, search);
    if (capability.capabilities.includes("readStatus")) button("Refresh Downloads", controls, refresh);
    button("Installation instructions", controls, async () => {
      const response = await client.requestInstall(gameId);
      statusText.textContent = response.message || "Installation requires confirmation on the gaming PC.";
    });
    if (capability.capabilities.includes("readStatus")) await refresh();
  }
  const ready = safeRun(initialise);
  if (pollMs > 0 && Number.isFinite(pollMs)) {
    // Poll only while mounted and connected; no scheduling in tests unless requested.
    timer = setInterval(() => {
      if (!destroyed && supported && !busy) safeRun(refresh);
    }, Math.max(1000, pollMs));
    if (timer && typeof timer.unref === "function") timer.unref();
  }
  return {
    ready,
    refresh: () => safeRun(refresh),
    destroy() { destroyed = true; if (timer !== null) clearInterval(timer); wrap.remove(); },
  };
}

module.exports = { mountHydraDownloadPanel };
