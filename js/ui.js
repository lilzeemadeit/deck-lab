// Shared UI state, icons, header, background, the card detail panel and small helpers.
import { DB, esc, tile, fmtEffect, CAT, price, money, tcgUrl, priceAsOf } from "./data.js";
import { S, sync } from "./store.js";
import { lockInfo } from "./rules.js";

export const U = {
  route: "cards", sub: "", param: "",
  q: "", spoilers: false, readOff: [], F: { std: false }, sel: null, menu: null, cardsShown: 120,
  deckId: localStorage.getItem("decklab:open") || null,
  pq: "", psp: false, pLeaderOnly: true, pFade: true, pSort: "cost", preview: null, pShown: 60,
  statSel: null, ideaPick: null, minHits: 8,
  exportTab: "text", wishView: "all", wishList: null, wishQ: "", wishSort: "added",
  bgOpen: false, modal: null, toast: null, leaderQ: "",
};
export const ACT = {}; export const INPUT = {}; export const CHANGE = {};
let rerender = () => {};
export function setRender(fn) { rerender = fn; }
export function redraw() { rerender(); }
export function toast(msg) { U.toast = msg; redraw(); clearTimeout(toast.t); toast.t = setTimeout(() => { U.toast = null; redraw(); }, 2600); }

export const IC = {
  search: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  ext: `<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M7 17L17 7M9 7h8v8"/></svg>`,
  lock: `<svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  heart: (w = 24, fill = "#FFFFFF", stroke = "none") => `<svg aria-hidden="true" width="${w}" height="${Math.round(w * 0.92)}" viewBox="0 0 24 22"><path d="M12 20s-7.5-4.6-9.6-9.2C.9 7.4 3 3.5 6.8 3.5c2.1 0 3.6 1.1 4.6 2.6 1-1.5 2.5-2.6 4.6-2.6 3.8 0 5.9 3.9 4.4 7.3C18.9 15.4 12 20 12 20z" fill="${fill}" stroke="${stroke}" stroke-width="1.8"/></svg>`,
  star: `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2A6CD3" stroke-width="1.9"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>`,
  box: `<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2A6CD3" stroke-width="1.9"><rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M9 14l3 2 3-2"/></svg>`,
  shell: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#FFF6DC" stroke="#C48E1C" stroke-width="1.6" stroke-linecap="round"><path d="M12 21c-5 0-9-3.6-9-8.2C3 7.6 7 3 12.2 3 16.6 3 20 6.2 20 10.3c0 3.4-2.7 6-6 6-2.7 0-4.8-2-4.8-4.6 0-2.1 1.7-3.8 3.8-3.8 1.7 0 3 1.3 3 2.9"/><path d="M12 21c2.6 0 5-1 6.6-2.8"/></svg>`,
  photo: `<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2A6CD3" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-5 4 4 3-3 6 6"/></svg>`,
  caret: `<svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><path d="M1 3h10L6 9z" fill="currentColor"/></svg>`,
  spark: `<svg aria-hidden="true" width="20" height="20" viewBox="-11 -11 22 22"><path d="M0 -10 Q0 0 10 0 Q0 0 0 10 Q0 0 -10 0 Q0 0 0 -10Z" fill="#3B84E6"/></svg>`,
};

// ---------- background ----------
export const BGS = {
  sky: { label: "Sky", css: "linear-gradient(180deg, #86C3FF 0%, #B4DBFF 30%, #DCEFFF 62%, #F4FAFF 100%)", art: 1, cloud: 0.95 },
  golden: { label: "Golden hour", css: "linear-gradient(180deg, #FFA97A 0%, #FFCFA0 34%, #FFE9CC 68%, #FFF7EC 100%)", art: 0.85, cloud: 0.9 },
  night: { label: "Night sky", css: "linear-gradient(180deg, #121C44 0%, #2A3E7E 52%, #7690CC 100%)", art: 0.3, cloud: 0.35 },
};
let CLOUDS = "";
export async function loadClouds() { try { CLOUDS = await (await fetch("img/sky.svg")).text(); } catch (e) { CLOUDS = ""; } }
export function paintBackground() {
  const el = document.getElementById("bg"); if (!el) return;
  const st = S.settings; const photo = st.bg === "photo" && st.photo;
  const b = BGS[photo ? "sky" : (BGS[st.bg] ? st.bg : "sky")];
  const key = photo ? "p|" + st.photo + "|" + st.blur + "|" + st.veil : "b|" + st.bg;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.style.background = photo ? "#DCEFFF" : b.css;
  el.innerHTML = photo
    ? `<img class="photo" alt="" src="${esc(st.photo)}" style="filter:blur(${+st.blur}px)"><div class="veil" style="background:rgba(255,255,255,${(+st.veil) / 100})"></div>`
    : `<div class="art" style="opacity:${b.art}">${CLOUDS}</div>`;
}

export function bgPanel() {
  const st = S.settings; const isPhoto = st.bg === "photo" && st.photo;
  return `<section class="glass pop pop-bg" aria-label="Background settings">
    <div style="display:flex;align-items:center;gap:10px"><h2 class="h2" style="font-size:21px">Background</h2>
      <button class="btn btn-soft avatar" style="margin-left:auto;width:36px;height:36px" data-act="bg-close" aria-label="Close">×</button></div>
    <div style="font-size:13.5px;font-weight:700;border-radius:12px;padding:8px 12px;${sync.user ? "color:#1F7A4C;background:rgba(214,245,228,0.85)" : "color:#5C3D00;background:rgba(255,241,208,0.9)"}">
      ${sync.user ? "✓ Saved to your account · shows on every device" : "Saved in this browser. Sign in to keep it on every device."}</div>
    <div style="display:flex;flex-direction:column;gap:8px"><span class="label">Sky</span>
      <div class="swatches">${Object.entries(BGS).map(([k, b]) => `<button class="swatch ${!isPhoto && st.bg === k ? "on" : ""}" data-act="bg-set" data-k="${k}" aria-pressed="${!isPhoto && st.bg === k}"><span class="pic" style="background:${b.css}"><span class="cloud" style="opacity:${b.cloud}"></span></span>${b.label}</button>`).join("")}</div></div>
    <div style="display:flex;flex-direction:column;gap:8px"><span class="label">Your photos</span>
      <div class="swatches">${(st.photos || []).map((u, i) => `<button class="swatch ${isPhoto && st.photo === u ? "on" : ""}" data-act="bg-photo" data-i="${i}" aria-label="Use photo ${i + 1}"><span class="pic" style="background-image:url('${esc(u)}')"></span></button>`).join("")}
        <label class="upload"><span style="font-size:22px;line-height:1">+</span>Upload<input type="file" accept="image/jpeg,image/png,image/webp" data-change="bg-upload" aria-label="Upload a background photo"></label></div></div>
    ${isPhoto ? `<div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(74,98,144,0.2);padding-top:12px">
      <label class="slider">Blur<input type="range" min="0" max="20" value="${st.blur}" data-input="bg-blur"><span>${st.blur}</span></label>
      <label class="slider">Soften<input type="range" min="0" max="60" value="${st.veil}" data-input="bg-veil"><span>${st.veil}</span></label>
      <div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12.5px">Panels stay frosted so text stays readable.</span><button class="linkbtn" data-act="bg-remove">Remove photo</button></div></div>` : ""}
    <button class="linkbtn" style="align-self:flex-start" data-act="bg-set" data-k="sky">Reset to Sky</button>
  </section>`;
}

// ---------- header ----------
const TABS = [["cards", "Cards"], ["builder", "Deck Builder"], ["decks", "Decks"], ["buy", "Buy List"], ["wishlist", "Wishlist"]];
export function header() {
  const syncTxt = sync.user ? ({ saving: "Saving…", saved: "Saved", syncing: "Syncing…", error: "Couldn't save — retrying" }[sync.status] || "") : "";
  return `<header class="wrap hdr">
    <a class="logo" href="#/cards"><svg aria-hidden="true" width="48" height="48" viewBox="0 0 62 62" fill="none"><circle cx="31" cy="31" r="22" fill="#FFF" stroke="#1B3461" stroke-width="3.5"/><circle cx="31" cy="31" r="14" fill="#D6EAFD" stroke="#2A6CD3" stroke-width="2"/><path d="M31 19l4 12-4 12-4-12z" fill="#2A6CD3"/><path d="M19 31h24" stroke="#1B3461" stroke-width="2"/></svg>
      <span><b>DECK LAB</b><small>CARD GAME TOOLS</small></span></a>
    <nav class="nav" aria-label="Main">${TABS.map(([k, l]) => `<a href="#/${k}" class="${U.route === k ? "on" : ""}" ${U.route === k ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <div class="hdr-right">
      ${syncTxt ? `<span class="sync">${syncTxt}</span>` : ""}
      <button class="btn btn-soft" data-act="bg-toggle" aria-expanded="${U.bgOpen}">${IC.photo}Background</button>
      ${sync.user ? `<button class="btn btn-soft avatar" data-act="account" aria-label="Account">${esc((sync.user.email || "?")[0].toUpperCase())}</button>` : `<button class="btn btn-blue" data-act="account">Sign in</button>`}
    </div>
  </header>`;
}

// ---------- account modal ----------
export function accountModal() {
  if (sync.user) {
    return `<div class="modal-back" data-act="modal-close"><div class="glass modal" data-stop="1" role="dialog" aria-label="Account">
      <h2 class="h2">Your account</h2><span class="muted" style="font-weight:700">${esc(sync.user.email)}</span>
      <span style="font-size:14px">Decks, copies you own, your wishlist and your background save to this account and show up on any device you sign in on.</span>
      <div style="display:flex;gap:10px"><button class="btn btn-soft" data-act="signout">Sign out</button><button class="btn btn-blue" data-act="modal-close" style="margin-left:auto">Done</button></div></div></div>`;
  }
  const m = U.modal || {};
  return `<div class="modal-back" data-act="modal-close"><form class="glass modal" data-stop="1" data-submit="auth" role="dialog" aria-label="Sign in">
    <h2 class="h2">${m.mode === "up" ? "Create an account" : "Sign in"}</h2>
    <span style="font-size:14px">So your decks, wishlist and background follow you to every device. Everything works without an account too — it just stays in this browser.</span>
    <label class="sr" for="em">Email</label><input class="field" id="em" type="email" name="email" placeholder="Email" autocomplete="email" required>
    <label class="sr" for="pw">Password</label><input class="field" id="pw" type="password" name="password" placeholder="Password (6+ characters)" minlength="6" autocomplete="${m.mode === "up" ? "new-password" : "current-password"}" required>
    ${m.err ? `<div class="warn">${esc(m.err)}</div>` : ""}${m.msg ? `<div class="warn" style="background:rgba(214,245,228,0.9);border-color:#7CCB9F;color:#1F7A4C">${esc(m.msg)}</div>` : ""}
    <button class="btn btn-blue" type="submit">${m.mode === "up" ? "Create account" : "Sign in"}</button>
    <button class="linkbtn" type="button" data-act="auth-mode">${m.mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}</button>
  </form></div>`;
}

// ---------- card detail ----------
export function cardDetail(card, opts = {}) {
  if (!card) return `<div class="empty">Tap a card to see it here.</div>`;
  const deck = opts.deck; const L = deck && DB.byId[deck.leader];
  const lk = L ? lockInfo(card, L) : null;
  const p = price(card.i); const asof = priceAsOf();
  const inDeck = deck ? (deck.cards[card.i] || 0) : 0;
  return `<div style="display:flex;gap:16px">
      <div style="width:128px;flex:none">${tile(card)}</div>
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <span class="muted" style="font-size:12.5px;font-weight:700;font-family:'JetBrains Mono',monospace">${card.i} · ${card.r}${card.up ? " · UPCOMING" : ""}</span>
        <h2 class="h2" style="font-size:24px;color:var(--ink2);line-height:1.1">${esc(card.n)}</h2>
        <span class="muted" style="font-size:13.5px;font-weight:700">${CAT[card.c]} · ${card.co.join(" / ")}${card.a && card.a.length ? " · " + card.a.join(" / ") : ""}</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${card.t.map(t => `<span style="font-size:12.5px;font-weight:800;border:1.5px solid var(--ink);border-radius:8px;padding:2px 8px;background:rgba(255,255,255,0.7)">${esc(t)}</span>`).join("")}</div>
      </div></div>
    <dl style="margin:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
      <div class="field statbox"><dt>${card.c === "L" ? "Life" : "Cost"}</dt><dd>${card.k ?? "—"}</dd></div>
      <div class="field statbox"><dt>Power</dt><dd>${card.p ?? "—"}</dd></div>
      <div class="field statbox"><dt>Counter</dt><dd>${card.ct ? "+" + card.ct : "—"}</dd></div></dl>
    ${card.e ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="label">Effect</span><p class="eff">${fmtEffect(card.e)}</p></div>` : ""}
    ${card.tr ? `<div class="trgbox"><span style="align-self:flex-start;background:#1B3461;color:#FFE38A;font-size:11px;font-weight:900;letter-spacing:0.12em;border-radius:6px;padding:3px 8px">TRIGGER</span><p class="eff" style="font-size:14.5px">${fmtEffect(card.tr.replace(/^\[Trigger\]\s*/, ""))}</p></div>` : ""}
    ${lk && (lk.state === "full" || lk.state === "partial") ? `<div class="field" style="display:flex;gap:10px;padding:12px;font-size:14px;line-height:1.5">${IC.lock}<span><b>${lk.state === "full" ? "Leader-locked" : "Partly leader-locked"}</b> — needs ${esc(lk.need)}. Your leader is ${esc(L.n)}.</span></div>` : ""}
    ${!L && (card.sg || []).some(s => s.c) ? `<div class="field" style="display:flex;gap:10px;padding:12px;font-size:14px">${IC.lock}<span><b>Leader-locked text:</b> ${esc((card.sg.find(s => s.c) || {}).ct || "")}</span></div>` : ""}
    ${card.ban ? `<div class="warn">Banned in official play.</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:8px">
      ${card.c === "L" ? `<button class="btn btn-blue" data-act="new-deck" data-id="${card.i}">Start a deck with this leader</button>`
        : deck ? `<div style="display:flex;gap:8px;align-items:center"><button class="btn btn-blue" style="flex:1" data-act="deck-add" data-id="${card.i}">+ Add to ${esc(deck.name)}</button>${inDeck ? `<span class="pill">In deck ×${inDeck}</span>` : ""}</div>`
        : `<button class="btn btn-blue" data-act="goto-builder">Open a deck to add cards</button>`}
      <div style="display:flex;gap:8px"><button class="btn btn-soft" style="flex:1" data-act="wish-add" data-id="${card.i}">${IC.heart(16, "#2A6CD3")}Wishlist</button>
        <a class="btn btn-soft" style="flex:1" href="${esc(tcgUrl(card))}" target="_blank" rel="noopener">TCGplayer ${IC.ext}</a></div>
      <span class="muted" style="text-align:center;font-size:13px;font-weight:700">${p && p.m != null ? `Market ${money(p.m)}${asof ? " · as of " + asof : ""}` : "No price yet — check TCGplayer"}</span>
      ${p && p.v && p.v.length ? `<details><summary class="muted" style="font-size:13px;font-weight:800;cursor:pointer">Other printings on TCGplayer (${p.v.length})</summary><div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">${p.v.slice(0, 12).map(v => `<a href="${esc(v[2])}" target="_blank" rel="noopener" style="display:flex;justify-content:space-between;font-size:13px;font-weight:700"><span>${esc(v[0])}</span><span>${money(v[1])}</span></a>`).join("")}</div></details>` : ""}
    </div>
    ${card.v && card.v.length > 1 ? `<div style="display:flex;flex-direction:column;gap:6px"><span class="label">Printings</span><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">${card.v.map(v => `<div title="${esc(v[1] + " · " + v[2])}">${tile(card, { suffix: v[0], noTrig: true })}<div class="muted" style="font-size:11px;font-weight:700;text-align:center;margin-top:3px">${esc(v[1])}</div></div>`).join("")}</div></div>` : ""}`;
}

// generic dropdown chip (multi-select)
export function menuChip(key, label, options, selected) {
  const open = U.menu === key; const n = (selected || []).length;
  return `<div class="rel"><button class="pill ${n ? "blue" : ""}" data-act="menu" data-k="${key}" aria-expanded="${open}">${label}${n ? ` · ${n}` : ""} ${IC.caret}</button>
    ${open ? `<div class="glass popmenu" data-stop="1">${options.map(([v, l]) => `<label><input type="checkbox" data-change="menu-opt" data-k="${key}" data-v="${esc(v)}" ${(selected || []).map(String).includes(String(v)) ? "checked" : ""}>${l}</label>`).join("")}
      ${n ? `<button class="opt linkbtn" data-act="menu-clear" data-k="${key}">Clear</button>` : ""}</div>` : ""}</div>`;
}
