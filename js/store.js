// Saved data: kept in this browser right away, and synced to the account when signed in.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const KEY = "decklab:v1";
export function blank() {
  return {
    v: 1, rev: 0, updated: 0,
    owner: null,                                 // account this browser copy belongs to (null = not signed in)
    decks: [], gone: [],
    owned: {},                                   // card id -> copies you own (counts for every deck)
    wish: { items: [], lists: [], shareId: null },
    buy: { decks: {}, mode: "own" },
    settings: { bg: "sky", photo: null, photos: [], blur: 6, veil: 15 },
    recent: [],
  };
}
export let S = load();
export const sync = { user: null, status: "local", timer: null, lastHash: "" };
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); }
const notices = new Set();
export function onNotice(fn) { notices.add(fn); }
function notice(msg) { for (const f of notices) f(msg); }
function emit() { for (const f of listeners) f(); }

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return Object.assign(blank(), s); } catch (e) {}
  return blank();
}
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn("local save failed", e); } }

// Every change goes through here: update, save locally, push to the account shortly after.
export function commit(mutator, opts = {}) {
  mutator(S);
  S.rev++; S.updated = Date.now();
  saveLocal();
  if (!opts.silent) emit();
  schedulePush();
}

export function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

// ---------- account ----------
export async function initAuth() {
  const { data } = await sb.auth.getSession();
  sync.user = data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((ev, session) => {
    const was = sync.user && sync.user.id;
    sync.user = session ? session.user : null;
    if (sync.user && sync.user.id !== was) pull(true);
    if (!sync.user) { sync.status = "local"; emit(); }
  });
  if (sync.user) await pull(true);
  window.addEventListener("focus", () => { if (sync.user) pull(false); });
}
export async function signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error; return data;
}
// Signing out clears this browser's copy so the next person on this computer starts fresh.
// Everything stays in the account and comes back on the next sign-in.
export async function signOut() {
  clearTimeout(sync.timer);
  if (sync.user && hash(S) !== sync.lastHash) await push();     // save anything not yet sent
  await sb.auth.signOut();
  S = blank(); saveLocal(); sync.lastHash = ""; sync.status = "local";
  try { localStorage.removeItem("decklab:open"); } catch (e) {}
  emit();
}

function hash(o) { const s = JSON.stringify(o); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); }

function schedulePush() {
  if (!sync.user) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(push, 1500);
}
async function push() {
  if (!sync.user) return;
  const h = hash(S);
  if (h === sync.lastHash) return;
  sync.status = "saving"; emit();
  const { error } = await sb.from("user_state").upsert({ user_id: sync.user.id, data: S, updated_at: new Date().toISOString() });
  sync.status = error ? "error" : "saved";
  if (!error) sync.lastHash = h;
  emit();
  if (!error && S.wish.shareId) pushShared();
}

// Merge two saves: decks by id (newer edit wins, deleted stays deleted), higher owned count wins,
// wishlist items/lists by id, settings from the newer save.
function merge(a, b) {
  const out = blank();
  const newer = (a.updated || 0) >= (b.updated || 0) ? a : b;
  out.gone = [...new Set([...(a.gone || []), ...(b.gone || [])])];
  const decks = {};
  for (const d of [...(a.decks || []), ...(b.decks || [])]) if (!decks[d.id] || (d.updated || 0) > (decks[d.id].updated || 0)) decks[d.id] = d;
  out.decks = Object.values(decks).filter(d => !out.gone.includes(d.id)).sort((x, y) => (y.updated || 0) - (x.updated || 0));
  out.owned = Object.assign({}, a.owned);
  for (const [k, v] of Object.entries(b.owned || {})) out.owned[k] = Math.max(out.owned[k] || 0, v);
  const byId = (xs, ys) => { const m = {}; for (const x of [...(xs || []), ...(ys || [])]) if (!m[x.id] || (x.updated || 0) > (m[x.id].updated || 0)) m[x.id] = x; return Object.values(m).filter(x => !out.gone.includes(x.id)); };
  out.wish = { items: dedupeWish(byId(a.wish?.items, b.wish?.items), out.gone), lists: byId(a.wish?.lists, b.wish?.lists), shareId: newer.wish?.shareId || a.wish?.shareId || b.wish?.shareId || null };
  out.buy = Object.assign({}, newer.buy);
  out.settings = Object.assign(blank().settings, newer.settings);
  out.settings.photos = [...new Set([...(a.settings?.photos || []), ...(b.settings?.photos || [])])];
  out.recent = newer.recent || [];
  out.updated = Math.max(a.updated || 0, b.updated || 0);
  return out;
}

// The same card added on two devices (or before and after signing in) becomes one entry.
function dedupeWish(items, gone) {
  const keep = {};
  for (const x of items) {
    const k = x.card + "|" + (x.sfx || "") + "|" + (x.got ? 1 : 0); const y = keep[k];
    if (!y) { keep[k] = x; continue; }
    const [win, lose] = (x.updated || 0) > (y.updated || 0) ? [x, y] : [y, x];
    keep[k] = Object.assign({}, win, { qty: Math.max(win.qty || 1, lose.qty || 1), added: Math.min(win.added || Infinity, lose.added || Infinity) });
    gone.push(lose.id);
  }
  return Object.values(keep);
}

// Photos picked before signing in live only in this browser; move them to the account's storage.
async function movePhotos() {
  const local = (S.settings.photos || []).filter(u => u.startsWith("data:"));
  for (const d of local) {
    try {
      const blob = await (await fetch(d)).blob();
      const path = `${sync.user.id}/${uid()}.jpg`;
      const { error } = await sb.storage.from("backgrounds").upload(path, blob, { contentType: "image/jpeg" });
      if (error) continue;
      const url = sb.storage.from("backgrounds").getPublicUrl(path).data.publicUrl;
      commit(s => { s.settings.photos = s.settings.photos.map(u => u === d ? url : u); if (s.settings.photo === d) s.settings.photo = url; });
    } catch (e) {}
  }
}

export async function pull(first) {
  if (!sync.user) return;
  sync.status = "syncing"; emit();
  const { data, error } = await sb.from("user_state").select("data, updated_at").eq("user_id", sync.user.id).maybeSingle();
  if (error) { sync.status = "error"; emit(); return; }
  const remote = data && data.data && data.data.v === 1 ? data.data : null;
  const me = sync.user.id;
  if (!remote) {   // brand-new account: guest work in this browser becomes its start (never another account's leftovers)
    if (S.owner && S.owner !== me) S = blank();
    S.owner = me; S.updated = Date.now(); saveLocal(); await push(); await movePhotos();
    if (first && (S.decks.length || S.wish.items.length)) notice("Your decks and wishlist from this browser are saved to your new account");
    return;
  }
  if (hash(remote) === hash(S)) { sync.status = "saved"; sync.lastHash = hash(S); emit(); return; }
  const localEmpty = !S.decks.length && !S.wish.items.length && !Object.keys(S.owned).length;
  const otherAccount = S.owner && S.owner !== me;          // leftovers from someone else's account: never mix them in
  const guest = !S.owner && !localEmpty;                     // made before signing in: add to the account
  const newDecks = guest ? S.decks.filter(d => !(remote.decks || []).some(r => r.id === d.id)).length : 0;
  const newWish = guest ? S.wish.items.filter(x => !(remote.wish?.items || []).some(r => r.card === x.card && !r.got)).length : 0;
  S = localEmpty || otherAccount ? Object.assign(blank(), remote) : merge(S, remote);
  S.owner = me;
  saveLocal(); sync.lastHash = hash(remote);
  emit();
  await push();
  if (guest) {
    await movePhotos();
    const parts = [newDecks && `${newDecks} deck${newDecks > 1 ? "s" : ""}`, newWish && `${newWish} wishlist card${newWish > 1 ? "s" : ""}`].filter(Boolean);
    if (parts.length) notice(`Added ${parts.join(" and ")} from this browser to your account`);
  }
}

// ---------- shared wishlist ----------
export function sharedSnapshot() {
  const owner = (sync.user && sync.user.email || "").split("@")[0];
  return { owner, items: S.wish.items.filter(x => !x.got).map(x => ({ id: x.card, sfx: x.sfx || "", pri: x.pri, qty: x.qty, note: x.note || "", list: x.list || null })), lists: S.wish.lists };
}
export async function pushShared() {
  if (!sync.user || !S.wish.shareId) return;
  await sb.from("shared_lists").upsert({ id: S.wish.shareId, owner: sync.user.id, kind: "wishlist", title: "Wishlist", data: sharedSnapshot(), updated_at: new Date().toISOString() });
}
export async function startSharing() {
  if (!sync.user) throw new Error("Sign in to share a live link.");
  if (!S.wish.shareId) commit(s => { s.wish.shareId = uid() + uid(); }, { silent: true });
  await pushShared();
  return S.wish.shareId;
}
export async function stopSharing() {
  if (!S.wish.shareId) return;
  if (sync.user) await sb.from("shared_lists").delete().eq("id", S.wish.shareId);
  commit(s => { s.wish.shareId = null; });
}
export async function fetchShared(id) {
  const { data, error } = await sb.from("shared_lists").select("data, updated_at").eq("id", id).maybeSingle();
  if (error) throw error; return data;
}

// ---------- background photos ----------
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(b => res(b), "image/jpeg", 0.85));
}
export async function uploadBackground(file) {
  const blob = await shrink(file);
  if (sync.user) {
    const path = `${sync.user.id}/${uid()}.jpg`;
    const { error } = await sb.storage.from("backgrounds").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return sb.storage.from("backgrounds").getPublicUrl(path).data.publicUrl;
  }
  // not signed in: keep a smaller copy in this browser only
  return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
}
export async function removeBackground(url) {
  if (sync.user && url.includes("/backgrounds/")) {
    const path = url.split("/backgrounds/")[1];
    if (path && path.startsWith(sync.user.id)) await sb.storage.from("backgrounds").remove([path]);
  }
}
