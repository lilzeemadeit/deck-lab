// Game logic: leader locks, deck counts, deck checks, searchers and "cards that use what you have".
import { DB, COLORS } from "./data.js";

// ---- leader lock ----
function altMet(a, L) {
  const [k, v] = a;
  if (k === "type") return L.t.includes(v);
  if (k === "typeinc") return L.t.some(t => t.includes(v));
  if (k === "name") return L.n === v;
  if (k === "nameinc") return L.n.includes(v);
  if (k === "multi") return L.co.length > 1;
  if (k === "color") return L.co.includes(v);
  if (k === "attr") return (L.a || []).includes(v);
  return true;
}
// "none" | "met" | "partial" | "full", plus a short reason
export function lockInfo(card, leader) {
  const segs = (card.sg || []).filter(s => s.c);
  if (!segs.length || !leader) return { state: "none" };
  const unmet = segs.filter(s => !s.c.some(a => altMet(a, leader)));
  if (!unmet.length) return { state: "met" };
  const content = (card.sg || []).filter(s => s.k !== "kw" && s.k !== "rule");
  const need = unmet[0].c.map(a => a[0] === "multi" ? "a multicolor leader" : a[0] === "name" || a[0] === "nameinc" ? a[1] + " leader" : a[0] === "color" ? "a " + a[1].toLowerCase() + " leader" : a[1] + " leader").join(" or ");
  const full = content.length > 0 && content.every(s => unmet.includes(s)) && !(card.sg || []).some(s => s.k === "kw");
  return { state: full ? "full" : "partial", need, text: unmet.map(s => s.ct).filter(Boolean)[0] || "" };
}

export function fitsColors(card, leader) {
  return !leader || card.co.every(x => leader.co.includes(x));
}

// "Best fit": things that work with this leader first
export function fitScore(card, leader) {
  if (!leader) return 0;
  let s = 0;
  const L = lockInfo(card, leader);
  if (L.state === "full") s -= 20; else if (L.state === "partial") s -= 8; else if (L.state === "met") s += 4;
  if (card.t.some(t => leader.t.includes(t))) s += 6;
  const le = leader.e || "";
  for (const t of card.t) if (le.includes("{" + t + "}")) s += 5;
  if (card.tr && /\[Trigger\]/.test(le)) s += 4;
  for (const t of leader.t) if ((card.e || "").includes("{" + t + "}")) s += 2;
  return s;
}

// ---- counts used by the Deck Builder panel and Stats ----
export const ABIL = [
  ["Trigger", c => !!c.tr], ["Blocker", c => c.g.includes("blocker")], ["Rush", c => c.g.includes("rush")],
  ["Double Attack", c => c.g.includes("double")], ["Banish", c => c.g.includes("banish")], ["Unblockable", c => c.g.includes("unblock")],
  ["Counter events", c => c.c === "E" && c.g.includes("counter_ev")],
];
export function glance(entries) {
  const g = { total: 0, cost: {}, color: {}, abil: {}, type: {}, cat: {} };
  for (const [id, n] of entries) {
    const c = DB.byId[id]; if (!c) continue;
    g.total += n;
    const ck = c.k == null ? "–" : c.k >= 10 ? "10+" : String(c.k);
    g.cost[ck] = (g.cost[ck] || 0) + n;
    g.cat[c.c] = (g.cat[c.c] || 0) + n;
    for (const x of c.co) g.color[x] = (g.color[x] || 0) + n;
    for (const x of c.t) g.type[x] = (g.type[x] || 0) + n;
    for (const [name, f] of ABIL) if (f(c)) g.abil[name] = (g.abil[name] || 0) + n;
  }
  return g;
}

// ---- deck checks (shown as a gentle note, never blocks) ----
export function deckIssues(deck) {
  const L = DB.byId[deck.leader]; const out = [];
  if (!L) return out;
  const total = Object.values(deck.cards).reduce((a, b) => a + b, 0);
  if (total !== 50) out.push(`${total}/50 cards`);
  for (const [id, n] of Object.entries(deck.cards)) {
    const c = DB.byId[id]; if (!c) continue;
    if (n > 4 && !c.any) out.push(`${c.n}: max 4`);
    if (!fitsColors(c, L)) out.push(`${c.n} isn't ${L.co.join("/")}`);
    if (c.ban) out.push(`${c.n} is banned`);
  }
  for (const [a, b] of (DB.meta.pairs || [])) if (deck.cards[a] && deck.cards[b]) out.push(`${DB.byId[a]?.n} + ${DB.byId[b]?.n} can't be together`);
  return out;
}

// ---- searchers ----
function filterHit(f, c, x) {
  if (x && c.n === x) return false;
  const idOk = (!f.t && !f.nm) || (f.t && f.t.some(t => c.t.some(ct => ct === t || ct.includes(t)))) || (f.nm && f.nm.includes(c.n));
  if (!idOk) return false;
  if (f.tr && !c.tr) return false;
  if (f.c && c.c !== f.c) return false;
  if (f.co && !c.co.includes(f.co)) return false;
  if (f.a && !f.a.some(a => (c.a || []).includes(a))) return false;
  for (const key of ["k", "p"]) if (f[key]) {
    const v = c[key]; const [n, op] = f[key];
    if (v == null) return false;
    if (op === "less" && v > n) return false; if (op === "more" && v < n) return false; if (op === "eq" && v !== n) return false;
  }
  return true;
}
export function searcherHits(card, entries) {
  const sr = card.sr; if (!sr) return 0;
  let n = 0;
  for (const [id, cnt] of entries) { const c = DB.byId[id]; if (c && c.c !== "L" && sr.alts.some(f => filterHit(f, c, sr.x))) n += cnt; }
  return n;
}
export function searcherLabel(sr) {
  const job = sr.job === "play" ? "Plays it" : sr.job === "life" ? "Adds to Life" : sr.n > 1 ? `Adds up to ${sr.n} to hand` : "Adds to hand";
  return `${job} · looks at ${sr.look}`;
}

// ---- resources a deck is rich in (Ideas) ----
export function resources(entries) {
  const r = { trig: 0, event: 0, type: {} };
  for (const [id, n] of entries) {
    const c = DB.byId[id]; if (!c) continue;
    if (c.tr) r.trig += n;
    if (c.c === "E") r.event += n;
    for (const t of c.t) r.type[t] = (r.type[t] || 0) + n;
  }
  return r;
}
export function needHave(nd, r) {
  if (nd[0] === "trig") return ["a [Trigger] card", r.trig];
  if (nd[0] === "event") return ["Events", r.event];
  if (nd[0] === "type") return [`{${nd[1]}} cards`, r.type[nd[1]] || 0];
  return ["?", 0];
}
