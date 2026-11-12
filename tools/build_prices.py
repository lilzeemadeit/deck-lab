"""Build data/prices.json from TCGCSV (a free nightly mirror of TCGplayer prices).

TCGCSV asks that apps download once a day in a background job and never call it from
the website itself — this script is that job (run by .github/workflows/refresh-data.yml).

Output shape:
{ "updated": "2026-11-12", "source": "TCGplayer via tcgcsv.com",
  "p": { "OP05-002": { "m": 1.23, "l": 0.99, "u": "https://www.tcgplayer.com/product/...",
                       "v": [["Belo Betty (Parallel)", 12.5, "https://..."], ...] } } }
m = market price of the regular printing, l = lowest listing, v = other printings (alt arts etc.)
"""
import json, sys, time, re, datetime, urllib.request

OUT = sys.argv[1] if len(sys.argv) > 1 else "data/prices.json"
BASE = "https://tcgcsv.com/tcgplayer"
UA = {"User-Agent": "DeckLab/1.0 (+https://github.com/lilzeemadeit/deck-lab; nightly, once a day)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))

def results(url):
    data = get(url)
    time.sleep(0.25)  # be polite
    return data.get("results", data) if isinstance(data, dict) else data

cats = results(BASE + "/categories")
cat = next((c for c in cats if "one piece" in (c.get("name") or c.get("displayName") or "").lower()), None)
if not cat:
    sys.exit("One Piece category not found on TCGCSV")
cid = cat["categoryId"]

NUM = re.compile(r"^[A-Z]{1,4}\d{0,2}-\d{3}$")
VARIANT = re.compile(r"\((?:Parallel|Alternate Art|Manga|SP|Full Art|Box Topper|Treasure|Pre-Release|Gold|Silver|Red|Blue|Jolly Roger|Textured|Signature|Winner|Judge|Promo|Reprint|Foil)[^)]*\)", re.I)
REPRINT_GROUP = re.compile(r"release event|demo|starter deck.*(?:2|ii)|premium|best|anniversary|promotion|promo|tournament|pack|collection|reprint", re.I)
found = {}  # number -> list of candidates

for g in results(f"{BASE}/{cid}/groups"):
    gid = g["groupId"]
    gname = g.get("name") or ""
    # set codes this group covers: "ST-31" -> ST31, "OP15-EB04" -> OP15 + EB04, "OP18 RE" -> OP18
    gsets = {t.replace("-", "") for t in re.findall(r"[A-Z]+-?\d+", (g.get("abbreviation") or "").upper())}
    try:
        products = results(f"{BASE}/{cid}/{gid}/products")
        prices = results(f"{BASE}/{cid}/{gid}/prices")
    except Exception as e:  # one bad group shouldn't stop the run
        print("skip group", gid, e)
        continue
    pr = {}
    for p in prices:
        # prefer the "Normal" sub-type when a product has several (e.g. Foil)
        cur = pr.get(p["productId"])
        if cur is None or (p.get("subTypeName") == "Normal" and cur.get("subTypeName") != "Normal"):
            pr[p["productId"]] = p
    for prod in products:
        ext = {e.get("name"): e.get("value") for e in (prod.get("extendedData") or [])}
        num = (ext.get("Number") or "").strip().upper()
        if not NUM.match(num):
            continue  # sealed product, accessories
        p = pr.get(prod["productId"]) or {}
        market = p.get("marketPrice") or p.get("midPrice")
        name = prod.get("name") or ""
        found.setdefault(num, []).append({
            "variant": bool(VARIANT.search(name)),
            "reprint_group": bool(REPRINT_GROUP.search(gname)),
            "home": num.split("-")[0] in gsets and not REPRINT_GROUP.search(gname),   # the card's own set (OP01 for OP01-001)
            "gid": gid, "name": name,
            "m": round(market, 2) if market else None,
            "l": round(p["lowPrice"], 2) if p.get("lowPrice") else None,
            "u": prod.get("url") or f"https://www.tcgplayer.com/product/{prod['productId']}",
            "pid": prod["productId"],
        })

# The "regular" price: the plain printing from the card's own set if there is one,
# otherwise the oldest plain printing. Everything else is listed as another printing.
best = {}
for num, cands in found.items():
    plain = [c for c in cands if not c["variant"]]
    plain.sort(key=lambda c: (not c["home"], c["reprint_group"], c["m"] is None, c["gid"]))
    main = plain[0] if plain else None
    if main is None:
        main = sorted(cands, key=lambda c: (c["m"] is None, c["m"] or 0))[0]
    rec = {"m": main["m"], "l": main["l"], "u": main["u"], "pid": main["pid"]}
    v = [[c["name"], c["m"], c["u"]] for c in cands if c is not main]
    if v:
        rec["v"] = sorted(v, key=lambda x: (x[1] is None, x[1] or 0))
    best[num] = rec

out = {"updated": datetime.date.today().isoformat(), "source": "TCGplayer via tcgcsv.com", "p": best}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("priced cards", len(best))
