# Balter Brewing — Raw Material Ordering

A static website (HTML, CSS, JavaScript — no build step) for planning the Thursday order of
**cartons, pallet pads, clusters and cans**, with a pallet-space check.

## Deploy: GitHub → Cloudflare Worker, password protected

The site is a Cloudflare **Worker** with static assets. `src/worker.js` checks the password, then serves the files in `public/`.
Repository layout: `public/` (the site), `src/worker.js`, `wrangler.jsonc`, `README.md`.

1. Create a **private** GitHub repository and upload everything in this folder (keep the folder structure).
2. In Cloudflare: **Workers & Pages → Create → Import a repository** and pick the repository.
   - Project/Worker name: `balter-ordering` (must match `name` in `wrangler.jsonc`)
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler deploy` (the default)
3. After the first deploy, open the Worker → **Settings → Variables and Secrets** and add (type *Secret*):
   - `SITE_PASSWORD` — the shared password (required). There are no usernames.
   Adding a secret takes effect straight away. Visiting the site shows a password page
   (a Balter-branded password page; it remembers you for 30 days). If `SITE_PASSWORD` is missing the site stays locked rather than open.
4. Every push to the repository redeploys the Worker.

The password check covers every page and file. Prefer named-person logins? Use Cloudflare Zero Trust → Access in front of the Worker.

## Using it

- **Stock counted** (top right) is the date of your stocktake; the next Thursday order and the delivery week follow from it.
- **Brew plan & stock → Upload stock spreadsheet** reads the NetSuite *Inventory – HOPS, YEAST, Grain, Packaging* export (the *Can -*, *Carton Empty -* and *Cluster -* rows) into the stock table and sets the stock date to today. Choose *Brewery On Hand only* (default) or *Total On Hand*. *On Order* quantities have no dates, so they are listed for reference only. Pallet pads are not in the report — enter them by hand.
- **Brew plan & stock → Upload order sheets** takes the Orora Order Sheet and Cluster Wrap Order Sheet (both at once is fine). It lists every can load (22 pallets, with PO and AM/PM) and cluster delivery from the stock-count day up to the delivery week you are ordering for, under *Orders already on their way*, so they are counted in the plan. Deliveries dated for the week you are about to order are left out (that is the order the site is suggesting). Tabs whose dates are old (an unfilled template) are skipped. Re-upload each week; typed-in loads are kept.
- **Brew plan & stock → Upload Live Brewery Board** reads the *Cartons* rows of each `WC …` tab (cases packed per day) from the
  current week onwards. The file is read in the browser and is never uploaded anywhere.
- Enter the stock count and any orders already on their way, then work down the **Order desk**.
- The pallet allowance (default 105: cartons, clusters and pallet pads together) is changed in the **Pallet space** section.
  Cans have their own store of 90 pallets (limit set under the Cans card). If cartons, clusters and pads overflow 105, free spaces in the can store are used before the site reports a shortfall. Pallet pads count toward the 105 using *pads per pallet* in Settings (placeholder 1,000).
- Figures are saved in the browser only. **Settings → Data → Export backup** moves them between computers.
- `public/seed.js` holds the starting figures taken from the spreadsheets. Delete it (and its `<script>` line in `index.html`) to start blank.

## Ordering rules built in

| Material | Supplier | Order | Arrives | Cover target |
|---|---|---|---|---|
| Clusters | Smurfit Westrock | Thursday | following Wednesday | per-SKU minimum stock to the end of the week *after* delivery (Cluster Wrap Order Sheet) |
| Cans | Orora | Thursday | Mon–Fri mornings the following week (evening second load only if essential) | planned production + 10% buffer to end of delivery week (Orora Order Sheet). Every truck is exactly 22 pallets: part-loads are topped up with cans due later that week, and a SKU can be split across days |
| Cartons | Visy | Thursday | any weekday the following week | handbook reorder-below level, order in batch sizes (SOP-008) |
| Pallet pads | Visy | Thursday | any weekday the following week | order 6,000 when stock drops below 4,000 |

Conversions: 1 case = 1 carton = 4 clusters = 16 cans · 32,000 clusters per pallet · 7,391 cans per pallet · 1,050 cartons per pallet · 22 pallets per Orora truck.
