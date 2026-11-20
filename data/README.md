# Reference data typed in by hand

- `airdna.csv`: one row per city and month from AirDNA's free market pages
  (https://www.airdna.co/vacation-rental-data/app/ph/...). ADR converted to pesos
  at the BSP reference rate for that month.
- `bsp_rppi.csv`: the BSP Residential Property Price Index, from the quarterly
  report PDF (https://www.bsp.gov.ph, Media and Research → RPPI).

Load both with `node scripts/load-reference.mjs` (needs `DATABASE_URL`). Re-running
replaces the rows for the months and quarters in the files.
