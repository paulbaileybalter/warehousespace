# Balter Brewing — Raw Material Ordering

A static website (HTML, CSS, JavaScript — no build step) for planning the Thursday order of
**cartons, pallet pads, clusters and cans**, with a pallet-space check.

## Deploy: GitHub → Cloudflare Pages, password protected

1. Create a **private** GitHub repository and upload everything in this folder
   (`index.html`, `styles.css`, `app.js`, `seed.js`, `logo.svg`, `favicon.svg`, `_headers`, `fonts/`, `functions/`).
2. In Cloudflare: **Workers & Pages → Create → Pages → Connect to Git** and pick the repository.
   - Framework preset: **None**
   - Build command: *(leave empty)*
   - Build output directory: `/` (or leave empty)
3. After the first deploy, open the project → **Settings → Variables and Secrets** and add (Production, type *Secret*):
   - `SITE_PASSWORD` — the shared password (required)
   - `SITE_USER` — the username (optional, defaults to `balter`)
4. **Redeploy** once so the variables take effect. Visiting the site now asks for the username and password
   (a browser sign-in box). If `SITE_PASSWORD` is missing the site stays locked rather than open.

The password check lives in `functions/_middleware.js` and covers every page and file.
Prefer named-person logins? Use Cloudflare Zero Trust → Access instead and delete the `functions` folder.

## Using it

- **Stock counted** (top right) is the date of your stocktake; the next Thursday order and the delivery week follow from it.
- **Brew plan & stock → Upload stock spreadsheet** reads the NetSuite *Inventory – HOPS, YEAST, Grain, Packaging* export (the *Can -*, *Carton Empty -* and *Cluster -* rows) into the stock table and sets the stock date to today. Choose *Brewery On Hand only* (default) or *Total On Hand*. *On Order* quantities have no dates, so they are listed for reference only. Pallet pads are not in the report — enter them by hand.
- **Brew plan & stock → Upload Live Brewery Board** reads the *Cartons* rows of each `WC …` tab (cases packed per day) from the
  current week onwards. The file is read in the browser and is never uploaded anywhere.
- Enter the stock count and any orders already on their way, then work down the **Order desk**.
- The pallet allowance (default 105, cartons + clusters) is changed in the **Pallet space** section.
  Can storage limits (90 comfortable / 104 maximum) are under the Cans card.
- Figures are saved in the browser only. **Settings → Data → Export backup** moves them between computers.
- `seed.js` holds the starting figures taken from the spreadsheets. Delete it (and its `<script>` line in `index.html`) to start blank.

## Ordering rules built in

| Material | Supplier | Order | Arrives | Cover target |
|---|---|---|---|---|
| Clusters | Smurfit Westrock | Thursday | following Wednesday | per-SKU minimum stock to the end of the week *after* delivery (Cluster Wrap Order Sheet) |
| Cans | Orora | Thursday | Mon–Fri mornings the following week (evening second load only if essential) | planned production + 10% buffer to end of delivery week (Orora Order Sheet) |
| Cartons | Visy | Thursday | any weekday the following week | handbook reorder-below level, order in batch sizes (SOP-008) |
| Pallet pads | Visy | Thursday | any weekday the following week | order 6,000 when stock drops below 4,000 |

Conversions: 1 case = 1 carton = 4 clusters = 16 cans · 32,000 clusters per pallet · 7,391 cans per pallet · 1,050 cartons per pallet · 22 pallets per Orora truck.
