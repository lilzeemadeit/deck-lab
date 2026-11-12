// Public settings. The publishable key is meant to live in the browser; the database's
// row-level security rules are what keep each person's data private.
export const SUPABASE_URL = "https://zibtxtcuexvrtjarqujp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_jjSTvIHU1F2ZG78CXw-pzg_P0o422jc";
// Card pictures. The official site blocks other sites from showing its images, so we use
// Limitless TCG's image host first and OPTCG API as a backup. Ids look like OP01-016 / OP01-016_p1.
export const IMG_SOURCES = [
  (id, sfx) => `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/one-piece/${id.split("-")[0]}/${id}${sfx}_EN.webp`,
  (id, sfx) => `https://optcgapi.com/media/static/Card_Images/${id}${sfx}.jpg`,
];
export const TCG_SEARCH = "https://www.tcgplayer.com/search/one-piece-card-game/product?q=";
