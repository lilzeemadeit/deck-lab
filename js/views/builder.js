// Deck Builder: narrow "add cards" column, wide deck area with List · Stats · Ideas.
import { DB, esc, tile, COLORS, SOLID, CAT } from "../data.js";
import { search } from "../search.js";
import { S } from "../store.js";
import { U, IC } from "../ui.js";
import { lockInfo, fitsColors, fitScore, glance, ABIL, deckIssues, searcherHits, searcherLabel, resources, needHave } from "../rules.js";
import { currentDeck, readChips } from "./cards.js";

const CORD = COLORS;
const entriesOf = deck => Object.entries(deck.cards).filter(([, n]) => n > 0);
export const deckTotal = deck => Object.values(deck.cards).reduce((a, b) => a + b, 0);

// ---------- no deck open: choose a leader ----------
function leaderPicker() {
  const leaders = DB.cards.filter(c => c.c === "L");
  const R = search(leaders, U.leaderQ, {}, []);
  return `<main class="wrap"><section class="glass" style="padding:20px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px"><span class="pagename">Pick a leader for a new deck</span>
      <div class="field searchbox" style="flex:1 1 300px">${IC.search}<label class="sr" for="lq">Search leaders</label><input id="lq" type="search" value="${esc(U.leaderQ)}" placeholder="Search leaders by name, color or type" data-input="leaderQ"></div>
      <button class="btn btn-soft" data-act="import">Import a decklist</button>
      ${S.decks.length ? `<a class="btn btn-soft" href="#/decks">Open a saved deck</a>` : ""}</div>
    <div class="grid-cards">${R.best.map(c => `<button class="cbtn" data-act="new-deck" data-id="${c.i}">${tile(c)}<span class="cname">${esc(c.n)}</span><span class="cmeta"><span>${c.i}</span><span>${c.co.join("/")}</span></span></button>`).join("")}</div>
  </section></main>`;
}

// ---------- the add-cards column ----------
function poolList(deck, L) {
  let pool = DB.cards.concat(U.psp ? DB.spoilers : []).filter(c => c.c !== "L");
  const extra = U.pLeaderOnly ? (c => fitsColors(c, L)) : null;
  const R = search(pool, U.pq, U.PF || {}, U.pReadOff || [], { extra });
  let list = R.best.concat(R.related);
  if (U.pSort === "cost") list.sort((a, b) => (a.k ?? 99) - (b.k ?? 99) || a.n.localeCompare(b.n));
  else if (U.pSort === "color") list.sort((a, b) => CORD.indexOf(a.co[0]) - CORD.indexOf(b.co[0]) || (a.k ?? 99) - (b.k ?? 99));
  else list.sort((a, b) => fitScore(b, L) - fitScore(a, L) || (a.k ?? 99) - (b.k ?? 99));
  return { list, R };
}

function poolColumn(deck, L) {
  const { list, R } = poolList(deck, L);
  const shown = list.slice(0, U.pShown);
  return `<section class="glass pool" aria-label="Add cards">
    <div class="field searchbox">${IC.search}<label class="sr" for="pq">Search cards to add</label>
      <input id="pq" type="search" value="${esc(U.pq)}" placeholder="Search to add…" data-input="pq" autocomplete="off">
      <button class="pill ${U.psp ? "on" : ""}" style="padding:5px 10px" data-act="psp" aria-pressed="${U.psp}">+ Spoilers</button></div>
    ${readChips(R.read, U.pReadOff || [], "pread-off")}
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      <button class="pill ${U.pLeaderOnly ? "blue" : ""}" data-act="p-leader" aria-pressed="${U.pLeaderOnly}">${L.co.map(c => `<span class="dot" style="background:${SOLID[c]}"></span>`).join("")}Leader locked${U.pLeaderOnly ? "" : ": off"}</button>
      <div class="seg round" role="group" aria-label="Sort"><span style="font-size:13px;font-weight:800;padding:0 4px 0 6px;align-self:center">Sort</span>${[["cost", "Cost"], ["color", "Color"], ["fit", "Best fit"]].map(([k, l]) => `<button class="${U.pSort === k ? "on" : ""}" data-act="p-sort" data-k="${k}">${l}</button>`).join("")}</div>
      <button class="pill ${U.pFade ? "" : ""}" data-act="p-fade" aria-pressed="${U.pFade}">Fade leader-locked: ${U.pFade ? "on" : "off"}</button>
    </div>
    <span class="muted" style="font-size:12.5px;font-weight:700">${list.length.toLocaleString()} cards · tap one to preview it in your counts</span>
    <div class="grid3">${shown.map(c => {
      const lk = lockInfo(c, L); const n = deck.cards[c.i] || 0;
      const op = U.pFade ? (lk.state === "full" ? 0.42 : lk.state === "partial" ? 0.62 : 1) : 1;
      const badge = lk.state === "full" || lk.state === "partial" ? `<span class="lock" title="${esc((lk.state === "full" ? "Needs " : "Part of it needs ") + lk.need)}">${IC.lock}${lk.state === "full" ? "Leader-locked" : "Partly locked"}</span>` : "";
      return `<div style="display:flex;flex-direction:column;gap:5px;opacity:${op}">
        <button class="cbtn ${U.preview === c.i ? "sel" : ""}" data-act="preview" data-id="${c.i}" aria-label="Preview ${esc(c.n)}">${tile(c, { extra: badge + (n ? `<span class="badge-n" style="min-width:26px;height:26px;font-size:13px">×${n}</span>` : "") + (c.up ? `<span class="upc">UPCOMING</span>` : "") })}</button>
        <span class="cname" title="${esc(c.n)}">${esc(c.n)}</span>
        <div style="display:flex;gap:4px"><button class="btn btn-soft btn-xs" style="flex:1" data-act="deck-add" data-id="${c.i}">+ Add</button><button class="btn btn-soft btn-xs" data-act="detail" data-id="${c.i}" aria-label="Details for ${esc(c.n)}">i</button></div></div>`;
    }).join("")}</div>
    ${list.length > shown.length ? `<button class="btn btn-soft btn-sm" style="align-self:center" data-act="p-more">Show more</button>` : ""}
  </section>`;
}

// ---------- counts panel ----------
function chipRow(label, items) {
  return `<div class="rowl"><span class="label">${label}</span><div style="display:flex;flex-wrap:wrap;gap:6px">${items.map(x =>
    `<span class="chipc ${x.n || x.d ? "" : "zero"} ${x.d ? "d" : ""}">${x.dot ? `<span class="dot" style="background:${x.dot}"></span>` : ""}<span>${esc(x.k)}</span><b>${x.n}</b>${x.d ? `<span class="delta">${x.d > 0 ? "+" : ""}${x.d}</span>` : ""}</span>`).join("")}</div></div>`;
}
function previewAdd(deck) {
  const c = DB.byId[U.preview]; if (!c || c.c === "L") return null;
  const have = deck.cards[c.i] || 0; const add = c.any ? 2 : Math.min(2, 4 - have);
  return add > 0 ? { c, add } : null;
}
function glancePanel(deck) {
  const ents = entriesOf(deck); const g = glance(ents);
  const pv = previewAdd(deck);
  const g2 = pv ? glance(ents.concat([[pv.c.i, pv.add]])) : null;
  const item = (map, map2, k, label, extra) => { const n = map[k] || 0; const d = g2 ? (map2[k] || 0) - n : 0; return Object.assign({ k: label || k, n, d }, extra || {}); };
  const keys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"];
  const max = Math.max(1, ...keys.map(k => Math.max(g.cost[k] || 0, g2 ? g2.cost[k] || 0 : 0)));
  const bars = keys.map(k => { const n = g.cost[k] || 0; const d = g2 ? Math.max((g2.cost[k] || 0) - n, 0) : 0;
    return `<div class="b" title="Cost ${k}: ${n} cards"><span class="v" style="color:${d ? "var(--ink2)" : "var(--ink)"}">${n || ""}${d ? ` +${d}` : ""}</span>${d ? `<span class="ghost" style="height:${Math.round(80 * d / max)}%"></span>` : ""}<span class="bar" style="height:${Math.round(80 * n / max)}%;${d ? "border-radius:0" : ""}"></span></div>`; }).join("");
  const colors = CORD.filter(k => g.color[k] || (g2 && g2.color[k])).map(k => item(g.color, g2 && g2.color, k, null, { dot: SOLID[k] }));
  const abil = ABIL.map(([name]) => item(g.abil, g2 && g2.abil, name, name === "Trigger" ? "[Trigger]" : name));
  const tkeys = Object.keys(Object.assign({}, g.type, g2 ? g2.type : {})).sort((a, b) => (g.type[b] || 0) - (g.type[a] || 0));
  const types = tkeys.map(k => item(g.type, g2 && g2.type, k));
  return `<div class="glass glance">
    <div class="rowl" style="align-items:end"><span class="label" style="padding-bottom:26px">Cost</span><div style="display:flex;flex-direction:column;gap:6px"><div class="bars">${bars}</div><div class="barlabels">${keys.map(k => `<span>${k}</span>`).join("")}</div></div></div>
    ${colors.length ? chipRow("Color", colors) : ""}
    ${chipRow("Abilities", abil)}
    ${types.length ? chipRow("Types", types) : ""}
    ${pv ? `<div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;border-top:1px dashed var(--field-bd);padding-top:10px"><span class="delta">+${pv.add}</span>Blue numbers show what adding ${pv.add} ${esc(pv.c.n)} would change<button class="linkbtn" style="margin-left:auto" data-act="preview-clear">Clear</button></div>` : ""}
  </div>`;
}

function trackPanel(deck) {
  const total = deckTotal(deck);
  let have = 0; for (const [id, n] of entriesOf(deck)) have += Math.min(S.owned[id] || 0, n);
  return `<div class="glass" style="padding:14px;display:flex;flex-direction:column;gap:10px;background:linear-gradient(180deg,rgba(255,250,232,0.92),rgba(255,240,200,0.8))">
    <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><span style="font-size:16px;font-weight:900">You have ${have} of ${total}</span><span style="font-size:14px;font-weight:800;color:var(--gold-ink)">· ${total - have} to buy</span><a href="#/buy" style="margin-left:auto;font-size:14px;font-weight:800;color:var(--gold-ink)">Open Buy List →</a></div>
    <div class="goldbar"><div style="width:${total ? Math.round(100 * have / total) : 0}%"></div></div>
    <span style="font-size:13px;font-weight:600;color:#5C3D00">Tap the boxes to mark copies you own. Your copies count for every deck.</span></div>`;
}

function deckGrid(deck) {
  const ents = entriesOf(deck).map(([id, n]) => [DB.byId[id], n]).filter(x => x[0]);
  if (!ents.length) return `<div class="glass empty">Your deck is empty. Search on the left and tap “+ Add”.</div>`;
  const groups = [["C", "Characters"], ["E", "Events"], ["S", "Stages"]].map(([k, l]) => [l, ents.filter(([c]) => c.c === k).sort((a, b) => (a[0].k ?? 99) - (b[0].k ?? 99) || a[0].n.localeCompare(b[0].n))]).filter(g => g[1].length);
  return `<div class="glass" style="padding:8px 18px 18px">${groups.map(([label, list]) => `
    <div style="display:flex;justify-content:space-between;padding:14px 0 10px;margin-bottom:12px;border-bottom:1.5px solid rgba(110,175,235,0.35)"><span class="label">${label}</span><span style="font-size:14px;font-weight:900">${list.reduce((a, x) => a + x[1], 0)}</span></div>
    <div class="deckgrid">${list.map(([c, n]) => {
      const own = Math.min(S.owned[c.i] || 0, n); const need = Math.max(n - (S.owned[c.i] || 0), 0);
      const tag = deck.track ? `<span class="tag" style="background:${need ? "#FFF1D0" : "#D6F5E4"};color:${need ? "#7A4F00" : "#1F7A4C"}">${need ? "Buy " + need : "✓ Got all"}</span>` : "";
      return `<div style="display:flex;flex-direction:column;gap:6px">
        <button class="cbtn" data-act="detail" data-id="${c.i}" aria-label="${esc(c.n)} details">${tile(c, { extra: `<span class="badge-n">×${n}</span>` + tag })}</button>
        <span class="cname" title="${esc(c.n)}">${esc(c.n)}</span>
        ${deck.track ? `<div class="pips"><span class="muted" style="font-size:11.5px;font-weight:700;margin-right:2px">Have</span>${Array.from({ length: n }, (_, i) => `<button class="pip ${i < own ? "on" : ""}" data-act="own" data-id="${c.i}" data-n="${i + 1}" aria-label="Own ${i + 1}"></button>`).join("")}</div>` : ""}
        <div class="stepper" style="justify-content:space-between"><button data-act="deck-dec" data-id="${c.i}" aria-label="Remove one ${esc(c.n)}">−</button><span>${n}</span><button data-act="deck-add" data-id="${c.i}" aria-label="Add one ${esc(c.n)}">+</button></div></div>`;
    }).join("")}</div>`).join("")}</div>`;
}

// ---------- Stats tab ----------
function statsTab(deck) {
  const ents = entriesOf(deck); const N = deckTotal(deck) || 1;
  const sel = U.statSel;
  const test = (c, s) => {
    if (!s) return true;
    const [kind, k] = s;
    if (kind === "cost") return (c.k >= 10 ? "10+" : String(c.k)) === k;
    if (kind === "color") return c.co.includes(k);
    if (kind === "cat") return c.c === k;
    if (kind === "type") return c.t.includes(k);
    if (kind === "abil") return ABIL.find(a => a[0] === k)[1](c);
    if (kind === "counter") return c.c === "C" && String(c.ct || 0) === k;
    if (kind === "power") return c.c === "C" && String(c.p) === k;
    if (kind === "attr") return (c.a || []).includes(k);
    return true;
  };
  const count = s => ents.reduce((a, [id, n]) => a + (test(DB.byId[id], s) ? n : 0), 0);
  const isSel = s => sel && sel[0] === s[0] && sel[1] === s[1];
  const rows = (kind, keys, label = k => k) => {
    const list = keys.map(k => [k, count([kind, k])]).filter(x => x[1]);
    const max = Math.max(1, ...list.map(x => x[1]));
    return list.map(([k, n]) => `<button class="listrow ${isSel([kind, k]) ? "sel" : ""}" data-act="stat" data-kind="${kind}" data-k="${esc(k)}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(k))}</span><span class="track"><span style="width:${Math.round(100 * n / max)}%"></span></span><span class="n">${n}</span></button>`).join("");
  };
  const uniq = f => [...new Set(ents.flatMap(([id]) => f(DB.byId[id])))];
  const costKeys = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"]; const cmax = Math.max(1, ...costKeys.map(k => count(["cost", k])));
  const trig = count(["abil", "Trigger"]); const ctr = ents.reduce((a, [id, n]) => a + (DB.byId[id].ct || 0) * n, 0);
  const tile6 = (label, val, sub, s) => `<button class="glass" style="text-align:left;padding:16px 18px;display:flex;flex-direction:column;gap:2px;cursor:pointer;${s && isSel(s) ? "outline:3px solid var(--gold);outline-offset:3px" : ""}" ${s ? `data-act="stat" data-kind="${s[0]}" data-k="${s[1]}"` : ""}><span class="muted" style="font-size:14px;font-weight:700">${label}</span><span style="font-size:34px;font-weight:900;line-height:1.1">${val}</span><span class="muted" style="font-size:12.5px;font-weight:600">${sub}</span></button>`;
  const strip = ents.map(([id, n]) => [DB.byId[id], n]).sort((a, b) => (a[0].k ?? 99) - (b[0].k ?? 99));
  const selCount = sel ? count(sel) : N;
  return `<section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px">
      ${tile6("Characters", count(["cat", "C"]), "of " + N, ["cat", "C"])}${tile6("Events", count(["cat", "E"]), "Stages " + count(["cat", "S"]), ["cat", "E"])}
      ${tile6("Triggers", trig, Math.round(100 * trig / N) + "% of deck", ["abil", "Trigger"])}${tile6("Blockers", count(["abil", "Blocker"]), "with [Blocker]", ["abil", "Blocker"])}
      ${tile6("Rush", count(["abil", "Rush"]), "can attack right away", ["abil", "Rush"])}${tile6("Counter total", ctr.toLocaleString(), "+2000s: " + count(["counter", "2000"]), null)}</section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;align-items:start">
      <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px"><h2 class="h2">Cost</h2>
        <div class="bars" style="height:170px">${costKeys.map(k => { const n = count(["cost", k]); return `<button class="b ${isSel(["cost", k]) ? "sel" : ""}" style="all:unset;cursor:pointer;flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px" data-act="stat" data-kind="cost" data-k="${k}" aria-label="Cost ${k}: ${n}"><span class="v">${n || ""}</span><span class="bar" style="height:${Math.round(85 * n / cmax)}%;width:100%;min-height:2px;border-radius:6px 6px 0 0;background:${isSel(["cost", k]) ? "linear-gradient(180deg,#FFE38A,#E8AE2E)" : "linear-gradient(180deg,#86CBFF,#3483DE)"}"></span></button>`; }).join("")}</div>
        <div class="barlabels">${costKeys.map(k => `<span>${k}</span>`).join("")}</div>
        <h2 class="h2" style="margin-top:8px">Colors</h2>${rows("color", CORD)}
        <h2 class="h2" style="margin-top:8px">Card kinds</h2>${rows("cat", ["C", "E", "S"], k => CAT[k])}</section>
      <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:6px"><h2 class="h2" style="margin-bottom:4px">Abilities</h2>${rows("abil", ABIL.map(a => a[0]))}
        <h2 class="h2" style="margin:10px 0 4px">Types</h2>${rows("type", uniq(c => c.t).sort((a, b) => count(["type", b]) - count(["type", a])))}</section>
      <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:6px"><h2 class="h2" style="margin-bottom:4px">Counter</h2>${rows("counter", ["0", "1000", "2000"], k => k === "0" ? "None" : "+" + k)}
        <h2 class="h2" style="margin:10px 0 4px">Power</h2>${rows("power", uniq(c => c.c === "C" && c.p != null ? [String(c.p)] : []).sort((a, b) => a - b))}
        <h2 class="h2" style="margin:10px 0 4px">Attribute</h2>${rows("attr", uniq(c => c.a || []))}</section>
    </div>
    <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 class="h2">${sel ? esc(sel[2] || sel[1]) + " · " + selCount + " cards" : "Your deck · " + N + " cards"}</h2><span class="muted" style="font-size:13.5px;font-weight:700">${sel ? "matching cards are lit up" : "tap any number above to see which cards it counts"}</span>${sel ? `<button class="linkbtn" style="margin-left:auto" data-act="stat-clear">Show all</button>` : ""}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:14px">${strip.map(([c, n]) => `<div style="opacity:${test(c, sel) ? 1 : 0.2}">${tile(c, { extra: `<span class="badge-n" style="min-width:26px;height:26px;font-size:13px">×${n}</span>` })}<span class="cname" style="font-size:12.5px;display:block;margin-top:4px">${esc(c.n)}</span></div>`).join("")}</div>
    </section>`;
}

// ---------- Ideas tab ----------
function ideasTab(deck, L) {
  const ents = entriesOf(deck); const r = resources(ents);
  const rich = [["trig", "[Trigger]", r.trig], ["event", "Events", r.event]].concat(Object.entries(r.type).filter(([, n]) => n >= 6).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, n]) => ["type:" + t, t, n])).filter(x => x[2] > 0);
  const pick = U.ideaPick;
  const inColors = DB.cards.filter(c => c.c !== "L" && fitsColors(c, L));
  const pickOk = (c, kind) => {
    if (!pick) return true;
    if (kind === "sr") return c.sr.alts.some(f => pick === "trig" ? f.tr : pick === "event" ? f.c === "E" : pick.startsWith("type:") && f.t && f.t.some(t => pick.slice(5).includes(t) || t.includes(pick.slice(5))));
    return c.nd.some(n => (pick === "trig" && n[0] === "trig") || (pick === "event" && n[0] === "event") || (pick.startsWith("type:") && n[0] === "type" && n[1] === pick.slice(5)));
  };
  const searchers = inColors.filter(c => c.sr).map(c => [c, searcherHits(c, ents)]).filter(([c, h]) => h >= U.minHits && pickOk(c, "sr")).sort((a, b) => b[1] - a[1]);
  const hidden = inColors.filter(c => c.sr).length - searchers.length;
  const N = deckTotal(deck) || 1;
  const pay = inColors.filter(c => c.nd).map(c => { const best = c.nd.map(n => needHave(n, r)).sort((a, b) => b[1] - a[1])[0]; return [c, best]; })
    .filter(([c, b]) => b[1] >= 8 && pickOk(c, "nd")).sort((a, b) => b[1][1] - a[1][1]).slice(0, 30);
  const row = (c, inner) => { const lk = lockInfo(c, L); const n = deck.cards[c.i] || 0;
    return `<div style="display:flex;gap:14px;align-items:center;padding:10px 0;border-top:1px solid rgba(110,175,235,0.3);opacity:${lk.state === "full" ? 0.5 : lk.state === "partial" ? 0.7 : 1}">
      <button class="cbtn" style="width:56px;flex:none" data-act="detail" data-id="${c.i}" aria-label="${esc(c.n)} details">${tile(c)}</button>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:16px;font-weight:900;color:var(--ink2)">${esc(c.n)}</span><span class="muted" style="font-size:12.5px;font-weight:700">${c.i} · ${CAT[c.c]} · cost ${c.k ?? "–"}</span>
        ${n ? `<span style="font-size:11.5px;font-weight:900;background:#D6F5E4;color:#1F7A4C;border-radius:6px;padding:2px 7px">IN DECK ×${n}</span>` : ""}
        ${lk.state === "full" || lk.state === "partial" ? `<span style="font-size:11.5px;font-weight:900;background:#1B3461;color:#FFF;border-radius:6px;padding:2px 7px">${lk.state === "full" ? "LEADER-LOCKED" : "PARTLY LOCKED"}</span>` : ""}</div>
        ${inner}</div>
      <button class="btn btn-soft btn-sm" data-act="deck-add" data-id="${c.i}">+ Add</button></div>`; };
  return `<section class="glass" style="padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;gap:10px">
      <span class="label" style="margin-right:6px">Your deck is rich in</span>
      ${rich.map(([k, l, n]) => `<button class="pill ${pick === k ? "on" : ""}" data-act="idea-pick" data-k="${esc(k)}" aria-pressed="${pick === k}">${esc(l)} <b>${n}</b></button>`).join("") || `<span class="muted">Add some cards first.</span>`}
      <span class="muted" style="margin-left:auto;font-size:13px;font-weight:600">Lists only — nothing here is a rating.</span></section>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:18px;align-items:start">
      <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 class="h2">Searchers that find your cards</h2><span class="muted" style="font-size:13.5px;font-weight:700">in your colors · most hits first</span></div>
        <div style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700">Only show if it hits at least <span class="stepper"><button data-act="min-hits" data-d="-2" aria-label="Lower">−</button><span>${U.minHits}</span><button data-act="min-hits" data-d="2" aria-label="Raise">+</button></span> cards</div>
        ${searchers.map(([c, h]) => row(c, `<span style="font-size:13.5px;font-weight:600">${searcherLabel(c.sr)} · <b>${esc(c.sr.txt.replace(/[{}]/g, ""))}</b></span>
          <div style="display:flex;align-items:center;gap:10px"><span style="flex:1;max-width:240px;height:10px;background:rgba(255,255,255,0.9);border:1px solid #CCE3FA;border-radius:999px;overflow:hidden"><span style="display:block;height:100%;width:${Math.round(100 * h / N)}%;background:linear-gradient(180deg,#86CBFF,#3483DE)"></span></span><span style="font-size:14px;font-weight:900">Hits ${h} of ${N}</span></div>`)).join("") || `<div class="empty">No searchers in your colors hit ${U.minHits}+ of your cards.</div>`}
        <span class="muted" style="font-size:13px;font-weight:600">${hidden} more searchers hit fewer cards. Lower the number to see them.</span></section>
      <section class="glass" style="padding:18px 20px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 class="h2">Cards that use what you have</h2><span class="muted" style="font-size:13.5px;font-weight:700">any archetype · in your colors</span></div>
        ${pay.map(([c, b]) => row(c, `<span style="font-size:13.5px;font-weight:600">Needs <b>${esc(b[0])}</b> · you run <b>${b[1]}</b></span><span class="muted" style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.e.slice(0, 120))}</span>`)).join("") || `<div class="empty">Nothing yet — these show up once your deck has 8+ of something they use.</div>`}
      </section></div>`;
}

export function builderView() {
  const deck = currentDeck();
  if (!deck) return leaderPicker();
  const L = DB.byId[deck.leader];
  const total = deckTotal(deck); const issues = deckIssues(deck).filter(x => !/\/50 cards/.test(x));
  const sub = U.sub || "list";
  return `<main class="wrap">
    <section class="glass deckhead" aria-label="Deck">
      <a href="#/decks" style="font-size:14.5px;font-weight:800;text-decoration:none">‹ Decks</a>
      <button class="cbtn" style="width:46px" data-act="detail" data-id="${L.i}" aria-label="Leader ${esc(L.n)}">${tile(L, { noTrig: true })}</button>
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <label class="sr" for="dn">Deck name</label><input id="dn" class="name" value="${esc(deck.name)}" data-change="deck-name">
        <span class="muted" style="font-size:14px;font-weight:700">${esc(L.n)} · ${L.i} · ${L.co.join(" / ")}</span></div>
      <span style="font-size:30px;font-weight:900;margin-left:6px;${total > 50 ? "color:#C0392B" : ""}">${total}<span class="muted" style="font-size:16px"> / 50</span></span>
      <div style="margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:12px">
        <div class="trackbox ${deck.track ? "on" : ""}"><button class="switch ${deck.track ? "on" : ""}" role="switch" aria-checked="${!!deck.track}" aria-label="Track my copies" data-act="track"><span></span></button>
          <span style="display:flex;flex-direction:column"><span style="font-size:14.5px;font-weight:800">Track my copies</span><span class="muted" style="font-size:12.5px;font-weight:600">Optional · fills your Buy List</span></span></div>
        <button class="btn btn-soft" data-act="import" data-into="${deck.id}">Import</button>
        <div class="rel"><button class="btn btn-soft" data-act="menu" data-k="export" aria-expanded="${U.menu === "export"}">Export ${IC.caret}</button>
          ${U.menu === "export" ? `<div class="glass popmenu" style="left:auto;right:0" data-stop="1"><button class="opt" data-act="export-deck" data-f="sim">Copy for deck sites / sims (4xOP01-016)</button><button class="opt" data-act="export-deck" data-f="text">Copy as plain text</button>${U.undoImport && U.undoImport.id === deck.id ? `<button class="opt" data-act="undo-import">Undo the last import</button>` : ""}<button class="opt" data-act="dup-deck">Duplicate deck</button><button class="opt" data-act="del-deck" style="color:#B8473F">Delete deck…</button></div>` : ""}</div>
      </div>
    </section>
    ${total > 50 ? `<div class="warn" role="status" style="display:flex;align-items:center;gap:10px;background:rgba(253,226,222,0.95);border-color:#E9877B;color:#8A2A1F"><b style="font-size:18px">${total} cards</b><span>That's ${total - 50} over. Tournament decks need exactly 50, so take out ${total - 50} before you play it.</span></div>` : ""}
    ${issues.length ? `<div class="warn">Heads up: ${issues.slice(0, 4).map(esc).join(" · ")}${issues.length > 4 ? ` · +${issues.length - 4} more` : ""}</div>` : ""}
    <div class="row">
      ${poolColumn(deck, L)}
      <section class="deckside" aria-label="Your deck">
        <nav class="field subtabs" aria-label="Deck views">${[["list", "List", "#/builder"], ["stats", "Stats", "#/builder/stats"], ["ideas", `Ideas <span class="beta">BETA</span>`, "#/builder/ideas"]].map(([k, l, h]) => `<a href="${h}" class="${sub === k ? "on" : ""}">${l}</a>`).join("")}</nav>
        ${sub === "stats" ? statsTab(deck) : sub === "ideas" ? ideasTab(deck, L) : glancePanel(deck) + (deck.track ? trackPanel(deck) : "") + deckGrid(deck)}
      </section>
    </div></main>`;
}
