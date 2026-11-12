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
best = {}   # number -> {"m","l","u","v":[...]}

for g in results(f"{BASE}/{cid}/groups"):
    gid = g["groupId"]
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
        low = p.get("lowPrice")
        name = prod.get("name") or ""
        url = prod.get("url") or f"https://www.tcgplayer.com/product/{prod['productId']}"
        is_variant = bool(re.search(r"\((?:Parallel|Alternate Art|Manga|SP|Full Art|Box Topper|Treasure|Pre-Release|Gold|Silver|Red|Blue|Jolly Roger|Textured|Signature|Winner|Judge|Promo)[^)]*\)", name, re.I))
        rec = best.setdefault(num, {"m": None, "l": None, "u": None, "v": []})
        if not is_variant and rec["u"] is None:
            rec["m"] = round(market, 2) if market else None
            rec["l"] = round(low, 2) if low else None
            rec["u"] = url
        else:
            rec["v"].append([name, round(market, 2) if market else None, url])

# a card whose only listings are variants still gets a link
for num, rec in best.items():
    if rec["u"] is None and rec["v"]:
        rec["v"].sort(key=lambda v: (v[1] is None, v[1] or 0))
        rec["u"] = rec["v"][0][2]
    if not rec["v"]:
        del rec["v"]

out = {"updated": datetime.date.today().isoformat(), "source": "TCGplayer via tcgcsv.com", "p": best}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("priced cards", len(best))
