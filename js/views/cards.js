// Cards tab: search everything, + Spoilers, card detail panel.
import { DB, esc, tile, COLORS, CAT } from "../data.js";
import { search } from "../search.js";
import { S } from "../store.js";
import { U, IC, cardDetail, menuChip } from "../ui.js";

export function currentDeck() { return S.decks.find(d => d.id === U.deckId) || null; }

function grid(list, sel) {
  return `<div class="grid-cards">${list.map(c => `<button class="cbtn ${sel === c.i ? "sel" : ""}" data-act="pick" data-id="${c.i}" aria-label="Open ${esc(c.n)}">
    ${tile(c, { extra: c.up ? `<span class="upc">UPCOMING</span>` : "" })}
    <span class="cname">${esc(c.n)}</span><span class="cmeta"><span>${c.i} · ${c.r}</span><span>${CAT[c.c]}</span></span></button>`).join("")}</div>`;
}

export function filterChips(F, prefix = "") {
  const sets = (DB.meta.sets || []).slice().reverse().map(s => [s, s]);
  return `<div style="display:flex;flex-wrap:wrap;gap:8px" data-stop="0">
    ${menuChip(prefix + "colors", "Color", COLORS.map(c => [c, c]), F.colors)}
    ${prefix ? "" : menuChip(prefix + "cats", "Category", [["L", "Leader"], ["C", "Character"], ["E", "Event"], ["S", "Stage"]], F.cats)}
    ${menuChip(prefix + "costs", "Cost", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, n === 10 ? "10+" : String(n)]), F.costs)}
    ${menuChip(prefix + "counters", "Counter", [[0, "None"], [1000, "+1000"], [2000, "+2000"]], F.counters)}
    ${menuChip(prefix + "tags", "Keyword", [["trigger", "Trigger"], ["blocker", "Blocker"], ["rush", "Rush"], ["double", "Double Attack"], ["banish", "Banish"], ["unblock", "Unblockable"], ["counter_ev", "[Counter] event"], ["onplay", "On Play"], ["whenatk", "When Attacking"], ["onko", "On K.O."], ["actmain", "Activate: Main"], ["draw", "Draw"], ["search", "Look / search"], ["ko", "K.O."], ["rest", "Rests opponent"], ["powdown", "Reduce power"], ["bounce", "Return to hand"], ["play", "Play from hand/trash/deck"], ["trash", "Uses trash"], ["life", "Life"]], F.tags)}
    ${menuChip(prefix + "sets", "Set", sets, F.sets)}
    ${menuChip(prefix + "rar", "Rarity", ["L", "C", "UC", "R", "SR", "SEC", "SP", "P"].map(r => [r, r]), F.rar)}
    <button class="pill ${F.std ? "on" : ""}" data-act="toggle-std" data-p="${prefix}" aria-pressed="${!!F.std}">Standard legal only</button>
  </div>`;
}

export function readChips(read, off, act = "read-off") {
  if (!read.length && !off.length) return "";
  return `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
    <span class="muted" style="font-size:13.5px;font-weight:700">Read as</span>
    ${read.map(r => `<button class="pill on" data-act="${act}" data-w="${esc(r.word)}" title="Search the word instead">${esc(r.label)} ×</button>`).join("")}
    ${off.map(w => `<button class="pill" data-act="${act}-undo" data-w="${esc(w)}" title="Read it as a filter again">"${esc(w)}" as text ↺</button>`).join("")}
    <span class="muted" style="font-size:13px">· Wrong guess? Tap a chip, or put words in "quotes" for exact text.</span></div>`;
}

export function cardsView() {
  const pool = DB.cards.concat(U.spoilers ? DB.spoilers : []);
  const R = search(pool, U.q, U.F, U.readOff);
  const upcoming = U.spoilers ? R.best.filter(c => c.up) : [];
  const best = R.best.filter(c => !c.up);
  const sel = DB.byId[U.sel] || null;
  const shown = best.slice(0, U.cardsShown);
  return `<main class="wrap">
  <section class="glass" style="padding:16px 18px;display:flex;flex-direction:column;gap:12px" aria-label="Search">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px">
      <span class="pagename">Cards</span>
      <div class="field searchbox" style="flex:1 1 360px">${IC.search}
        <label for="q" class="sr">Search cards</label>
        <input id="q" type="search" value="${esc(U.q)}" placeholder='Try: revolutionary trigger · "on play" · cost<=3 · t:minks' data-input="q" autocomplete="off">
        <div class="seg" role="group" aria-label="Which cards"><button class="${!U.spoilers ? "on" : ""}" data-act="spoilers" data-v="0">Released</button><button class="${U.spoilers ? "on gold" : ""}" data-act="spoilers" data-v="1">+ Spoilers</button></div>
      </div>
      <span class="muted" style="font-size:14px;font-weight:700">${DB.cards.length.toLocaleString()} cards · through ${esc(DB.meta.through || "")}</span>
    </div>
    ${readChips(R.read, U.readOff)}
    ${filterChips(U.F)}
    <div class="muted" style="display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;border-top:1px dashed var(--field-bd);padding-top:10px">
      <b style="color:var(--ink)">Search tips</b><span><code>"on play"</code> exact words</span><span><code>t:minks</code> type</span><span><code>cost&lt;=3</code> / <code>power&gt;=6000</code></span><span><code>has:trigger</code> keyword</span><span><code>set:op05</code></span><span><code>-event</code> leave out</span></div>
  </section>
  <div class="row">
    <section class="glass" style="flex:999 1 620px;min-width:0;padding:20px;display:flex;flex-direction:column;gap:16px" aria-label="Results">
      ${U.spoilers ? `<div style="display:flex;flex-direction:column;gap:12px;border:2px dashed var(--gold);border-radius:16px;padding:14px;background:rgba(255,246,214,0.55)">
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 class="h2">Upcoming · ${upcoming.length}</h2><span class="muted" style="font-size:13.5px">Revealed, not released yet.</span></div>
        ${upcoming.length ? grid(upcoming, U.sel) : `<span class="muted" style="font-size:14px;font-weight:700">No spoilers loaded yet. They're added to data/spoilers.json as sets are revealed.</span>`}</div>` : ""}
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 class="h2">${U.q.trim() ? "Best matches" : "All cards"} · ${best.length.toLocaleString()}</h2>
        ${R.read.length || R.parsed.words.length ? `<span class="muted" style="font-size:13.5px">match everything you typed</span>` : ""}</div>
      ${best.length ? grid(shown, U.sel) : `<div class="empty">No cards match all of that.${R.related.length ? " Some partial matches are below." : ""}</div>`}
      ${best.length > shown.length ? `<button class="btn btn-soft" style="align-self:center" data-act="more-cards">Show more (${(best.length - shown.length).toLocaleString()} left)</button>` : ""}
      ${R.related.length ? `<div class="divider"><span class="muted" style="font-size:13.5px;font-weight:800">Also related · ${R.related.length} — match some of what you typed</span></div>${grid(R.related, U.sel)}` : ""}
    </section>
    <aside class="glass aside" aria-label="Card details">${cardDetail(sel, { deck: currentDeck() })}</aside>
  </div></main>`;
}
