// Read a decklist pasted from other sites/apps and turn it into a deck.
// Handles: OPTCGSim / Limitless "Copy to Sim" (4xOP01-016), Limitless text & Egman (4 OP01-016 Nami),
// "4x Nami (OP01-016)", name-only lists (4 Nami), CSV with a quantity column, JSON exports,
// deck links that carry the list in the address (…dg=1nOP01-001a4nOP01-016…), and our own exports.
import { DB } from "./data.js";

const ID_RX = /\b((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})(?:_[a-z]\d+|_p\d+|_r\d+)?\b/i;
const HEADER_RX = /^(leader|leaders|characters?|events?|stages?|deck|decklist|main deck|total|counter|cards?|sideboard|don)\b/i;
const norm = s => s.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[^a-z0-9]+/g, "");

let NAMES = null;
function nameIndex() {
  if (NAMES) return NAMES;
  NAMES = {};
  for (const c of DB.cards.concat(DB.spoilers)) (NAMES[norm(c.n)] = NAMES[norm(c.n)] || []).push(c);
  return NAMES;
}
const findId = id => DB.byId[id.toUpperCase().replace(/_.*/, "")] || null;

// Turn any of the supported shapes into simple lines of "qty id-or-name".
function toLines(text) {
  const t = text.trim();
  if (!t) return [];
  // JSON (e.g. exported from a site's API or app)
  if (/^[\[{]/.test(t)) {
    try {
      const out = [];
      const walk = o => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === "object") {
          const id = o.id || o.card_id || o.cardId || o.number || o.code || o.card_number;
          const n = o.count ?? o.quantity ?? o.qty ?? o.amount ?? o.copies;
          if (typeof id === "string" && ID_RX.test(id)) out.push(`${n ?? 1} ${id}`);
          else Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(t));
      if (out.length) return out;
    } catch (e) {}
  }
  // A link or code with the list packed inside: 1nOP01-001a4nOP01-016…
  const packed = [...decodeURIComponent(t).matchAll(/(\d{1,2})n((?:OP|ST|EB|PRB)\d{2}-\d{3}|P-\d{3})/gi)];
  if (packed.length >= 3) return packed.map(m => `${m[1]} ${m[2]}`);
  // CSV with a header row
  const rows = t.split(/\r?\n/);
  const head = rows[0].toLowerCase();
  if (/[,;\t]/.test(head) && /(qty|quantity|count|amount|copies)/.test(head)) {
    const sep = head.includes("\t") ? "\t" : head.includes(";") ? ";" : ",";
    const cols = head.split(sep).map(s => s.trim().replace(/"/g, ""));
    const qi = cols.findIndex(c => /^(qty|quantity|count|amount|copies)$/.test(c));
    const ii = cols.findIndex(c => /(print ?number|card ?(id|number|no)|^id$|^number$|^code$)/.test(c));
    const ni = cols.findIndex(c => /(card ?name|^name$)/.test(c));
    return rows.slice(1).filter(r => r.trim()).map(r => {
      const v = r.split(sep).map(s => s.trim().replace(/^"|"$/g, ""));
      return `${v[qi] || 1} ${ii >= 0 && v[ii] ? v[ii] : ""} ${ni >= 0 ? v[ni] || "" : ""}`.trim();
    });
  }
  // Several "4xOP01-016" packed on one line with spaces/commas
  return rows.flatMap(r => {
    const many = r.match(/\d+\s*x\s*(?:OP|ST|EB|PRB)\d{2}-\d{3}/gi);
    return many && many.length > 1 ? many : [r];
  });
}

// Parse one line into { n, id | name }.
function parseLine(raw) {
  let s = raw.replace(/\/\/.*$|#.*$/, "").replace(/[×]/g, "x").trim();
  if (!s) return null;
  s = s.replace(/^[-•*]\s*/, "");
  let n = null;
  let m = s.match(/^(\d{1,2})\s*x?\s*(?=\S)/i);               // 4x… / 4 … / 4xOP…
  if (m) { n = +m[1]; s = s.slice(m[0].length); }
  else if ((m = s.match(/\s*(?:x\s*(\d{1,2})|\((\d{1,2})\))\s*$/i))) { n = +(m[1] || m[2]); s = s.slice(0, m.index); }
  const idm = s.match(ID_RX);
  if (idm) return { n: n ?? 1, id: idm[1].toUpperCase(), raw };
  const name = s.replace(/\[[^\]]*\]|\([^)]*\)|\*F\*/g, "").replace(/^leader\s*:\s*/i, "").trim();
  if (n == null || !name || HEADER_RX.test(name)) return null;  // headings, totals, notes
  return { n, name, raw };
}

export function parseDeckText(text, picks = {}) {
  const idx = nameIndex();
  const rows = [];
  for (const raw of toLines(text)) {
    const p = parseLine(raw); if (!p) continue;
    if (p.id) {
      const c = findId(p.id);
      rows.push(c ? { raw, n: p.n, card: c, status: "ok" } : { raw, n: p.n, status: "missing", why: `${p.id} isn't in the card list yet` });
      continue;
    }
    const opts = idx[norm(p.name)] || [];
    if (!opts.length) { rows.push({ raw, n: p.n, status: "missing", why: `No card named “${p.name}”` }); continue; }
    rows.push({ raw, n: p.n, name: p.name, options: opts, status: opts.length === 1 ? "ok" : "pick", card: opts.length === 1 ? opts[0] : null });
  }
  // leader: first leader in the list
  let leader = null; let leaderChoices = null;
  for (const r of rows) if (r.card && r.card.c === "L") { leader = r.card; break; }
  if (!leader) {   // listed by name only: the 1-copy row whose name is also a leader
    const L = rows.find(r => r.options && r.n === 1 && r.options.some(c => c.c === "L")) || rows.find(r => r.options && r.options.some(c => c.c === "L"));
    if (L) {
      const ls = L.options.filter(c => c.c === "L");
      leader = (picks.L && DB.byId[picks.L]) || ls.slice().sort((a, b) => b.i.localeCompare(a.i))[0];
      L.card = leader; L.status = "ok"; L.isLeader = true;
      if (ls.length > 1) leaderChoices = ls;
    }
  }
  // name-only rows that match several cards: user's pick, else best guess (leader's colors, newest)
  rows.forEach((r, i) => {
    if (r.status !== "pick") return;
    const chosen = picks[i] && DB.byId[picks[i]];
    if (chosen) { r.card = chosen; r.status = "ok"; return; }
    // best guess: shares the leader's colors and types, then newest printing
    const score = c => (leader && c.co.some(x => leader.co.includes(x)) ? 2 : 0) + (leader && c.t.some(t => leader.t.includes(t)) ? 2 : 0);
    const pool = r.options.filter(c => c.c !== "L");
    r.card = (pool.length ? pool : r.options).slice().sort((a, b) => score(b) - score(a) || (a.i.startsWith("P-") - b.i.startsWith("P-")) || b.i.localeCompare(a.i))[0];
    r.status = "guess";
  });
  if (!leader && rows.length) {   // no leader in the list: offer leaders that fit the cards' colors
    const cols = new Set(rows.filter(r => r.card).flatMap(r => r.card.co));
    leaderChoices = DB.cards.filter(c => c.c === "L" && [...cols].every(x => c.co.includes(x))).sort((a, b) => b.i.localeCompare(a.i));
    if (picks.L && DB.byId[picks.L]) leader = DB.byId[picks.L];
  }
  const cards = {};
  const notes = [];
  for (const r of rows) {
    if (!r.card || r.isLeader || (r.card === leader && r.n === 1)) continue;
    if (r.card.c === "L") { notes.push(`Skipped a second leader: ${r.card.n}`); continue; }
    cards[r.card.i] = (cards[r.card.i] || 0) + r.n;
  }
  for (const [id, n] of Object.entries(cards)) if (n > 4 && !DB.byId[id].any) notes.push(`${DB.byId[id].n} ×${n} — more than 4 copies`);
  const total = Object.values(cards).reduce((a, b) => a + b, 0);
  if (rows.length && total !== 50) notes.push(`${total} cards — a deck needs 50`);
  return { rows, leader, leaderChoices, cards, total, notes };
}

export function looksLikeOnlyALink(text) {
  const t = text.trim();
  return /^https?:\/\/\S+$/.test(t) && !ID_RX.test(decodeURIComponent(t));
}
