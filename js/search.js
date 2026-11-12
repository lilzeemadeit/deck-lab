// Card search: plain words, "exact phrases", and a few operators.
// Plain words that look like a type, color, card kind or keyword are "read as" filters
// (shown as removable chips); anything else is matched against name, types and text.
import { DB, COLORS, legal } from "./data.js";

const HAS = {
  trigger: ["trigger", "Has [Trigger]"], blocker: ["blocker", "Blocker"], blockers: ["blocker", "Blocker"], rush: ["rush", "Rush"],
  banish: ["banish", "Banish"], unblockable: ["unblock", "Unblockable"], double: ["double", "Double Attack"],
  counter: ["counter_ev", "[Counter]"], draw: ["draw", "Draw"], search: ["search", "Look / search"], ko: ["ko", "K.O."],
};
const KINDS = { leader: "L", leaders: "L", character: "C", characters: "C", event: "E", events: "E", stage: "S", stages: "S" };

function cmp(v, op, n) {
  if (v == null) return false;
  if (op === "<") return v < n; if (op === "<=") return v <= n; if (op === ">") return v > n; if (op === ">=") return v >= n;
  return v === n;
}

export function parseQuery(q, readOff = []) {
  const out = { must: [], words: [], phrases: [], not: [], read: [], ids: [] };
  const toks = (q || "").match(/-?"[^"]*"?|\S+/g) || [];
  for (let raw of toks) {
    let neg = false;
    if (raw.startsWith("-") && raw.length > 1) { neg = true; raw = raw.slice(1); }
    if (raw.startsWith('"')) { const ph = raw.replace(/"/g, "").toLowerCase().trim(); if (ph) (neg ? out.not : out.phrases).push(ph); continue; }
    const t = raw.toLowerCase();
    let m;
    if ((m = t.match(/^(t|type):(.+)$/))) { const v = m[2].replace(/"/g, ""); out.must.push({ label: "Type: " + v, f: c => c._types.includes(v) }); continue; }
    if ((m = t.match(/^(c|color|colour):(\w+)$/))) { const v = m[2]; out.must.push({ label: "Color: " + v, f: c => c.co.some(x => x.toLowerCase().startsWith(v)) }); continue; }
    if ((m = t.match(/^(cost|k|power|p|counter|ct|life)(<=|>=|<|>|=|:)(\d+)$/))) {
      const key = { cost: "k", k: "k", life: "k", power: "p", p: "p", counter: "ct", ct: "ct" }[m[1]]; const op = m[2] === ":" ? "=" : m[2]; const n = +m[3];
      out.must.push({ label: `${m[1]} ${op} ${n}`, f: c => cmp(key === "ct" ? (c.ct || 0) : c[key], op, n) }); continue;
    }
    if ((m = t.match(/^(has|is|kw):(.+)$/))) { const h = HAS[m[2]] || [m[2], m[2]]; out.must.push({ label: h[1], f: c => c.g.includes(h[0]) }); continue; }
    if ((m = t.match(/^(set|s):(.+)$/))) { const v = m[2].replace(/-/g, ""); out.must.push({ label: "Set " + v.toUpperCase(), f: c => c.v.some(x => x[1].toLowerCase().replace(/-/g, "").includes(v)) }); continue; }
    if ((m = t.match(/^(r|rarity):(\w+)$/))) { const v = m[2].toUpperCase(); out.must.push({ label: "Rarity " + v, f: c => c.r === v || c.v.some(x => x[2] === v) }); continue; }
    if (/^[a-z]{1,4}\d{0,2}-\d{3}$/.test(t)) { out.ids.push(t.toUpperCase()); continue; }
    if (neg) { out.not.push(t); continue; }
    if (t.length < 2) continue;
    // "read as" guesses
    if (!readOff.includes(t)) {
      const col = COLORS.find(x => x.toLowerCase() === t);
      if (col) { out.read.push({ word: t, label: "Color: " + col, f: c => c.co.includes(col) }); continue; }
      if (KINDS[t]) { const k = KINDS[t]; out.read.push({ word: t, label: { L: "Leaders", C: "Characters", E: "Events", S: "Stages" }[k], f: c => c.c === k }); continue; }
      if (HAS[t]) { const h = HAS[t]; out.read.push({ word: t, label: h[1], f: c => c.g.includes(h[0]) }); continue; }
      if (t.length >= 4) {
        const hits = DB.types.filter(ty => ty.toLowerCase().split(/[\s/-]+/).some(w => w.startsWith(t)));
        if (hits.length && hits.length <= 3) {
          const set = hits.map(h => h.toLowerCase());
          out.read.push({ word: t, label: "Type: " + hits.join(" or "), f: c => c.t.some(x => set.includes(x.toLowerCase())) });
          continue;
        }
      }
    }
    out.words.push(t);
  }
  return out;
}

function wordHit(c, w) { return c._name.includes(w) || c._types.includes(w) || c._text.includes(w) || c.i.toLowerCase().includes(w); }

export function uiFilter(c, F) {
  if (!F) return true;
  if (F.colors && F.colors.length && !c.co.some(x => F.colors.includes(x))) return false;
  if (F.cats && F.cats.length && !F.cats.includes(c.c)) return false;
  if (F.costs && F.costs.length && !F.costs.includes(c.k >= 10 ? 10 : c.k)) return false;
  if (F.sets && F.sets.length && !c.v.some(v => F.sets.includes(v[1]))) return false;
  if (F.rar && F.rar.length && !(F.rar.includes(c.r) || c.v.some(v => F.rar.includes(v[2])))) return false;
  if (F.tags && F.tags.length && !F.tags.every(t => c.g.includes(t))) return false;
  if (F.counters && F.counters.length && !F.counters.includes(c.ct || 0)) return false;
  if (F.std && !legal(c) && !c.up) return false;
  if (F.hideBan && c.ban) return false;
  return true;
}

// Returns { best, related, read } for a query over a pool of cards.
export function search(pool, q, F, readOff, opts = {}) {
  const P = parseQuery(q, readOff);
  const base = pool.filter(c => uiFilter(c, F) && P.must.every(m => m.f(c)) && !P.not.some(w => wordHit(c, w)) && (opts.extra ? opts.extra(c) : true));
  const soft = P.read.map(r => r.f).concat(P.words.map(w => c => wordHit(c, w))).concat(P.phrases.map(ph => c => wordHit(c, ph)));
  const idHits = P.ids.length ? base.filter(c => P.ids.includes(c.i)) : [];
  if (!soft.length) {
    const rest = P.ids.length ? [] : base;
    return { best: idHits.concat(rest), related: [], read: P.read, parsed: P };
  }
  const best = [], related = [];
  for (const c of base) {
    if (idHits.includes(c)) continue;
    let n = 0;
    for (const f of soft) if (f(c)) n++;
    if (n === soft.length) best.push(c);
    else if (n > 0 && soft.length > 1) related.push([n, c]);
  }
  const nameScore = c => P.words.some(w => c._name.startsWith(w)) ? 0 : P.words.some(w => c._name.includes(w)) ? 1 : 2;
  best.sort((a, b) => nameScore(a) - nameScore(b) || (opts.order ? opts.order(a, b) : 0));
  related.sort((a, b) => b[0] - a[0] || (opts.order ? opts.order(a[1], b[1]) : 0));
  return { best: idHits.concat(best), related: related.slice(0, 80).map(x => x[1]), read: P.read, parsed: P };
}
