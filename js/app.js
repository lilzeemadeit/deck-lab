// Deck Lab — router, events and start-up.
import { DB, loadData, esc, CAT } from "./data.js";
import { S, sync, commit, uid, onChange, onNotice, initAuth, signIn, signUp, signOut, startSharing, stopSharing, fetchShared, uploadBackground, removeBackground } from "./store.js";
import { U, ACT, INPUT, CHANGE, setRender, redraw, toast, header, bgPanel, accountModal, cardDetail, paintBackground, loadClouds } from "./ui.js";
import { cardsView, currentDeck } from "./views/cards.js";
import { builderView, deckTotal } from "./views/builder.js";
import { decksView, buyView, sheetView, wishView, sharedView, buyData, exportText } from "./views/lists.js";

U.PF = U.PF || {}; U.pReadOff = U.pReadOff || []; U.deckFilter = "recent"; U.shared = null;
const app = document.getElementById("app");

// ---------------- routing ----------------
function route() {
  const parts = (location.hash || "#/cards").replace(/^#\/?/, "").split("/");
  const r = parts[0] || "cards";
  U.route = ["cards", "builder", "decks", "buy", "sheet", "wishlist", "w"].includes(r) ? r : "cards";
  U.sub = parts[1] || ""; U.param = parts[1] || "";
  U.menu = null; if (U.modal && U.modal.type !== "account") U.modal = null;
  if (U.route === "w" && (!U.shared || U.shared.id !== U.param)) {
    U.shared = { id: U.param, data: null, err: null };
    fetchShared(U.param).then(d => { U.shared.data = d; if (!d) U.shared.err = true; redraw(); }).catch(() => { U.shared.err = true; redraw(); });
  }
  render(); window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

// ---------------- render ----------------
function modalView() {
  const m = U.modal; if (!m) return "";
  if (m.type === "account") return accountModal();
  const shell = (inner, label, w = 480) => `<div class="modal-back" data-act="modal-close"><div class="glass modal" style="width:${w}px" data-stop="1" role="dialog" aria-label="${esc(label)}">${inner}</div></div>`;
  if (m.type === "card") { const c = DB.byId[m.id]; if (!c) return "";
    return shell(`<div style="display:flex;justify-content:flex-end;margin-bottom:-8px"><button class="btn btn-soft avatar" style="width:36px;height:36px" data-act="modal-close" aria-label="Close">×</button></div>${cardDetail(c, { deck: U.route === "builder" ? currentDeck() : null })}`, c.n); }
  if (m.type === "del-deck") { const d = currentDeck(); if (!d) return "";
    return shell(`<h2 class="h2">Delete “${esc(d.name)}”?</h2><span style="font-size:14px">This removes the deck from every device you're signed in on. Cards you marked as owned stay.</span>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-soft" data-act="modal-close">Cancel</button><button class="btn btn-red" data-act="del-deck-yes">Delete deck</button></div>`, "Delete deck", 420); }
  if (m.type === "newlist") return `<div class="modal-back" data-act="modal-close"><form class="glass modal" data-stop="1" data-submit="newlist" role="dialog" aria-label="New list">
      <h2 class="h2">New list</h2><label class="sr" for="ln">List name</label><input class="field" id="ln" type="text" name="name" placeholder="e.g. Trades, Birthday, OP-09 chase" maxlength="40" required autofocus>
      <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-soft" type="button" data-act="modal-close">Cancel</button><button class="btn btn-blue" type="submit">Make list</button></div></form></div>`;
  return "";
}
function view() {
  if (!DB.ready) return `<main class="wrap"><div class="glass empty">Loading cards…</div></main>`;
  switch (U.route) {
    case "builder": return builderView();
    case "decks": return decksView();
    case "buy": return buyView();
    case "sheet": return sheetView();
    case "wishlist": return wishView();
    case "w": return sharedView(U.shared && U.shared.data, U.shared && U.shared.err);
    default: return cardsView();
  }
}
let pending = 0;
function render() {
  // remember focus, caret, typed-but-unsaved form values and inner scroll spots
  const a = document.activeElement; const fid = a && a.id;
  let s0 = null, s1 = null; try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) {}
  const vals = {}; app.querySelectorAll("input[id]:not([data-input]):not([type=file]):not([type=checkbox])").forEach(el => { vals[el.id] = el.value; });
  const scrolls = [...app.querySelectorAll(".popmenu, .modal, pre.export, .pool")].map(el => el.scrollTop);
  app.innerHTML = header() + (U.bgOpen ? bgPanel() : "") + view() + modalView() + (U.toast ? `<div class="toast" role="status">${esc(U.toast)}</div>` : "");
  for (const [id, v] of Object.entries(vals)) { const el = document.getElementById(id); if (el && !el.value) el.value = v; }
  [...app.querySelectorAll(".popmenu, .modal, pre.export, .pool")].forEach((el, i) => { if (scrolls[i]) el.scrollTop = scrolls[i]; });
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { if (s0 != null) el.setSelectionRange(s0, s1); } catch (e) {} } }
  document.title = { builder: "Deck Builder", decks: "Decks", buy: "Buy List", sheet: "Buy List sheet", wishlist: "Wishlist", w: "Wishlist" }[U.route] ? `${{ builder: "Deck Builder", decks: "Decks", buy: "Buy List", sheet: "Buy List sheet", wishlist: "Wishlist", w: "Wishlist" }[U.route]} · Deck Lab` : "Deck Lab";
}
function soon() { cancelAnimationFrame(pending); pending = requestAnimationFrame(render); }
setRender(soon);
onChange(() => { paintBackground(); soon(); });
onNotice(msg => toast(msg));

// ---------------- events ----------------
document.addEventListener("click", ev => {
  const t = ev.target;
  let el = t.closest("[data-act]");
  const stop = t.closest('[data-stop="1"]');
  if (el && stop && el !== stop && el.contains(stop)) el = null;     // clicks inside a modal/menu don't hit the backdrop
  if (U.menu && !stop && !(el && el.dataset.act === "menu")) { U.menu = null; if (!el) { redraw(); return; } }
  if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.tagName === "BUTTON" && el.type !== "submit") ev.preventDefault();
  fn(el.dataset, el, ev);
});
document.addEventListener("input", ev => { const el = ev.target; const k = el.dataset && el.dataset.input; if (k && INPUT[k]) INPUT[k](el.value, el); });
document.addEventListener("change", ev => { const el = ev.target; const k = el.dataset && el.dataset.change; if (k && CHANGE[k]) CHANGE[k](el, el.dataset); });
document.addEventListener("submit", ev => { const f = ev.target; const k = f.dataset && f.dataset.submit; if (!k) return; ev.preventDefault(); SUBMIT[k] && SUBMIT[k](new FormData(f)); });
document.addEventListener("keydown", ev => {
  if (ev.key !== "Escape") return;
  if (U.modal) U.modal = null; else if (U.menu) U.menu = null; else if (U.bgOpen) U.bgOpen = false; else return;
  redraw();
});

// ---------------- helpers ----------------
const deckNow = () => currentDeck();
function editDeck(fn) { const d = deckNow(); if (!d) return; commit(() => { fn(d); d.updated = Date.now(); }); }
async function copy(text, msg = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch (e) { toast("Couldn't copy — select the text and copy it yourself"); }
}
function openDeck(id) { U.deckId = id; localStorage.setItem("decklab:open", id); U.preview = null; U.statSel = null; U.ideaPick = null; U.pShown = 60; }
function deckLines(d, kind) {
  const L = DB.byId[d.leader]; const ents = Object.entries(d.cards).filter(([, n]) => n > 0).map(([id, n]) => [DB.byId[id], n]).filter(x => x[0])
    .sort((a, b) => "CES".indexOf(a[0].c) - "CES".indexOf(b[0].c) || (a[0].k ?? 99) - (b[0].k ?? 99) || a[0].n.localeCompare(b[0].n));
  if (kind === "sim") return [`1x${L.i}`].concat(ents.map(([c, n]) => `${n}x${c.i}`)).join("\n");
  let out = `${d.name}\nLeader: ${L.n} (${L.i})\n`; let last = "";
  for (const [c, n] of ents) { if (c.c !== last) { out += `\n${CAT[c.c]}s\n`; last = c.c; } out += `${n}x ${c.n} (${c.i})\n`; }
  return out + `\nTotal: ${deckTotal(d)}`;
}

// ---------------- actions ----------------
Object.assign(ACT, {
  // header, account, background
  "account": () => { U.modal = { type: "account", mode: "in" }; redraw(); },
  "auth-mode": () => { U.modal = { type: "account", mode: U.modal && U.modal.mode === "up" ? "in" : "up" }; redraw(); },
  "modal-close": () => { U.modal = null; redraw(); },
  "signout": async () => { await signOut(); U.modal = null; U.deckId = null; toast("Signed out — everything is saved in your account"); },
  "bg-toggle": () => { U.bgOpen = !U.bgOpen; redraw(); },
  "bg-close": () => { U.bgOpen = false; redraw(); },
  "bg-set": d => commit(s => { s.settings.bg = d.k; }),
  "bg-photo": d => commit(s => { s.settings.bg = "photo"; s.settings.photo = s.settings.photos[+d.i]; }),
  "bg-remove": async () => { const url = S.settings.photo; commit(s => { s.settings.photos = s.settings.photos.filter(u => u !== url); s.settings.photo = null; s.settings.bg = "sky"; }); try { await removeBackground(url); } catch (e) {} },

  // cards tab
  "spoilers": d => { U.spoilers = d.v === "1"; U.cardsShown = 120; redraw(); },
  "pick": d => { U.sel = d.id; if (matchMedia("(max-width: 900px)").matches) U.modal = { type: "card", id: d.id }; redraw(); },
  "more-cards": () => { U.cardsShown += 120; redraw(); },
  "read-off": d => { U.readOff.push(d.w); redraw(); },
  "read-off-undo": d => { U.readOff = U.readOff.filter(w => w !== d.w); redraw(); },
  "pread-off": d => { U.pReadOff.push(d.w); redraw(); },
  "pread-off-undo": d => { U.pReadOff = U.pReadOff.filter(w => w !== d.w); redraw(); },
  "toggle-std": d => { const F = d.p ? U.PF : U.F; F.std = !F.std; redraw(); },
  "menu": d => { U.menu = U.menu === d.k ? null : d.k; redraw(); },
  "menu-clear": d => { const [F, k] = d.k.startsWith("p") ? [U.PF, d.k.slice(1)] : [U.F, d.k]; F[k] = []; redraw(); },
  "detail": d => { U.modal = { type: "card", id: d.id }; redraw(); },
  "wish-add": d => {
    if (S.wish.items.some(x => x.card === d.id && !x.got)) return toast("Already on your Wishlist");
    commit(s => s.wish.items.push({ id: uid(), card: d.id, sfx: "", pri: "WANT", qty: 1, got: false, list: U.wishList || null, note: "", added: Date.now(), updated: Date.now() }));
    toast("Added to your Wishlist");
  },

  // decks
  "new-deck": d => { const L = DB.byId[d.id]; if (!L) return; const id = uid(); const now = Date.now();
    commit(s => { s.decks.unshift({ id, name: `${L.n} deck`, leader: L.i, cards: {}, track: false, fav: false, created: now, updated: now }); });
    openDeck(id); U.modal = null; if (location.hash !== "#/builder") location.hash = "#/builder"; else redraw(); toast("New deck started"); },
  "new-deck-start": () => { U.deckId = null; localStorage.removeItem("decklab:open"); },
  "open-deck": d => openDeck(d.id),
  "goto-builder": () => { U.modal = null; location.hash = "#/builder"; },
  "deck-filter": d => { U.deckFilter = d.k; redraw(); },
  "fav-deck": d => commit(s => { const x = s.decks.find(y => y.id === d.id); if (x) { x.fav = !x.fav; x.updated = Date.now(); } }),
  "deck-add": d => {
    const deck = deckNow(); if (!deck) return toast("Open a deck first");
    const c = DB.byId[d.id]; if (!c || c.c === "L") return;
    const n = deck.cards[c.i] || 0;
    if (!c.any && n >= 4) return toast("Max 4 copies of a card");
    if (deckTotal(deck) >= 50) return toast("Deck is full — 50 cards");
    editDeck(x => { x.cards[c.i] = n + 1; });
  },
  "deck-dec": d => editDeck(x => { const n = (x.cards[d.id] || 0) - 1; if (n > 0) x.cards[d.id] = n; else delete x.cards[d.id]; }),
  "own": d => { const n = +d.n; const deck = deckNow(); const shown = Math.min(S.owned[d.id] || 0, deck ? deck.cards[d.id] || 0 : 0);
    commit(s => { const v = shown >= n ? n - 1 : n; if (v > 0) s.owned[d.id] = v; else delete s.owned[d.id]; }); },
  "track": () => { const deck = deckNow(); if (!deck) return; const on = !deck.track;
    editDeck(x => { x.track = on; }); commit(s => { s.buy.decks[deck.id] = on; }, { silent: true });
    if (on) toast("Tap the Have boxes to mark copies you own"); },
  "preview": d => { U.preview = U.preview === d.id ? null : d.id; redraw(); },
  "preview-clear": () => { U.preview = null; redraw(); },
  "psp": () => { U.psp = !U.psp; redraw(); },
  "p-leader": () => { U.pLeaderOnly = !U.pLeaderOnly; redraw(); },
  "p-sort": d => { U.pSort = d.k; redraw(); },
  "p-fade": () => { U.pFade = !U.pFade; redraw(); },
  "p-more": () => { U.pShown += 60; redraw(); },
  "stat": (d, el) => { const same = U.statSel && U.statSel[0] === d.kind && U.statSel[1] === d.k;
    const label = d.kind === "cat" ? CAT[d.k] + "s" : d.kind === "cost" ? "Cost " + d.k : d.kind === "counter" ? (d.k === "0" ? "No counter" : "+" + d.k + " counter") : d.kind === "power" ? d.k + " power" : d.k;
    U.statSel = same ? null : [d.kind, d.k, label]; redraw(); },
  "stat-clear": () => { U.statSel = null; redraw(); },
  "idea-pick": d => { U.ideaPick = U.ideaPick === d.k ? null : d.k; redraw(); },
  "min-hits": d => { U.minHits = Math.max(1, Math.min(50, U.minHits + +d.d)); redraw(); },
  "export-deck": d => { const deck = deckNow(); if (!deck) return; U.menu = null; copy(deckLines(deck, d.f), d.f === "sim" ? "Copied — paste into a deck site or sim" : "Deck list copied"); },
  "dup-deck": () => { const deck = deckNow(); if (!deck) return; const id = uid(); const now = Date.now();
    commit(s => { s.decks.unshift(Object.assign(JSON.parse(JSON.stringify(deck)), { id, name: deck.name + " (copy)", created: now, updated: now, fav: false })); });
    openDeck(id); U.menu = null; toast("Deck duplicated"); },
  "del-deck": () => { U.menu = null; U.modal = { type: "del-deck" }; redraw(); },
  "del-deck-yes": () => { const deck = deckNow(); if (!deck) return; commit(s => { s.decks = s.decks.filter(x => x.id !== deck.id); s.gone.push(deck.id); delete s.buy.decks[deck.id]; });
    U.deckId = null; localStorage.removeItem("decklab:open"); U.modal = null; location.hash = "#/decks"; toast("Deck deleted"); },

  // buy list
  "buy-mode": d => commit(s => { s.buy.mode = d.k; }),
  "got-one": d => commit(s => { s.owned[d.id] = (s.owned[d.id] || 0) + 1; }),
  "export-tab": d => { U.exportTab = d.k; redraw(); },
  "copy-export": () => copy(exportText(buyData(), U.exportTab), "Buy List copied"),
  "share-export": async () => { try { await navigator.share({ title: "Buy List", text: exportText(buyData(), U.exportTab) }); } catch (e) {} },
  "print": () => { U.menu = null; render(); setTimeout(() => window.print(), 50); },

  // wishlist
  "wish-view": d => { U.wishView = d.k; U.wishList = null; redraw(); },
  "wish-list": d => { U.wishList = d.id; U.wishView = "all"; redraw(); },
  "wish-newlist": () => { U.modal = { type: "newlist" }; redraw(); },
  "wish-dellist": d => { commit(s => { s.wish.lists = s.wish.lists.filter(l => l.id !== d.id); s.gone.push(d.id); for (const x of s.wish.items) if (x.list === d.id) { x.list = null; x.updated = Date.now(); } }); if (U.wishList === d.id) U.wishList = null; },
  "wish-pri": d => commit(s => { const x = s.wish.items.find(y => y.id === d.id); if (x) { x.pri = { GRAIL: "WANT", WANT: "NICE", NICE: "GRAIL" }[x.pri] || "WANT"; x.updated = Date.now(); } }),
  "wish-qty": d => commit(s => { const x = s.wish.items.find(y => y.id === d.id); if (x) { x.qty = Math.max(1, Math.min(99, x.qty + +d.d)); x.updated = Date.now(); } }),
  "wish-remove": d => commit(s => { s.wish.items = s.wish.items.filter(y => y.id !== d.id); s.gone.push(d.id); }),
  "wish-got": d => commit(s => { const x = s.wish.items.find(y => y.id === d.id); if (x) { x.got = !x.got; x.updated = Date.now(); } }),
  "share-start": async () => {
    U.menu = null;
    if (!sync.user) { U.modal = { type: "account", mode: "in", msg: "Sign in to make a live link. Friends don't need an account to view it." }; return redraw(); }
    try { const id = await startSharing(); redraw(); copy(location.origin + location.pathname + "#/w/" + id, "Live link copied — it updates as you change your list"); }
    catch (e) { toast(e.message || "Couldn't make the link"); }
  },
  "share-copy": () => { U.menu = null; redraw(); copy(location.origin + location.pathname + "#/w/" + S.wish.shareId, "Link copied"); },
  "share-stop": async () => { U.menu = null; await stopSharing(); toast("Link turned off"); },
});

Object.assign(INPUT, {
  "q": v => { U.q = v; U.cardsShown = 120; redraw(); },
  "pq": v => { U.pq = v; U.pShown = 60; redraw(); },
  "leaderQ": v => { U.leaderQ = v; redraw(); },
  "wishQ": v => { U.wishQ = v; redraw(); },
  // sliders: update the photo live without rebuilding the page (so dragging keeps working)
  "bg-blur": (v, el) => { commit(s => { s.settings.blur = +v; }, { silent: true }); el.nextElementSibling.textContent = v; paintBackground(); },
  "bg-veil": (v, el) => { commit(s => { s.settings.veil = +v; }, { silent: true }); el.nextElementSibling.textContent = v; paintBackground(); },
});

Object.assign(CHANGE, {
  "menu-opt": (el, d) => {
    const pool = d.k.startsWith("p"); const F = pool ? U.PF : U.F; const k = pool ? d.k.slice(1) : d.k;
    const v = ["costs", "counters"].includes(k) ? +d.v : d.v;
    F[k] = (F[k] || []).filter(x => x !== v); if (el.checked) F[k].push(v);
    U.cardsShown = 120; redraw();
  },
  "deck-name": el => editDeck(x => { x.name = el.value.trim() || x.name; }),
  "buy-deck": (el, d) => commit(s => { s.buy.decks[d.id] = el.checked; }),
  "wish-sort": el => { U.wishSort = el.value; redraw(); },
  "wish-move": (el, d) => commit(s => { const x = s.wish.items.find(y => y.id === d.id); if (x) { x.list = el.value || null; x.updated = Date.now(); } }),
  "wish-variant": (el, d) => commit(s => { const x = s.wish.items.find(y => y.id === d.id); if (x) { x.sfx = el.value; x.updated = Date.now(); } }),
  "bg-upload": async el => {
    const f = el.files && el.files[0]; if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast("Use a JPG, PNG or WebP photo");
    toast("Uploading photo…");
    try { const url = await uploadBackground(f);
      commit(s => { s.settings.photos = [url].concat(s.settings.photos.filter(u => u !== url)).slice(0, sync.user ? 8 : 2); s.settings.photo = url; s.settings.bg = "photo"; });
      toast(sync.user ? "Background saved to your account" : "Background set — sign in to keep it on every device");
    } catch (e) { toast("Upload failed: " + (e.message || "try a smaller photo")); }
  },
});

const SUBMIT = {
  auth: async fd => {
    const email = String(fd.get("email") || "").trim(); const pw = String(fd.get("password") || ""); const mode = (U.modal && U.modal.mode) || "in";
    try {
      if (mode === "up") { const r = await signUp(email, pw);
        U.modal = r.session ? null : { type: "account", mode: "in", msg: "Check your email for a confirmation link, then sign in here." };
        if (r.session) toast("Account created — your stuff now saves to it"); else redraw();
      } else { await signIn(email, pw); U.modal = null; toast("Signed in — syncing your stuff"); }
    } catch (e) { U.modal = { type: "account", mode, err: e.message || "Something went wrong" }; redraw(); }
  },
  newlist: fd => { const name = String(fd.get("name") || "").trim(); if (!name) return; const id = uid();
    commit(s => { s.wish.lists.push({ id, name, updated: Date.now() }); }); U.modal = null; U.wishList = id; U.wishView = "all"; redraw(); },
};

// ---------------- start ----------------
(async function start() {
  paintBackground(); route();
  await loadClouds(); document.getElementById("bg").dataset.key = ""; paintBackground();
  try { await loadData(); } catch (e) { app.innerHTML = header() + `<main class="wrap"><div class="glass empty">Couldn't load the card list. Refresh to try again.</div></main>`; return; }
  if (U.deckId && !S.decks.some(d => d.id === U.deckId)) U.deckId = null;
  render();
  try { await initAuth(); } catch (e) { console.warn("sign-in unavailable", e); }
  render();
})();
