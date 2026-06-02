# RangeExplorer V4 — TAIEX Intraday Cone Dashboard

**Live: https://zachariah9420.github.io/range-explorer-dashboard/**

A static, read-only visualization of the **V4 "Cone-as-Hero"** intraday range
forecaster for the TAIEX. The page renders the predicted high/low **cone**
(quantile band) against the realized 1-minute K-bars for a trading day.

> Goal = prediction **accuracy** (band coverage), not tradeable alpha. The thesis:
> TAIEX **volatility / range is forecastable; direction is ~not**.

## Public mirror — no research code here

This is a **front-end-only public mirror**. It holds the dashboard's static assets
plus one snapshot data file — **no models, no strategies, no research code**.

| In this public repo | Stays private (`range-explorer-taiwan`) |
|---|---|
| `V4.html`, `loader.js`, `components/*.jsx` — the UI | The 24 quantile models + training code |
| `dashboard.json` — OHLC + cone numbers (public market data) | Features, backtests, `PROBLEM_*` docs |

`dashboard.json` is TAIEX price + cone quantiles only (public market data). The code
that *produces* it lives in the private repo and is never published here.

## Files

```
V4.html            entry page (React via CDN → loads data-base.js then loader.js)
index.html         redirect → V4.html (repo-root URL works)
loader.js          polls dashboard.json
data-base.js       fallback / first-paint copy of the data
dashboard.json     the data: OHLC ts + cone (q10/median/q90) per horizon
components/         shared.jsx (design tokens) + variant-cone-hero.jsx (cone view)
.github/workflows/  pages.yml — deploys this dir to GitHub Pages on every push
```

## Data freshness

The published `dashboard.json` is a **static snapshot (current: 2026-05-25)**. The
page does **not** fetch live data, and the GitHub Action does **not** regenerate it —
it only publishes whatever is committed. To refresh, in the private repo run
`python -m src.dashboard_v4_export`, copy `results/dashboard_v4/.` here, commit & push;
Pages redeploys automatically.

## Run locally (optional)

```
python -m http.server 8000      # → http://localhost:8000/V4.html
```
`?poll=1` on the URL = 1-second polling (useful when replaying a day in the private repo).

## HUD panels

| Panel | Notes |
|---|---|
| HudKpis | 7 stats: 實際 / q90 / median / q10 / range / panic / signals |
| HudAi | AI summary + confidence % |
| HudPanic | panic gauge (calm / watch / alert) |
| HudSideStocks | 三大法人 + breadth + 權值股 TOP 6 |
| HudTimeline | intraday event timeline |
| HudWidthChart | prediction-width evolution (h5 / h15 / h30 / close) |
| HudPanicTimeline | intraday panic line |
| HudTomorrow | 隔日 / 5日 / 10日 forecast |

Panels are draggable (`⋮⋮` handle); layout persists in `localStorage['v4.layout.v1']`,
reset with `↺ 視窗`.

---
_Informational / research only. Not investment advice._
