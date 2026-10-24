"use strict";
const STOP_TOKENS = new Set([
"repack","fitgirl","dodi","elamigos","kaos","flt","rune","tenoke","codex",
  "skidrow","plaza","gog","steamrip","portable","multilanguage","multi2",
  "multi5","multi10","multi12","x64","x86","pc","win64","incl","dlc","all",
  "dlcs","bonus","ost","soundtrack","artbook","update","hotfix","build",
  "setup","installer","rip","iso","rom","usa","eur","jpn","ps2","ps4",
  "shadps4","pcsx2","switch","nsp","xci"
]);
function cleanReleaseTitle(rawTitle = "") {
  if (typeof rawTitle !== "string") return "";
  let text = rawTitle
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, " ")
    .replace(/[._+]+/g, " ")
    .replace(/\bv?\d+(?:\.\d+){1,4}[a-z]?\b/gi, " ")
    .replace(/\b(?:v\d+|build\s*\d+|rev\s*\d+)\b/gi, " ");
  const words = text.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const filtered = [];
  for (const word of words) {
    const lower = word.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!lower) continue;
    if (STOP_TOKENS.has(lower)) break;
    filtered.push(word);
  }
  return (filtered.length ? filtered : words).join(" ").replace(/\s{2,}/g, " ").trim().slice(0, 160) || rawTitle.trim().slice(0, 160);
function rankLibraryWithConcierge(query = "", games = []) {
  const q = String(query || "").toLowerCase().trim();
  if (!q || !Array.isArray(games)) return [];
  const wantsUnplayed = /\b(unplayed|never played|backlog|new|untouched|0\s*h)\b/.test(q);
  const wantsQuick = /\b(short|quick|30\s*m|pick up|casual|arcade|fast)\b/.test(q);
  const wantsCoop = /\b(co-?op|multiplayer|couch|local|split[- ]?screen|friends|party)\b/.test(q);
  const wantsController = /\b(controller|gamepad|couch|big\s*picture|tv)\b/.test(q);
  const tokens = q.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["show","games","game","play","with","that","for","the","some","what","should"].includes(w));
const scored = [];
  for (const g of games) {
    if (g.hidden) continue;
    let score = 0;
    const reasons = [];
    const hay = [g.name, g.meta?.description, g.meta?.about, ...(g.meta?.genres || []), ...(g.meta?.features || []), ...(g.meta?.platforms || []), g.notes].filter(Boolean).join(" ").toLowerCase();
    for (const token of tokens) {
      if (hay.includes(token)) { score += 20; reasons.push(`Matches "${token}"`); }
    }
    const hrs = (Number(g.playtimeSec) || 0) / 3600;
    if (wantsUnplayed && hrs < 0.5) { score += 30; reasons.push("Unplayed in backlog"); }
    if (wantsQuick && (/\b(indie|arcade|action|platformer|roguelike|puzzle)\b/.test(hay) || hrs < 5)) { score += 22; reasons.push("Quick session fit"); }
    if (wantsCoop && /\b(co-?op|multiplayer|split|local|party)\b/.test(hay)) { score += 30; reasons.push("Co-op / Multiplayer"); }
    if (wantsController && /\b(controller|gamepad|xbox|playstation)\b/.test(hay)) { score += 20; reasons.push("Controller friendly"); }
    if (g.favorite) { score += 8; reasons.push("★ Favourite"); }
    if (score > 0) scored.push({ id: g.id, name: g.name, score, reason: [...new Set(reasons)].slice(0, 3).join(" · ") || "Library match" });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 24);
}
function createAiAssistant() {
  return Object.freeze({
    cleanReleaseTitle,
    async enrichGameMetadata(rawTitle) {
      const cleanName = cleanReleaseTitle(rawTitle);
      if (cleanName.length < 2) throw new Error("Enter a valid game title");
      return {
        name: cleanName,
        description: `${cleanName} — curated in your RAMpage library.`,
        about: `Normalized from "${String(rawTitle).trim()}". Select cover artwork or configure launch options below.`,
        genres: ["Action", "Adventure"],
        developers: [],
        publishers: [],
        platforms: ["PC"],
        releaseDate: "",
        features: ["Single-player", "Controller support"],
        source: "smart-normalizer"
      };
    },
    async askConcierge(query, games) {
      const matches = rankLibraryWithConcierge(query, games);
      return {
        summary: matches.length ? `Found ${matches.length} smart match(es) for "${String(query).slice(0, 80)}".` : "No exact matches found — try 'unplayed', 'co-op', 'quick', or a genre.",
        matches
      };
    }
  });
}

module.exports = { createAiAssistant, cleanReleaseTitle, rankLibraryWithConcierge };
