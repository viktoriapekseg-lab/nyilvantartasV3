
# Ládanyilvántartó – Supabase (közös adatbázis) – Mobil fixekkel

## Újdonságok (mobil)
- Reszponzív rácsok: `grid-cols-1 md:grid-cols-*`
- Gombok és inputok nagyobb padding, 16px font-size (iOS zoom elkerülése)
- Táblák oszlopainak elrejtése mobilon (`hidden sm:table-cell`)
- Fejléc mobilon törik sorba, gombok egymás alatt
- Külső padding mobilon kisebb

## Telepítés
1) Supabase → futtasd a `schema.sql`-t (ha még nem tetted).
2) Vercel → Env Vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Prod/Preview/Dev).
3) Build: Vite (`npm run build`) → Output: `dist`.

## Fejlesztés
`npm i` → `npm run dev`
