"""Build data/cards.json for Deck Lab.

Input : punk-records/english (data/*.json + packs.json) — the official English card list, scraped
Output: data/cards.json — one record per gameplay card, with printings, effect tags,
        parsed leader conditions (leader-lock), searcher filters and "needs" (for the Ideas tab).

Usage: python tools/build_data.py <punk-records/english> data/cards.json
"""
import json, glob, re, sys, os, collections, html, datetime

SRC = sys.argv[1]
OUT = sys.argv[2]

packs = json.load(open(os.path.join(SRC, "packs.json")))
records = []
for f in sorted(glob.glob(os.path.join(SRC, "data", "*.json"))):
    records += json.load(open(f))

# Official ban list effective Oct 12, 2026 (en.onepiece-cardgame.com/news/restriction.html) — update when Bandai announces changes
BANNED = ["OP06-047", "OP03-040", "OP06-086", "ST10-001", "OP06-116", "OP14-020"]
BANNED_PAIRS = [["OP07-115", "EB04-058"], ["OP11-040", "OP11-067"], ["OP11-040", "OP08-069"]]
# Bandai block-icon exceptions (en.onepiece-cardgame.com/news/blockicon-card.html)
STD_PERMITTED = ["EB01-006","EB02-061","EB03-061","EB04-044","EB05-014","OP01-016","OP01-120","OP02-013","OP03-122","OP04-083","OP05-069","OP05-074","OP05-119","OP06-118","OP06-119","OP07-051","OP08-118","OP09-004","OP09-051","OP09-093","OP09-118","OP09-119","OP10-119","OP11-118","OP12-118","OP13-118","OP13-119","OP13-120","OP14-119","OP15-118","OP16-063","OP16-065","OP16-073","OP17-005","OP17-022","OP17-062","OP17-112","OP17-118","EB04-061"]
STD_BLOCK4 = ["OP01-039","OP01-055","OP02-005","OP02-068","OP03-008","OP03-044","OP03-048","OP03-072","OP03-097","OP04-016","OP04-077","OP04-096","ST01-011","ST02-007","ST06-008"]

def pack_label(pid):
    p = packs.get(pid)
    if not p: return "?"
    lab = (p.get("title_parts") or {}).get("label") or ""
    if pid == "569901": return "Promo"
    if pid == "569801": return "Other"
    return lab or html.unescape(p["raw_title"])

def pack_name(pid):
    p = packs.get(pid)
    if not p: return ""
    t = (p.get("title_parts") or {}).get("title") or html.unescape(p["raw_title"])
    return html.unescape(t)

# ---------- effect tags ----------
TAGS = [
    ("rest", "Rests opponent", r"\b[Rr]est (?:up to |all |\d+ )?[^.]{0,80}?opponent's|opponent's [^.]{0,60}?(?:will not become active|cannot be set as active)"),
    ("ko", "K.O.", r"\bK\.O\. (?:up to|all|\d)"),
    ("bounce", "Return to hand", r"to the owner's hand"),
    ("bottom", "Bottom of deck", r"bottom of the owner's deck"),
    ("powdown", "Reduce power", r"[−-]\d+ power"),
    ("powup", "Gain power", r"\+\d+ power"),
    ("costdown", "Reduce cost", r"[−-]\d+ cost"),
    ("draw", "Draw", r"\b[Dd]raw (?:up to )?\d+ cards?"),
    ("search", "Look / search", r"[Ll]ook at (?:up to )?\d+ cards? from the top of your deck"),
    ("donadd", "Add DON!!", r"[Aa]dd (?:up to )?\d+ DON!! cards? from your DON!! deck"),
    ("dongive", "Give DON!!", r"\b[Gg]ive [^.]{0,60}DON!!"),
    ("donminus", "DON!! −", r"DON!! [−-]\d"),
    ("active", "Set active", r"[Ss]et [^.]{0,60}?as active"),
    ("life", "Life cards", r"\bLife\b"),
    ("play", "Play from hand/trash/deck", r"[Pp]lay up to \d+[^.]{0,120}?from your (?:hand|trash|deck)"),
    ("trash", "Uses trash", r"from your trash"),
    ("negate", "Negate effects", r"[Nn]egate the effect|without (?:its|their) effects?|loses? all effects"),
    ("protect", "Protection", r"cannot be K\.O\.'d|would be K\.O\.'d|would be removed from the field|cannot be removed"),
    ("rush", "Rush", r"\[Rush"),
    ("blocker", "Blocker", r"(?<!activate )\[Blocker\]"),
    ("banish", "Banish", r"\[Banish\]"),
    ("double", "Double Attack", r"\[Double Attack\]"),
    ("unblock", "Unblockable", r"\[Unblockable\]"),
    ("onplay", "On Play", r"\[On Play\]"),
    ("onko", "On K.O.", r"\[On K\.O\.\]"),
    ("whenatk", "When Attacking", r"\[When Attacking\]"),
    ("actmain", "Activate: Main", r"\[Activate: ?Main\]"),
    ("counter_ev", "Counter", r"\[Counter\]"),
    ("onblock", "On Block", r"\[On Block\]"),
    ("oppattack", "On Your Opponent's Attack", r"\[On Your Opponent's Attack\]"),
    ("yourturn", "Your Turn", r"\[Your Turn\]"),
    ("oppturn", "Opponent's Turn", r"\[Opponent's Turn\]"),
    ("endturn", "End of Your Turn", r"\[End of Your Turn\]"),
    ("onceturn", "Once Per Turn", r"\[Once Per Turn\]"),
]
TAGRX = [(k, re.compile(rx)) for k, _, rx in TAGS]

# ---------- leader conditions ----------
SENT_SPLIT = re.compile(r"(?<=[.)])\s+(?=(?:\[|[A-Z]))")
COND_START = re.compile(r"(?:[Ii]f|\band) your Leader(?:'s)? (?=is |has |type |card name |colors )")
CUT = re.compile(r" and (?!the \{)")

def strip_reminder(s):
    return re.sub(r"\([^)]*\)", "", s)

def parse_cond(clause):
    part = CUT.split(clause, 1)[0]
    alts = []
    if re.match(r"(?:card name includes)", part):
        for q in re.findall(r'"([^"]+)"', part): alts.append(["nameinc", q])
    elif "type includes" in part:
        for q in re.findall(r'"([^"]+)"', part): alts.append(["typeinc", q])
    else:
        for t in re.findall(r"\{([^}]+)\}", part): alts.append(["type", t])
        if re.search(r"\bis\b", part):
            for n in re.findall(r"\[([^\]]+)\]", part): alts.append(["name", n])
    if "multicolored" in part: alts.append(["multi", 1])
    m = re.search(r"colors include (\w+)", part)
    if m: alts.append(["color", m.group(1).capitalize()])
    for a in re.findall(r"<(\w+)> attribute", part): alts.append(["attr", a])
    unknown = (not alts) and bool(re.search(r"[\[{\"<]", part))
    return alts, unknown

def segments(effect, trigger):
    segs = []
    prev_c = None
    for kind, text in (("e", effect), ("t", trigger)):
        if not text or text.strip() in ("-", ""):
            continue
        for s in SENT_SPLIT.split(text.strip()):
            s = s.strip()
            if not s: continue
            core = strip_reminder(re.sub(r"\[[^\]]*\]", "", s)).strip(" .:")
            seg = {"k": kind}
            if kind == "e" and len(core) < 3:
                seg["k"] = "kw"
            if re.match(r"Under the rules of this game", s):
                seg["k"] = "rule"
            alts, unk, ctext = [], False, None
            for m in COND_START.finditer(s):
                clause = s[m.end():].split(",")[0].split(":")[0]
                a, u = parse_cond(clause)
                if a:
                    alts += a
                    ctext = (ctext + "; " if ctext else "") + ("If your Leader " + clause).strip()
                unk = unk or u
            if not alts and not unk and prev_c and re.match(r"Then,", s):
                seg["c"], seg["ct"] = prev_c
            if alts:
                seg["c"], seg["ct"] = alts, ctext
                prev_c = (alts, ctext)
            elif not s.startswith("Then"):
                prev_c = None
            if unk: seg["u"] = 1
            segs.append(seg)
    return segs

# ---------- searchers (Ideas tab) ----------
SEARCH_RX = re.compile(r"[Ll]ook at (\d+) cards? from the top of your deck;\s*(?:reveal |play |add )?up to (\d+) (.+?)(?: and (add|play|place) (?:it|them)| from among| to the top of your Life|\.(?=\s|$)|$)")
def parse_filter(part, other):
    q = {}
    types = re.findall(r"\{([^}]+)\}", part) + re.findall(r'type including "([^"]+)"', part)
    if types: q["t"] = types
    names = [n for n in re.findall(r"\[([^\]]+)\]", part) if n != "Trigger" and n != other]
    if names: q["nm"] = names
    if "[Trigger]" in part: q["tr"] = 1
    for key, rx in (("k", r"cost of (\d+)(?: or (less|more))?"), ("p", r"(\d+) power(?: or (less|more))?")):
        mm = re.search(rx, part)
        if mm: q[key] = [int(mm.group(1)), mm.group(2) or "eq"]
    col = re.search(r"\b(red|green|blue|purple|black|yellow)\b", part)
    if col: q["co"] = col.group(1).capitalize()
    attr = re.findall(r"<(\w+)>", part)
    if attr: q["a"] = attr
    if re.search(r"\bCharacter card", part): q["c"] = "C"
    elif re.search(r"\bEvents?\b", part) and "Character" not in part: q["c"] = "E"
    elif re.search(r"\bStages?\b", part) and "Character" not in part: q["c"] = "S"
    return q
def parse_searcher(text):
    m = SEARCH_RX.search(text or "")
    if not m: return None
    look, upto, clause, verb = int(m.group(1)), int(m.group(2)), m.group(3), m.group(4)
    seg = text[m.start():m.end() + 40]
    job = "play" if (verb == "play" or "play up to" in seg[:60]) else ("life" if "Life" in seg else "hand")
    om = re.search(r"other than \[([^\]]+)\]", clause)
    other = om.group(1) if om else None
    parts = re.split(r" or up to \d+ ", clause)
    alts = [parse_filter(p, other) for p in parts]
    alts = [a for a in alts if a]
    if not alts: return None
    q = {"look": look, "n": upto, "job": job, "alts": alts, "txt": clause.strip()}
    if other: q["x"] = other
    return q

# ---------- needs (cards that use what your deck has) ----------
NEED_RX = [
    ("trig", re.compile(r"trash (?:1|a|\d+) cards? with a \[Trigger\] from your hand")),
    ("type", re.compile(r"trash (?:1|a|\d+) \{([^}]+)\} type cards? from your hand")),
    ("type", re.compile(r"[Ii]f you have (?:a|an|\d+ or more) \{([^}]+)\} type Characters?")),
    ("event", re.compile(r"trash (?:1|a|\d+) Events? from your hand|Events? in your trash")),
]
def parse_needs(text):
    out = []
    for kind, rx in NEED_RX:
        for m in rx.finditer(text or ""):
            if kind == "type": out.append(["type", m.group(1)])
            else: out.append([kind, 1])
    uniq = []
    for n in out:
        if n not in uniq: uniq.append(n)
    return uniq

# ---------- group printings ----------
by_base = collections.OrderedDict()
for r in records:
    base = re.sub(r"_.*", "", r["id"])
    by_base.setdefault(base, []).append(r)

def sort_key(cid):
    m = re.match(r"([A-Z]+)(\d*)-(\d+)", cid)
    order = {"OP": 0, "ST": 1, "EB": 2, "PRB": 3, "P": 4}
    if not m: return (9, 0, 0)
    return (order.get(m.group(1), 5), int(m.group(2) or 0), int(m.group(3)))

RAR = {"Common": "C", "Uncommon": "UC", "Rare": "R", "SuperRare": "SR", "SecretRare": "SEC", "Leader": "L", "Promo": "P", "SpecialRare": "SP", "TreasureRare": "TR"}
out = []
for base in sorted(by_base, key=sort_key):
    prints = by_base[base]
    main = next((p for p in prints if p["id"] == base), prints[0])
    variants, seen = [], set()
    for p in sorted(prints, key=lambda p: (p["id"] != base, p["id"])):
        if p["id"] in seen: continue
        seen.add(p["id"])
        variants.append([p["id"][len(base):], pack_label(p["pack_id"]), RAR.get(p["rarity"], p["rarity"])])
    blocks = [p["block_number"] for p in prints if p["block_number"] is not None]
    eff = (main["effect"] or "").strip()
    if eff == "-": eff = ""
    trg = (main.get("trigger") or "").strip()
    text_all = eff + " " + trg
    tags = [k for k, rx in TAGRX if rx.search(text_all)]
    if trg: tags.append("trigger")
    rec = {
        "i": base, "n": main["name"], "c": main["category"][0], "co": main["colors"],
        "k": main["cost"], "p": main["power"], "ct": main["counter"],
        "a": main["attributes"] or [], "t": main["types"], "e": eff, "tr": trg,
        "r": RAR.get(main["rarity"], main["rarity"]), "s": pack_label(main["pack_id"]), "sn": pack_name(main["pack_id"]),
        "b": max(blocks) if blocks else None, "v": variants, "g": tags,
        "sg": segments(eff, trg) if main["category"] != "Leader" else [],
    }
    sr = parse_searcher(eff) if main["category"] != "Leader" else None
    if sr: rec["sr"] = sr
    nd = parse_needs(eff) if main["category"] != "Leader" else []
    if nd: rec["nd"] = nd
    if re.search(r"any number of this card", eff): rec["any"] = 1
    if base in BANNED: rec["ban"] = 1
    out.append(rec)

def set_key(s):
    m = re.match(r"([A-Z]+)-?(\d+)", s)
    if not m: return (9, 0)
    return ({"OP": 0, "EB": 1, "PRB": 2, "ST": 3}.get(m.group(1), 5), int(m.group(2)))
sets = sorted({v[1] for r in out for v in r["v"]}, key=set_key)
latest = next((s for s in reversed(sets) if s.startswith("OP")), "")
meta = {"updated": datetime.date.today().isoformat(), "through": latest, "banned": BANNED, "pairs": BANNED_PAIRS,
        "stdPermitted": STD_PERMITTED, "stdBlock4": STD_BLOCK4, "tags": [[k, label] for k, label, _ in TAGS] + [["trigger", "Trigger"]], "sets": sets}
os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
json.dump({"meta": meta, "cards": out}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))

cc = collections.Counter(r["c"] for r in out)
print("cards", len(out), dict(cc), "printings", sum(len(r["v"]) for r in out), "size KB", os.path.getsize(OUT) // 1024)
print("leader-condition cards", sum(1 for r in out if any("c" in s for s in r["sg"])), "searchers", sum(1 for r in out if "sr" in r), "needs", sum(1 for r in out if "nd" in r))
