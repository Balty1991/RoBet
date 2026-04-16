# BetAnalytics Clean Start

Repo nou, minimalist, pentru a afișa pe GitHub Pages:
- predicțiile din BSD API (`/api/predictions/`)
- detaliile fiecărui meci (`/api/events/{id}/`)
- statistici suplimentare de manager (`/api/managers/?team_id=`)
- fără secțiunea live

## Structură

- `index.html` — pagina principală
- `assets/styles.css` — stiluri
- `assets/app.js` — randare frontend și filtre
- `scripts/fetch-bsd-data.mjs` — script server-side rulat din GitHub Actions
- `.github/workflows/fetch-bsd-data.yml` — workflow pentru actualizarea feed-ului
- `data/feed.json` — feed generat automat și consumat de frontend

## De ce așa

Cheia API nu trebuie pusă în frontend, pentru că repo-ul și pagina sunt publice. De aceea:
1. cheia stă în GitHub Secrets
2. workflow-ul trage datele din BSD API
3. datele sunt salvate local în `data/feed.json`
4. pagina doar citește JSON-ul generat

## Pași de pornire

1. Creează un repo nou.
2. Pune fișierele din această arhivă în repo.
3. În GitHub repo, intră la **Settings → Secrets and variables → Actions**.
4. Creează secret nou cu numele exact: `BSD_API_KEY`
5. Pune acolo cheia ta BSD.
6. Fă push pe branch-ul principal.
7. Intră la **Actions** și rulează manual workflow-ul **Fetch BSD data** o dată.
8. Activează GitHub Pages din **Settings → Pages** pe branch-ul principal, root.

## Ce apare în prima versiune

Pentru fiecare meci:
- toate câmpurile de prediction importante
- xG așteptat, probabilități 1X2 / over / BTTS
- recommendation flags din model
- cote disponibile în event, dacă există
- home form / away form
- head-to-head
- statistici manager gazde / oaspeți
- bloc de JSON brut, ca să vezi exact ce extragi din API

## Extensii bune pentru pasul următor

- filtru pe intervale de zile
- filtru pe ligi premium / top leagues
- pagină separată pentru meciuri finished
- integrare odds compare
- value edge calculat local
- ticket builder separat
