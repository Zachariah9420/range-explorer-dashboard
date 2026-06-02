# V4 Dashboard (TAIEX RangeExplorer)

Open `V4.html` in a browser (best via local HTTP server):

    cd results/dashboard_v4
    python -m http.server 8000
    # then visit http://localhost:8000/V4.html

Live data is polled from `dashboard.json` every 30 seconds. To poll faster
(e.g. during replay): `http://localhost:8000/V4.html?poll=1` for 1-second
polling.

## HUD panels (7)

| Panel | Default position | Notes |
|---|---|---|
| HudKpis | top:64, left:16 | 7-stat parity with V3 (實際 / q90 / median / q10 / range / panic / signals) |
| HudAi | top:64, right:16 | AI summary + confidence % |
| HudPanic | bottom:16, right:16 | Panic gauge with calm / watch / alert tiers |
| HudSideStocks | top:320, right:16 | 三大法人 + breadth + 權值股 TOP 6 |
| HudTimeline | bottom:16, left:16…right:380 | Event timeline |
| HudWidthChart | bottom:160, left:16 | Prediction width evolution (h5 / h15 / h30 / close) |
| HudPanicTimeline | bottom:200, right:16 | Intraday panic line + n_high_margin |
| HudTomorrow | top:320, left:16 | 隔日 / 5日 / 10日 預測 (v3-deep walk-forward) |

(HudKpis + HudTomorrow + the 6 right-rail panels = 8 total cards; "7 HUD" is
the V3-parity count — `HudTomorrow` is a bonus addition.)

## Drag + persist

Every panel has a `⋮⋮` drag handle in its title row. Drag positions persist
in `localStorage['v4.layout.v1']`. Reset with the `↺ 視窗` button in the
top toolbar, or pick a preset:

| Preset | Effect |
|---|---|
| `DEFAULT` | Clears all overrides — every panel snaps back to its hard-coded position. |
| `WIDE` | Pushes panels toward viewport edges to give the chart maximum real estate. Positions are computed from `window.innerWidth` / `innerHeight` at click time. |
| `COMPACT` | Resets to default positions; collapse each panel manually with its ▲ button (panels track collapsed state in local React state, so presets can't toggle it). |

Presets write directly to `localStorage['v4.layout.v1']` then fire a
`LAYOUT_RESET` event so the `useDraggable` hook picks up the new positions.

## Replay

    python -m src.replay_v4 --date 2026-05-15 --start 09:30 --end 13:30 --step 5 --sleep 2

Then open `http://localhost:8000/V4.html?poll=1` to watch the day unfold.
Replay rebuilds `dashboard.json` + `data-base.js` on every step; the
browser's loader polls and re-renders.

Useful flags:

- `--step N` — minutes advanced per iteration (default 5)
- `--sleep N` — seconds between iterations (compressed wall-clock time)
- `--skip-finmind` — skip end-of-day side panel fetches (三大法人 / breadth);
  use during fast smoke runs where stale side-panel data is acceptable.

## Smoke test verification

Last verified end-to-end on 5/15 replay with:

    python -m src.replay_v4 --date 2026-05-15 --start 09:30 --end 13:30 --step 10 --sleep 1 --skip-finmind

Result: exit code 0, 25 iterations covering 09:30 → 13:30 in ~25 wall-clock
seconds. Final state (from `results/dashboard_v4/dashboard.json`):

- 270 OHLC bars (09:01 → 13:30)
- 15 events total, 2 high-level: 13:21 `WIDE_RANGE_DAY`, 15:15
  `PANIC_ALERT`
- `PANIC_INTRADAY` cumulative timeline: 15 points, 0.8 → 14.7
- `TOMORROW` payload present (1d / 5d / 10d horizons)
- All 8 HUD panels render correctly (HudKpis, HudAi, HudPanic,
  HudSideStocks, HudTimeline, HudWidthChart, HudPanicTimeline,
  HudTomorrow); `HISTORY=0` because no `predict_history_<date>.csv` exists
  for this fast smoke run, so q90/q10/median fall back to last close per
  invariant #4 ("Empty-HISTORY graceful fallback")

For a richer end-to-end run (with full prediction history) run
`scripts/predict_live.bat` first to build `predict_history_<date>.csv`,
then replay without `--skip-finmind` and with `--sleep 2`.

## Non-regression invariants

The 10-PR V3 → V4 migration locked the following 6 invariants — no PR may
regress them:

1. **Cone wedge geometry** — `HeroCone` in `variant-cone-hero.jsx`
   (signal-to-CLOSE_MS triangle from `close_q90_price` / `close_q10_price`).
2. **Candle width formula** — `viewRangeMin`-based.
3. **xMax always ≥ CLOSE_MS** — so wedges render fully.
4. **Empty-HISTORY graceful fallback** — q90 / q10 / median → last close
   when `HISTORY` is empty (pre-prediction window or fast smoke runs).
5. **PANIC_ALERT cutoff filtering** — events at `min_of_day > cutoff_min`
   are dropped during replay.
6. **Replay export pad to 13:30** — `build_explorer` pads OHLC with the
   closing-auction price.
