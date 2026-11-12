// Decks, Buy List (+ printable sheet), Wishlist, and the public shared wishlist page.
import { DB, esc, tile, SOLID, price, money, tcgUrl, priceAsOf } from "../data.js";
import { S, sync } from "../store.js";
import { U, IC } from "../ui.js";
import { deckTotal } from "./builder.js";

// ---------------- Decks ----------------
export function decksView() {
  const decks = S.decks.slice().sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const f = U.deckFilter || "recent";
  const list = decks.filter(d => f === "fav" ? d.fav : f === "done" ? deckTotal(d) === 50 : true);
  return `<main class="wrap">
    <section class="glass toolbar"><span class="pagename">Decks</span>
      <div class="seg" role="group" aria-label="Show">${[["recent", "Recent"], ["fav", "☆ Favorites"], ["done", "✓ Complete"]].map(([k, l]) => `<button class="${f === k ? "on" : ""}" data-act="deck-filter" data-k="${k}">${l}</button>`).join("")}</div>
      <button class="btn btn-soft" style="margin-left:auto" data-act="import">Import decklist</button>
      <a class="btn btn-blue" href="#/builder" data-act="new-deck-start">+ New deck</a></section>
    ${list.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px">${list.map(d => {
      const L = DB.byId[d.leader]; if (!L) return "";
      const n = deckTotal(d); let have = 0; for (const [id, c] of Object.entries(d.cards)) have += Math.min(S.owned[id] || 0, c);
      return `<div class="glass" style="padding:18px;display:flex;gap:16px;position:relative">
        <a href="#/builder" data-act="open-deck" data-id="${d.id}" style="width:104px;flex:none">${tile(L, { noTrig: true })}</a>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
          <a href="#/builder" data-act="open-deck" data-id="${d.id}" style="font-size:20px;font-weight:900;color:var(--ink2);text-decoration:none">${esc(d.name)}</a>
          <span class="muted" style="font-size:14px;font-weight:700">${esc(L.n)} · ${L.i}</span>
          <span style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700">${L.co.map(c => `<span class="dot" style="background:${SOLID[c]}"></span>`).join("")}${L.co.join(" / ")}</span>
          <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px">
            <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800"><span>${n} / 50</span><span class="muted" style="font-weight:700">${new Date(d.updated || d.created).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
            <div class="progress" style="height:10px"><div style="width:${Math.min(100, Math.round(100 * n / 50))}%;background:linear-gradient(180deg,#6CB3FF,#2A6CD3)"></div></div>
            ${d.track ? `<span style="align-self:flex-start;font-size:12.5px;font-weight:800;color:var(--gold-ink);background:linear-gradient(180deg,#FFF6D6,#FFE7A1);border:1.5px solid var(--gold);border-radius:999px;padding:3px 10px">Tracking · ${n - have} to buy</span>` : ""}
          </div></div>
        <button class="linkbtn" style="position:absolute;right:16px;top:14px;font-size:20px" data-act="fav-deck" data-id="${d.id}" aria-label="${d.fav ? "Unfavorite" : "Favorite"}" aria-pressed="${!!d.fav}">${d.fav ? "★" : "☆"}</button>
      </div>`; }).join("")}</div>`
      : `<div class="glass empty">${S.decks.length ? "No decks here yet." : "No decks yet. Start one with + New deck, or bring one in with Import decklist."}</div>`}
  </main>`;
}

// ---------------- Buy List ----------------
export function buyData() {
  const tracked = S.decks.filter(d => d.track);
  const on = d => S.buy.decks[d.id] !== false;
  const per = {};
  for (const d of tracked) if (on(d)) for (const [id, n] of Object.entries(d.cards)) if (n > 0) (per[id] = per[id] || []).push([d, n]);
  const items = [];
  for (const [id, parts] of Object.entries(per)) {
    const want = S.buy.mode === "share" ? Math.max(...parts.map(p => p[1])) : parts.reduce((a, p) => a + p[1], 0);
    const have = S.owned[id] || 0; const need = Math.max(0, want - have);
    if (need > 0 && DB.byId[id]) items.push({ c: DB.byId[id], need, have, parts });
  }
  const ORD = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
  items.sort((a, b) => ORD.indexOf(a.c.co[0]) - ORD.indexOf(b.c.co[0]) || (a.c.k ?? 99) - (b.c.k ?? 99) || a.c.n.localeCompare(b.c.n));
  const total = items.reduce((a, x) => a + x.need, 0);
  const cost = items.reduce((a, x) => { const p = price(x.c.i); return a + (p && p.m ? p.m * x.need : 0); }, 0);
  return { tracked, on, items, total, cost };
}
function leaderName(d) { const L = DB.byId[d.leader]; return L ? L.n : d.name; }
export function exportText(B, kind) {
  if (kind === "site") return B.items.map(x => `${x.need}x${x.c.i}`).join("\n");
  return `Buy List — ${B.total} cards\n\n` + B.items.map(x => `${x.need}x ${x.c.n} (${x.c.i})`).join("\n");
}
export function buyView() {
  const B = buyData(); const asof = priceAsOf();
  return `<main class="wrap"><div class="row">
    <aside class="side" aria-label="Choose decks">
      <div class="glass" style="padding:16px;display:flex;flex-direction:column;gap:10px"><span class="label">Build from these decks</span>
        ${B.tracked.length ? B.tracked.map(d => { const L = DB.byId[d.leader]; let need = 0; for (const [id, n] of Object.entries(d.cards)) need += Math.max(0, n - (S.owned[id] || 0));
          const sw = L && L.co.length > 1 ? `linear-gradient(135deg,${SOLID[L.co[0]]} 49%,${SOLID[L.co[1]]} 51%)` : L ? SOLID[L.co[0]] : "#999";
          return `<label class="deckpick ${B.on(d) ? "on" : ""}"><input type="checkbox" ${B.on(d) ? "checked" : ""} data-change="buy-deck" data-id="${d.id}" style="width:18px;height:18px;accent-color:var(--blue)">
            <span style="width:22px;aspect-ratio:63/88;border-radius:4px;flex:none;background:${sw};border:1.5px solid #FFF"></span>
            <span style="flex:1;min-width:0;display:flex;flex-direction:column"><span style="font-size:14.5px;font-weight:800">${esc(leaderName(d))}</span><span class="muted" style="font-size:12.5px;font-weight:700">${esc(d.name)}</span></span>
            <span style="font-size:12.5px;font-weight:900;color:var(--gold-ink);background:#FFF1D0;border-radius:7px;padding:2px 7px">${need} to buy</span></label>`; }).join("")
          : `<span style="font-size:14px;font-weight:700">No decks are tracking copies yet. Open a deck and turn on <b>Track my copies</b>.</span>`}
        <span class="muted" style="font-size:12.5px;font-weight:600">Only decks with "Track my copies" on show up here.</span></div>
      <div class="glass" style="padding:16px;display:flex;flex-direction:column;gap:10px"><span class="label">When decks share a card</span>
        ${[["own", "Each deck gets its own copies", "Counts add up, so you never move cards between decks."], ["share", "Decks share my copies", "Only buy enough for the deck that needs the most."]].map(([k, t, s]) => `<button class="radio ${S.buy.mode === k ? "on" : ""}" data-act="buy-mode" data-k="${k}" aria-pressed="${S.buy.mode === k}"><i></i><span style="display:flex;flex-direction:column;gap:2px"><span style="font-size:14.5px;font-weight:800">${t}</span><span class="muted" style="font-size:12.5px;font-weight:600">${s}</span></span></button>`).join("")}</div>
    </aside>
    <section class="glass" style="flex:999 1 520px;min-width:0;padding:8px 20px 14px" aria-label="Cards to buy">
      <div style="display:flex;align-items:baseline;gap:10px;padding:14px 0;border-bottom:1.5px solid rgba(110,175,235,0.35);flex-wrap:wrap">
        <span class="pagename">Buy List</span><span style="font-size:34px;font-weight:900;color:var(--ink2);margin-left:8px">${B.total}</span><span class="muted" style="font-size:15px;font-weight:700">cards · ${B.items.length} different</span>
        <span class="muted" style="margin-left:auto;font-size:13.5px;font-weight:700">${B.cost ? `Est. ${money(B.cost)} at market${asof ? " · as of " + asof : ""}` : asof ? "" : "Prices appear after the first nightly update"}</span></div>
      ${B.items.length ? B.items.map(x => { const p = price(x.c.i);
        const br = x.parts.map(([d, n]) => `${leaderName(d)} ${n}`).join(" · ") + (x.parts.length > 1 && S.buy.mode === "share" ? " (shared)" : "") + ` · you have ${x.have}`;
        return `<div class="buyrow"><div class="need">${x.need}</div>
          <button class="cbtn" style="width:40px;flex:none" data-act="detail" data-id="${x.c.i}" aria-label="${esc(x.c.n)} details">${tile(x.c, { noTrig: true })}</button>
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:16px;font-weight:900;color:var(--ink2)">${esc(x.c.n)}</span><span class="muted" style="font-size:12.5px;font-weight:700">${x.c.i} · ${x.c.r}</span></div>
            <span style="font-size:13.5px;font-weight:600">${esc(br)}</span></div>
          <span style="flex:none;font-size:14px;font-weight:800">${p && p.m ? money(p.m) : ""}</span>
          <a class="btn btn-soft btn-sm" href="${esc(tcgUrl(x.c))}" target="_blank" rel="noopener">TCGplayer ${IC.ext}</a>
          <button class="btn btn-green btn-sm" data-act="got-one" data-id="${x.c.i}">Got 1</button></div>`; }).join("")
        : `<div class="empty">${B.tracked.length ? "Nothing to buy — you have everything for the selected decks." : "Turn on Track my copies in a deck to start a Buy List."}</div>`}
    </section>
    <aside class="glass" style="flex:1 1 300px;max-width:360px;min-width:0;padding:16px;display:flex;flex-direction:column;gap:12px" aria-label="Export">
      <span class="label">Export</span>
      <div class="seg" role="tablist" style="display:flex">${[["text", "Plain text"], ["site", "Deck sites"], ["image", "Print / PDF"]].map(([k, l]) => `<button role="tab" style="flex:1;font-size:13px" class="${U.exportTab === k ? "on" : ""}" data-act="export-tab" data-k="${k}">${l}</button>`).join("")}</div>
      ${U.exportTab === "image" ? `<span style="font-size:14px;font-weight:600">A card-show sheet with big numbers and where each card is going. Print it, or choose "Save as PDF" in the print window.</span>
          <a class="btn btn-blue" href="#/sheet">Open the sheet</a>`
        : `<pre class="field export">${esc(exportText(B, U.exportTab))}</pre><span class="muted" style="font-size:12.5px;font-weight:600">${U.exportTab === "site" ? 'Paste into deck sites and sims that read "4xOP01-016".' : "Easy to text to a friend or a vendor."}</span>
          <div style="display:flex;gap:8px"><button class="btn btn-blue" style="flex:1" data-act="copy-export">Copy</button>${navigator.share ? `<button class="btn btn-soft" style="flex:1" data-act="share-export">Share…</button>` : ""}</div>`}
    </aside></div></main>`;
}

export function sheetView() {
  const B = buyData();
  const leaders = [...new Set(B.items.flatMap(x => x.parts.map(([d]) => leaderName(d))))];
  return `<main class="wrap"><div class="noprint" style="display:flex;gap:10px"><a class="btn btn-soft" href="#/buy">‹ Buy List</a><button class="btn btn-blue" data-act="print">Print / Save PDF</button></div>
    <section class="sheet">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;border-bottom:3px solid var(--ink);padding-bottom:16px;margin-bottom:26px">
        <div><div class="label">Looking for</div><div style="font-family:Anton,sans-serif;font-size:60px;line-height:1">BUY LIST</div><div style="font-size:17px;font-weight:700">For: ${esc(leaders.join(" · "))}</div></div>
        <div style="text-align:right"><div style="font-size:72px;font-weight:900;line-height:1;color:var(--ink2)">${B.total}</div><div class="muted" style="font-weight:700">cards · ${B.items.length} different</div></div></div>
      <div class="sheet-grid">${B.items.map(x => `<div style="display:flex;flex-direction:column;gap:8px;break-inside:avoid"><div style="position:relative">${tile(x.c, { noTrig: true })}<span class="need" style="position:absolute;right:-8px;bottom:-8px;font-size:34px;min-width:62px;height:62px">×${x.need}</span></div>
        <span style="font-size:18px;font-weight:900;color:var(--ink2);line-height:1.15">${esc(x.c.n)}</span>
        <span style="display:flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700">${x.c.co.map(c => `<span class="dot" style="background:${SOLID[c]}"></span>`).join("")}${x.c.i}<span style="border:1.5px solid #98C6F2;border-radius:5px;padding:0 5px">${x.c.r}</span></span>
        <span class="muted" style="font-size:13.5px;font-weight:600;line-height:1.35">${esc(x.parts.map(([d, n]) => leaderName(d) + " " + n).join(" · "))} · have ${x.have}</span></div>`).join("")}</div>
      <div class="muted" style="display:flex;justify-content:space-between;font-weight:700;border-top:1.5px solid #CCE3FA;margin-top:26px;padding-top:12px"><span>Any English printing is fine unless noted.</span><span>Deck Lab · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
    </section></main>`;
}

// ---------------- Wishlist ----------------
const PRI_LABEL = { GRAIL: "GRAIL", WANT: "WANT", NICE: "NICE TO HAVE" };
export function wishView() {
  const W = S.wish; const v = U.wishView; const L = U.wishList;
  let items = W.items.filter(x => DB.byId[x.card]);
  if (L) items = items.filter(x => x.list === L);
  if (v === "pri") items = items.filter(x => x.pri === "GRAIL");
  if (v === "got") items = items.filter(x => x.got);
  if (U.wishQ) { const q = U.wishQ.toLowerCase(); items = items.filter(x => DB.byId[x.card]._name.includes(q) || x.card.toLowerCase().includes(q)); }
  const pr = x => { const p = price(x.card); return p && p.m || 0; };
  const order = { GRAIL: 0, WANT: 1, NICE: 2 };
  items.sort(U.wishSort === "pri" ? (a, b) => order[a.pri] - order[b.pri] : U.wishSort === "name" ? (a, b) => DB.byId[a.card].n.localeCompare(DB.byId[b.card].n) : U.wishSort === "price" ? (a, b) => pr(b) - pr(a) : (a, b) => (b.added || 0) - (a.added || 0));
  const all = W.items.length; const got = W.items.filter(x => x.got).length;
  const shareUrl = W.shareId ? location.origin + location.pathname + "#/w/" + W.shareId : null;
  return `<main class="wrap"><div class="row">
    <aside class="glass" style="flex:1 1 260px;max-width:300px;padding:22px 16px;display:flex;flex-direction:column;gap:6px;border-radius:26px" aria-label="Lists">
      ${[["all", "My Wishlist", IC.heart(24, "#3B84E6", "#FFFFFF"), all], ["pri", "Priority", IC.star, W.items.filter(x => x.pri === "GRAIL").length], ["got", "Acquired", IC.box, got]].map(([k, l, ic, n]) => `<button class="navitem ${v === k && !L ? "on" : ""}" data-act="wish-view" data-k="${k}"><span style="width:26px;display:flex;justify-content:center">${ic}</span><span style="flex:1">${l}</span><span class="muted" style="font-size:14px">${n}</span></button>`).join("")}
      <button class="btn btn-soft" style="margin:10px 6px 4px" data-act="wish-newlist">+ New List</button>
      <span style="padding:18px 16px 6px;font-size:17px;font-weight:800">Lists</span>
      ${W.lists.length ? W.lists.map(l => `<div style="display:flex;align-items:center"><button class="navitem sm ${L === l.id ? "on" : ""}" data-act="wish-list" data-id="${l.id}">${IC.shell}<span style="flex:1">${esc(l.name)}</span><span>(${W.items.filter(x => x.list === l.id).length})</span></button><button class="linkbtn" style="padding:0 6px;color:var(--muted)" data-act="wish-dellist" data-id="${l.id}" aria-label="Delete list ${esc(l.name)}">×</button></div>`).join("") : `<span class="muted" style="padding:0 16px;font-size:13.5px;font-weight:600">Make lists like Trades or Birthday.</span>`}
    </aside>
    <section style="flex:999 1 640px;min-width:0;display:flex;flex-direction:column;gap:20px" aria-label="Wishlist cards">
      <div class="glass toolbar"><span class="pagename">${L ? esc((W.lists.find(x => x.id === L) || {}).name || "List") : "Wishlist"}</span>
        <div class="field searchbox" style="flex:1 1 220px">${IC.search}<label class="sr" for="wq">Search wishlist</label><input id="wq" type="search" value="${esc(U.wishQ)}" placeholder="Search wishlist..." data-input="wishQ"></div>
        <label class="sr" for="ws">Sort</label><select id="ws" class="field" style="padding:10px 12px;font-weight:700;font-size:14.5px" data-change="wish-sort">${[["added", "Sort: Date added"], ["pri", "Sort: Priority"], ["name", "Sort: Name"], ["price", "Sort: Price"]].map(([k, l]) => `<option value="${k}" ${U.wishSort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        <div class="rel"><button class="btn btn-blue" data-act="menu" data-k="share" aria-expanded="${U.menu === "share"}">Share ${IC.caret}</button>
          ${U.menu === "share" ? `<div class="glass popmenu" style="left:auto;right:0;min-width:300px" data-stop="1">
            ${shareUrl ? `<span style="font-size:13.5px;font-weight:800;color:#1F7A4C;padding:4px 8px">Live link is on — friends always see your latest list.</span><button class="opt" data-act="share-copy">Copy link</button><button class="opt" data-act="share-stop">Turn off the link</button>`
              : `<button class="opt" data-act="share-start">Create a live link${sync.user ? "" : " (sign in first)"}</button>`}
            <button class="opt" data-act="print">Save PDF (snapshot)</button></div>` : ""}</div>
      </div>
      ${items.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:24px">${items.map(x => { const c = DB.byId[x.card]; const p = price(c.i); const vv = c.v.find(v => v[0] === (x.sfx || "")) || c.v[0];
        return `<div class="glass wcard" style="opacity:${x.got ? 0.78 : 1}"><span class="spark">${IC.spark}</span>
          <div style="position:relative"><button class="cbtn" data-act="detail" data-id="${c.i}" aria-label="${esc(c.n)} details">${tile(c, { suffix: x.sfx || "", noTrig: true })}</button>
            <button class="pri ${x.pri}" data-act="wish-pri" data-id="${x.id}" title="Change priority">${PRI_LABEL[x.pri]}</button>
            ${x.got ? `<span style="position:absolute;right:10px;bottom:10px;background:#2E9E6A;color:#FFF;border:1.5px solid #FFF;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:900">GOT IT</span>` : ""}</div>
          <div style="display:flex;flex-direction:column;gap:2px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px"><span style="font-size:18px;font-weight:800;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.n)}</span><a href="${esc(tcgUrl(c))}" target="_blank" rel="noopener" style="font-size:14px;font-weight:900;text-decoration:none;color:var(--ink);white-space:nowrap">${p && p.m ? money(p.m) : "Price"} ↗</a></div>
            <label class="sr" for="v${x.id}">Printing</label><select id="v${x.id}" class="muted" style="border:0;background:transparent;font-size:13.5px;font-weight:700;padding:0" data-change="wish-variant" data-id="${x.id}">${c.v.map(v => `<option value="${esc(v[0])}" ${v === vv ? "selected" : ""}>${c.i}${v[0] ? " " + v[0].replace("_", "") : ""} · ${esc(v[1])} · ${v[2]}</option>`).join("")}</select></div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div class="stepper"><button data-act="wish-qty" data-id="${x.id}" data-d="-1" aria-label="Fewer">−</button><span>${x.qty}</span><button data-act="wish-qty" data-id="${x.id}" data-d="1" aria-label="More">+</button></div>
            <button class="linkbtn" style="color:var(--muted);font-size:13px" data-act="wish-remove" data-id="${x.id}">Remove</button>
            <button class="heartbtn ${x.got ? "got" : ""}" data-act="wish-got" data-id="${x.id}" aria-pressed="${!!x.got}" aria-label="Mark ${esc(c.n)} acquired">${IC.heart(26)}</button></div>
          ${W.lists.length ? `<label class="sr" for="l${x.id}">List</label><select id="l${x.id}" class="field" style="padding:6px 8px;font-size:13px;font-weight:700" data-change="wish-move" data-id="${x.id}"><option value="">No list</option>${W.lists.map(l => `<option value="${l.id}" ${x.list === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>` : ""}
        </div>`; }).join("")}</div>`
        : `<div class="glass empty">${all ? "Nothing here." : "Your wishlist is empty. Open any card and tap “Wishlist”."}</div>`}
    </section></div>
    <div class="glass" style="margin:0 auto;width:min(1080px,100%);display:flex;flex-wrap:wrap;align-items:center;gap:24px;padding:18px 34px;border-radius:24px">
      <span style="display:flex;align-items:center;gap:14px;font-size:26px;font-weight:800">${IC.heart(36, "#FFFFFF", "#1E56B5")}Wishlist (${all})</span>
      <div style="margin-left:auto;flex:0 1 480px;display:flex;flex-direction:column;gap:8px"><span style="text-align:center;font-size:16px;font-weight:700">Acquired: <b style="color:#1E56B5;font-size:18px">${got} / ${all}</b> (${all ? Math.round(100 * got / all) : 0}%)</span>
        <div class="progress"><div style="width:${all ? Math.round(100 * got / all) : 0}%"></div></div></div></div>
  </main>`;
}

// ---------------- Shared wishlist (public link) ----------------
export function sharedView(data, err) {
  if (err) return `<main class="wrap"><div class="glass empty">This wishlist link isn't active anymore.</div></main>`;
  if (!data) return `<main class="wrap"><div class="glass empty">Loading wishlist…</div></main>`;
  const d = data.data || {}; const items = (d.items || []).filter(x => DB.byId[x.id]);
  const order = { GRAIL: 0, WANT: 1, NICE: 2 }; items.sort((a, b) => order[a.pri] - order[b.pri]);
  const when = new Date(data.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `<main class="wrap" style="max-width:760px">
    <section class="glass" style="padding:18px 20px"><span class="label">Wishlist</span><div style="font-size:28px;font-weight:900;color:var(--ink2)">${esc(d.owner || "A friend")}'s Wishlist</div><span class="muted" style="font-weight:700">${items.length} cards · updated ${when}</span></section>
    ${items.map(x => { const c = DB.byId[x.id]; const p = price(c.i); const vv = c.v.find(v => v[0] === x.sfx) || c.v[0];
      return `<div class="glass" style="display:flex;align-items:center;gap:14px;padding:12px;border-radius:18px">
        <div style="width:64px;flex:none">${tile(c, { suffix: x.sfx, noTrig: true })}</div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span class="pri ${x.pri}" style="position:static;align-self:flex-start">${PRI_LABEL[x.pri] || x.pri}</span>
          <span style="font-size:17px;font-weight:900;color:var(--ink2)">${esc(c.n)}${x.qty > 1 ? ` ×${x.qty}` : ""}</span><span class="muted" style="font-size:13px;font-weight:700">${c.i} · ${esc(vv[1])} · ${vv[2]}${x.note ? " · " + esc(x.note) : ""}</span></div>
        <a class="btn btn-soft" href="${esc(tcgUrl(c))}" target="_blank" rel="noopener" aria-label="Find ${esc(c.n)} on TCGplayer">${p && p.m ? money(p.m) : "Price"} ${IC.ext}</a></div>`; }).join("") || `<div class="glass empty">Nothing on this list right now.</div>`}
    <span class="muted" style="text-align:center;font-weight:700;font-size:13px">Tap a price to compare on TCGplayer. Cards they already got are hidden.</span>
  </main>`;
}
