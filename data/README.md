# Reference data typed in by hand

- `airdna.csv`: one row per city and month from AirDNA's free market pages
  (https://www.airdna.co/vacation-rental-data/app/ph/...). ADR converted to pesos
  at the BSP reference rate for that month.
- `bsp_rppi.csv`: the BSP Residential Property Price Index, from the quarterly
  report PDF (https://www.bsp.gov.ph, Media and Research → RPPI).

Load both with `node scripts/load-reference.mjs` (needs `DATABASE_URL`). Re-running
replaces the rows for the months and quarters in the files.

## Current figures

- AirDNA: October 2026, read 2026-11-20 from each market's overview page. USD converted at
  ₱63.10 (average of BSP daily reference rates for October 2026). AirDNA's "Manila" market
  covers Metro Manila as a whole, so it's stored under Manila only. Mactan is stored as
  Lapu-Lapu, Malay as Boracay, General Luna as Siargao.
- BSP RPPI: Q2 2026 report (index values and year-on-year change), read 2026-11-20.
