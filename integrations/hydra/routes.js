"use strict";
const http = require("node:http");
const { createHydraBridge, BridgeError } = require("./bridge");

const JSON_LIMIT = 8192;
const MAX_ACTIVE = 4;

// Integrate ONLY behind RAMpage's existing authenticated web server.
// resolveSession(req) must return trusted server-derived permissions;
// it MUST NOT read session/CSRF flags from request headers or JSON.
function createHydraRoutes({ bridge, resolveSession, verifyOrigin, verifyCsrf, checkRateLimit }) {
  if (!bridge || typeof resolveSession !== "function" ||
      typeof verifyOrigin !== "function" || typeof verifyCsrf !== "function" ||
      typeof checkRateLimit !== "function") {
    throw new Error("Hydra routes require trusted session, origin, CSRF and rate-limit middleware");
  }
  let active = 0;
  return async function hydraRoutes(req, res) {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (!pathname.startsWith("/api/hydra/bridge/")) return false;
    const send = (status, data) => {
      if (res.headersSent) return;
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify(data));
    };
    if (active >= MAX_ACTIVE) { send(429, { error: "BUSY" }); return true; }
    active++;
    try {
      const session = await resolveSession(req);
      if (!session || session.authenticated !== true || session.hydraEnabled !== true) {
        send(403, { error: "FORBIDDEN" }); return true;
      }
      if (!await checkRateLimit(req, session)) {
        send(429, { error: "RATE_LIMITED" }); return true;
      }
      const isPost = req.method === "POST";
      if (isPost && (!await verifyOrigin(req) || !await verifyCsrf(req, session))) {
        send(403, { error: "FORBIDDEN" }); return true;
      }
      const context = {
        authenticated: true, hydraEnabled: true,
        canManageDownloads: session.canManageDownloads === true,
        csrfValidated: isPost,
      };
      let result;
      if (req.method === "GET" && pathname === "/api/hydra/bridge/status") {
        result = await bridge.status(context);
      } else if (req.method === "GET" && pathname === "/api/hydra/bridge/downloads") {
        result = await bridge.downloads(context);
      } else if (isPost && (pathname === "/api/hydra/bridge/search" ||
                             pathname === "/api/hydra/bridge/command" ||
                             pathname === "/api/hydra/bridge/install")) {
        const body = await readJson(req);
        if (pathname.endsWith("/search")) result = await bridge.search(context, body);
        else if (pathname.endsWith("/install")) result = await bridge.requestInstaller(context, body);
        else result = await bridge.command(context, body);
      } else {
        send(404, { error: "NOT_FOUND" }); return true;
      }
      send(200, { data: result });
    } catch (err) {
      const status = err instanceof BridgeError
        ? ({ FORBIDDEN: 403, INVALID_INPUT: 400, UNAVAILABLE: 503, REJECTED: 409, BAD_RESPONSE: 502 }[err.code] || 400)
        : err && err.message === "JSON_TOO_LARGE" ? 413 : err instanceof SyntaxError ? 400 : 500;
      send(status, { error: err instanceof BridgeError ? err.code :
        status === 413 ? "JSON_TOO_LARGE" : status === 400 ? "INVALID_JSON" : "INTERNAL_ERROR" });
    } finally {
      active--;
    }
    return true;
  };
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(req.headers["content-type"] || "")) {
    throw new SyntaxError("JSON content type required");
  }
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > JSON_LIMIT) throw new Error("JSON_TOO_LARGE");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new SyntaxError("JSON object required");
  return parsed;
}

module.exports = { createHydraRoutes };
