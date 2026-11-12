# Deck Lab

One Piece Card Game tools: card search (with spoilers), deck builder with optional copy tracking, Buy List, and a shareable Wishlist.

- Static site, no build step. Hosted on GitHub Pages.
- Sign-in and saving: Supabase (project `zibtxtcuexvrtjarqujp`).
- Card data: `data/cards.json`, built from [punk-records](https://github.com/buhbbl/punk-records).
- Prices: `data/prices.json`, refreshed nightly from TCGplayer via [TCGCSV](https://tcgcsv.com).
- The "Refresh cards and prices" GitHub Action rebuilds both every night.

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
