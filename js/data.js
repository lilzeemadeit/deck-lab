// Card data, prices and the small helpers every screen uses.
import { IMG_BASE, TCG_SEARCH } from "./config.js";

export const DB = { cards: [], byId: {}, meta: {}, prices: { p: {} }, spoilers: [], types: [], ready: false };

export async function loadData() {
  const [c, p, s] = await Promise.all([
    fetch("data/cards.json").then(r => r.json()),
    fetch("data/prices.json").then(r => r.json()).catch(() => ({ p: {} })),
    fetch("data/spoilers.json").then(r => r.json()).catch(() => ({ cards: [] })),
  ]);
  DB.meta = c.meta;
  DB.cards = c.cards;
  DB.prices = p || { p: {} };
  DB.spoilers = (s.cards || []).map(x => Object.assign({ v: [["", x.s || "Upcoming", x.r || ""]], g: [], sg: [], t: [], a: [] }, x, { up: 1 }));
  const un = t => typeof t === "string" && t.includes("&") ? t.replace(/&(amp|quot|#39|lt|gt);/g, (m, k) => ({ amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">" })[k]) : t;
  for (const x of DB.cards.concat(DB.spoilers)) {
    x.n = un(x.n); x.e = un(x.e || ""); x.tr = un(x.tr || ""); x.t = (x.t || []).map(un);
    DB.byId[x.i] = x;
    x._name = x.n.toLowerCase();
    x._text = (x.e + " " + x.tr).toLowerCase();
    x._types = x.t.join(" / ").toLowerCase();
  }
  const tc = {};
  for (const x of DB.cards) for (const t of x.t) tc[t] = (tc[t] || 0) + 1;
  DB.types = Object.keys(tc).sort((a, b) => tc[b] - tc[a]);
  DB.ready = true;
}

export const COLORS = ["Red", "Green", "Blue", "Purple", "Black", "Yellow"];
export const SOLID = { Red: "#D9483B", Yellow: "#E2A90A", Green: "#23925A", Blue: "#2A6CD3", Purple: "#7246B8", Black: "#2E3440" };
const FRAME = {
  Red: ["#F7B2A8", "#E9776B", "#B8473F", "#FFD9D3", "#F2A196", "#D0645A"],
  Yellow: ["#FFE69A", "#F2C440", "#C2900B", "#FFF1C2", "#F7D873", "#DDAA27"],
  Green: ["#A7E7C3", "#4EBF83", "#1F7A4C", "#D3F5E2", "#8AD9AE", "#3E9D6C"],
  Blue: ["#B5D8FF", "#5FA0EE", "#2559B0", "#DDEEFF", "#9CC8F5", "#4F86D6"],
  Purple: ["#D5C1F5", "#9C74DD", "#5A35A0", "#EADFFC", "#BFA2EE", "#7E58C4"],
  Black: ["#B9BFCB", "#6B7383", "#2E3440", "#E4E7ED", "#AEB5C2", "#6B7383"],
};
export const CAT = { L: "Leader", C: "Character", E: "Event", S: "Stage" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function frameVars(card) {
  const a = FRAME[card.co[0]] || FRAME.Black, b = FRAME[card.co[1]] || a;
  const frame = card.co.length > 1
    ? `linear-gradient(135deg, ${SOLID[card.co[0]]} 0%, ${SOLID[card.co[0]]} 49%, ${SOLID[card.co[1]]} 51%, ${SOLID[card.co[1]]} 100%)`
    : `linear-gradient(160deg, ${a[0]} 0%, ${a[1]} 45%, ${a[2]} 100%)`;
  const art = card.co.length > 1
    ? `linear-gradient(135deg, ${a[3]} 0%, ${a[4]} 48%, ${b[4]} 52%, ${b[3]} 100%)`
    : `linear-gradient(160deg, ${a[3]} 0%, ${a[4]} 55%, ${a[5]} 100%)`;
  return `--frame:${frame};--art:${art};--c1:${SOLID[card.co[0]] || "#2E3440"}`;
}

export function imgUrl(card, suffix = "") {
  if (card.img) return card.img;
  if (card.up) return "";
  return `${IMG_BASE}${card.i}${suffix || ""}.png`;
}

// A card picture with a drawn fallback (cost, power, name) if the image can't load.
export function tile(card, opts = {}) {
  const src = opts.noImg ? "" : imgUrl(card, opts.suffix);
  const cost = card.c === "L" ? "" : `<span class="cost">${card.k ?? "–"}</span>`;
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onload="this.closest('.ctile').classList.add('has-img')" onerror="this.remove()">` : "";
  return `<div class="ctile ${opts.cls || ""}" style="${frameVars(card)}${opts.style ? ";" + opts.style : ""}">
    <div class="in">${img}<div class="fb"><div style="display:flex;justify-content:space-between">${cost}<span class="pow">${card.p ?? ""}</span></div><div class="nm">${esc(card.n)}</div></div>
    ${card.tr && !opts.noTrig ? `<span class="trg">TRIGGER</span>` : ""}</div>${opts.extra || ""}</div>`;
}

const KW = new Set(["On Play", "When Attacking", "Activate: Main", "Once Per Turn", "Blocker", "Rush", "Rush: Character", "Banish", "DON!! x1", "DON!! x2", "Main", "Counter", "On K.O.", "Opponent's Turn", "Your Turn", "End of Your Turn", "On Your Opponent's Attack", "Double Attack", "Unblockable", "On Block"]);
export function fmtEffect(text) {
  return esc(text).replace(/\[([^\]]+)\]|\{([^}]+)\}/g, (m, br, cu) => {
    if (cu) return `<span class="ty">${cu}</span>`;
    if (br === "Trigger") return `<span class="kw-trg">Trigger</span>`;
    if (KW.has(br) || /^DON!! x\d$/.test(br)) return `<span class="kw">${br}</span>`;
    return `<b>[${br}]</b>`;
  });
}

export function price(id) {
  const p = DB.prices.p && DB.prices.p[id];
  return p || null;
}
export function money(n) { return n == null ? "—" : "$" + n.toFixed(2); }
export function tcgUrl(card) {
  const p = price(card.i);
  return (p && p.u) || TCG_SEARCH + encodeURIComponent(card.i);
}
export function priceAsOf() { return DB.prices.updated ? new Date(DB.prices.updated + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null; }

export function legal(card) {
  // Standard: block 2+ (from block icons) or Bandai's permitted list, and not banned
  if (card.ban) return false;
  const m = DB.meta;
  if (m.stdPermitted && m.stdPermitted.includes(card.i)) return true;
  return card.b == null || card.b >= 2;
}
