// Shared utilities + design tokens across all variants
// Loaded after data + design-canvas, before each variant.
(function () {
  const { useEffect, useRef, useState, useMemo } = React;

  // ── Palette ── (Bloomberg-ish but for Taiwan stock context)
  const PAL = {
    bg:          '#000000',
    bgPanel:     '#0a0a0a',
    bgPanelAlt:  '#111111',
    border:      '#262626',
    borderHi:    '#3a3a3a',
    chrome:      '#f0a030',   // amber — labels, headers, "GO" prompt
    chromeDim:   '#a8771f',
    text:        '#e8e8e8',
    textDim:     '#888888',
    textFaint:   '#555555',
    up:          '#ef4444',   // Taiwan: red = up
    down:        '#22c55e',
    upDim:       '#7a2424',
    downDim:     '#1f5a32',
    cone:        '#c084fc',   // median estimate
    coneFill:    'rgba(192, 132, 252, 0.10)',
    q90:         '#ef4444',
    q10:         '#22c55e',
    q50:         '#fbbf24',
    cyan:        '#67e8f9',
    warn:        '#fb923c',
    alert:       '#ef4444',
    cloudFill:   'rgba(200,200,200,0.08)',
    grid:        '#1f1f1f',
    selBg:       '#1a1206',
  };
  window.PAL = PAL;

  // ── Format helpers ──
  const fmt = {
    int: (n) => n == null ? '—' : Math.round(n).toLocaleString('en-US'),
    dec: (n, d = 2) => n == null ? '—' : Number(n).toFixed(d),
    pct: (n, d = 2) => n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d) + '%',
    signed: (n, d = 0) => n == null ? '—' : (n >= 0 ? '+' : '') + Number(n).toFixed(d),
    time: (ts) => ts ? ts.slice(11, 16) : '—',
    timeSec: (ts) => ts ? ts.slice(11, 19) : '—',
  };
  window.fmt = fmt;

  // ── Derived market state ──
  function deriveState(data) {
    const ohlc = data.OHLC;
    const n = ohlc.ts.length;
    const lastIdx = n - 1;
    const open = ohlc.open[0];
    const last = ohlc.close[lastIdx];
    const dayHigh = Math.max(...ohlc.high);
    const dayLow = Math.min(...ohlc.low);
    const range = dayHigh - dayLow;
    const rangePct = (range / open) * 100;
    const fromOpen = ((last - open) / open) * 100;
    const lastTs = ohlc.ts[lastIdx];
    const lastTime = lastTs.slice(11, 16);

    // Pre-prediction window (e.g. 09:00-09:34 on Monday before first model
    // signal): HISTORY is empty. Fall back to OHLC-only state so the chart
    // and KPI panels still render.
    const lastHist = data.HISTORY && data.HISTORY.length > 0
      ? data.HISTORY[data.HISTORY.length - 1]
      : null;
    let q90, q10, median, lastSignalTime;
    if (lastHist) {
      q90 = lastHist.signal_close * (1 + lastHist.close_q90_pct / 100);
      q10 = lastHist.signal_close * (1 + lastHist.close_q10_pct / 100);
      median = lastHist.signal_close * (1 + (lastHist.close_q50_h_pct + lastHist.close_q50_l_pct) / 200);
      lastSignalTime = lastHist.signal_time;
    } else {
      q90 = last; q10 = last; median = last;
      lastSignalTime = '—';
    }
    const panic = data.PANIC?.[0]?.panic_index || 0;

    return {
      open, last, lastTs, lastTime, dayHigh, dayLow, range, rangePct, fromOpen,
      q90, q10, median, panic, lastSignalTime,
    };
  }
  window.deriveState = deriveState;

  // ── Plotly default layout factory ──
  function plotlyDarkLayout(opts = {}) {
    return {
      paper_bgcolor: PAL.bgPanel,
      plot_bgcolor: PAL.bgPanel,
      font: { color: PAL.text, family: 'JetBrains Mono, IBM Plex Mono, monospace', size: 10 },
      margin: { t: 8, l: 50, r: 10, b: 24, ...(opts.margin || {}) },
      xaxis: { gridcolor: PAL.grid, linecolor: PAL.border, tickcolor: PAL.border,
               zerolinecolor: PAL.grid, ...(opts.xaxis || {}) },
      yaxis: { gridcolor: PAL.grid, linecolor: PAL.border, tickcolor: PAL.border,
               zerolinecolor: PAL.grid, ...(opts.yaxis || {}) },
      hovermode: 'x unified',
      showlegend: opts.showlegend ?? false,
      dragmode: 'pan',
      shapes: opts.shapes || [],
      annotations: opts.annotations || [],
      ...opts.extra,
    };
  }
  window.plotlyDarkLayout = plotlyDarkLayout;

  // ── Aggregate 1-min OHLC to N-min bars ──
  function aggregateOHLC(ohlc, minutes) {
    if (minutes <= 1) return ohlc;
    const n = ohlc.ts.length;
    const ts = [], open = [], high = [], low = [], close = [], volume = [];
    let i = 0;
    while (i < n) {
      const j = Math.min(i + minutes, n);
      ts.push(ohlc.ts[i]);
      open.push(ohlc.open[i]);
      high.push(Math.max(...ohlc.high.slice(i, j)));
      low.push(Math.min(...ohlc.low.slice(i, j)));
      close.push(ohlc.close[j - 1]);
      if (ohlc.volume) {
        volume.push(ohlc.volume.slice(i, j).reduce((a, b) => a + b, 0));
      }
      i = j;
    }
    return { ts, open, high, low, close, volume: ohlc.volume ? volume : undefined };
  }
  window.aggregateOHLC = aggregateOHLC;

  // ── Common React hook: mount a plotly chart ──
  function usePlotly(buildTraces, buildLayout, deps) {
    const ref = useRef(null);
    useEffect(() => {
      if (!ref.current) return;
      const traces = buildTraces();
      const layout = buildLayout();
      window.Plotly.newPlot(ref.current, traces, layout,
        { responsive: true, displaylogo: false, displayModeBar: false }
      );
      return () => { try { window.Plotly.purge(ref.current); } catch (e) {} };
    }, deps);
    return ref;
  }
  window.usePlotly = usePlotly;

  // ── Main candlestick + cone traces builder (shared by variants) ──
  function mainChartTraces(data, opts = {}) {
    const ohlc = opts.ohlc || data.OHLC;
    const traces = [];
    traces.push({
      type: 'candlestick',
      x: ohlc.ts, open: ohlc.open, high: ohlc.high,
      low: ohlc.low, close: ohlc.close,
      name: 'TAIEX',
      increasing: { line: { color: PAL.up, width: 1 }, fillcolor: PAL.up },
      decreasing: { line: { color: PAL.down, width: 1 }, fillcolor: PAL.down },
      showlegend: false,
      hoverlabel: { font: { family: 'JetBrains Mono, monospace', size: 11 } },
    });
    if (data.HISTORY?.length) {
      const tsCol = data.HISTORY.map(r => r.ts);
      traces.push({ name: 'q10', x: tsCol, y: data.HISTORY.map(r => r.close_q10_price),
        type: 'scatter', mode: 'lines', line: { color: PAL.q10, width: 1.5 }, showlegend: false });
      traces.push({ name: 'q90', x: tsCol, y: data.HISTORY.map(r => r.close_q90_price),
        type: 'scatter', mode: 'lines', line: { color: PAL.q90, width: 1.5 },
        fill: 'tonexty', fillcolor: PAL.cloudFill, showlegend: false });
      if (opts.showQ50 !== false) {
        traces.push({ name: 'q50H', x: tsCol,
          y: data.HISTORY.map(r => r.signal_close * (1 + r.close_q50_h_pct / 100)),
          type: 'scatter', mode: 'lines', line: { color: PAL.q50, width: 1, dash: 'dash' }, showlegend: false });
        traces.push({ name: 'q50L', x: tsCol,
          y: data.HISTORY.map(r => r.signal_close * (1 + r.close_q50_l_pct / 100)),
          type: 'scatter', mode: 'lines', line: { color: PAL.q50, width: 1, dash: 'dash' }, showlegend: false });
      }
      traces.push({ name: '★median', x: tsCol,
        y: data.HISTORY.map(r => r.signal_close * (1 + (r.close_q50_h_pct + r.close_q50_l_pct) / 200)),
        type: 'scatter', mode: 'lines', line: { color: PAL.cone, width: 2.5 }, showlegend: false });
    }
    return traces;
  }
  window.mainChartTraces = mainChartTraces;

  // ── Event shapes/annotations ──
  function eventShapesAndAnnotations(events, opts = {}) {
    const shapes = [], annotations = [];
    events.forEach((e) => {
      const color = e.level === 'high' ? PAL.alert : PAL.warn;
      if (e.level === 'high' && e.y !== null) {
        annotations.push({
          x: e.ts, y: e.y, text: '⚠ ' + e.kind,
          showarrow: true, arrowhead: 2, arrowsize: 1.2, arrowwidth: 1.5,
          arrowcolor: color, ax: 0, ay: e.kind.includes('LOW') ? 32 : -32,
          font: { size: 10, color, family: 'JetBrains Mono, monospace' },
          bgcolor: '#000', bordercolor: color, borderwidth: 1, borderpad: 2,
        });
        const ts = new Date(e.ts);
        const x0 = new Date(ts.getTime() - 30000).toISOString();
        const x1 = new Date(ts.getTime() + 30000).toISOString();
        shapes.push({ type: 'rect', x0, x1, yref: 'paper', y0: 0, y1: 1,
          line: { width: 0 }, fillcolor: color, opacity: 0.08 });
      } else if (e.level === 'high') {
        annotations.push({
          x: e.ts, y: 1, yref: 'paper', text: '⚠ ' + e.kind,
          showarrow: false, font: { size: 9, color, family: 'JetBrains Mono, monospace' },
          bgcolor: '#000', bordercolor: color, borderwidth: 1, borderpad: 2,
          textangle: -25,
        });
      } else if (e.level === 'med' && e.y !== null && opts.medDots !== false) {
        annotations.push({
          x: e.ts, y: e.y, text: '●', showarrow: false,
          font: { size: 10, color: PAL.warn }, borderpad: 1,
        });
      }
    });
    return { shapes, annotations };
  }
  window.eventShapesAndAnnotations = eventShapesAndAnnotations;

  // ── A blinky cursor for live indicators ──
  function useBlink(ms = 1000) {
    const [on, setOn] = useState(true);
    useEffect(() => {
      const id = setInterval(() => setOn(o => !o), ms);
      return () => clearInterval(id);
    }, [ms]);
    return on;
  }
  window.useBlink = useBlink;

  // ── Draggable panel layout (V4 PR #2) ──
  // localStorage key for all panel positions in V4.
  const LAYOUT_STORAGE_KEY = 'v4.layout.v1';
  window.LAYOUT_STORAGE_KEY = LAYOUT_STORAGE_KEY;

  function loadLayout() {
    try { return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveLayout(layout) {
    try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)); }
    catch (e) { console.warn('[layout] save failed', e); }
  }
  function resetLayout() {
    try { localStorage.removeItem(LAYOUT_STORAGE_KEY); } catch {}
    window.dispatchEvent(new Event('LAYOUT_RESET'));
  }
  window.resetLayout = resetLayout;

  // useDraggable(id, defaultPos)
  //   defaultPos: { top?, left?, right?, bottom? } — matches the panel's
  //   original `position: absolute` coords. Returns { style, onPointerDown, ref }.
  //   - `style` is spread onto the panel's root.
  //   - `onPointerDown` attaches to the drag handle.
  //   - `ref` is attached to the panel root so we can measure its rect on first drag.
  // Behavior:
  //   - Pointer down on handle captures the pointer and starts a drag.
  //   - Pointer move offsets x/y relative to drag start.
  //   - On pointer up: persist the final {x, y} to localStorage[id].
  //   - If localStorage has a saved {x, y}, it overrides defaultPos.
  //   - Position is clamped so ≥40px of panel stays inside the viewport.
  //   - Listens for window 'LAYOUT_RESET' to clear the override.
  function useDraggable(id, defaultPos) {
    const [override, setOverride] = useState(() => loadLayout()[id] || null);
    const overrideRef = useRef(override);
    overrideRef.current = override;
    const panelRef = useRef(null);
    const dragRef = useRef(null);

    useEffect(() => {
      const onReset = () => setOverride(null);
      window.addEventListener('LAYOUT_RESET', onReset);
      return () => window.removeEventListener('LAYOUT_RESET', onReset);
    }, []);

    const onPointerDown = (e) => {
      // Only respond to primary button / single-touch.
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      // Resolve base (x, y) in left/top pixel space.
      let baseX, baseY;
      if (overrideRef.current) {
        baseX = overrideRef.current.x;
        baseY = overrideRef.current.y;
      } else if (panelRef.current) {
        // First drag from default position: read the panel's current rect.
        // getBoundingClientRect returns viewport-relative coords, which match
        // `position: absolute` when the offset parent is the viewport-sized stage.
        const r = panelRef.current.getBoundingClientRect();
        baseX = r.left;
        baseY = r.top;
      } else {
        baseX = 0; baseY = 0;
      }

      dragRef.current = { startX: e.clientX, startY: e.clientY, baseX, baseY };

      const target = e.currentTarget;
      const pointerId = e.pointerId;
      try { target.setPointerCapture(pointerId); } catch {}

      const onMove = (ev) => {
        const d = dragRef.current;
        if (!d) return;
        let x = d.baseX + (ev.clientX - d.startX);
        let y = d.baseY + (ev.clientY - d.startY);
        // Keep at least 40px of the panel inside the viewport.
        x = Math.max(-9999, Math.min(window.innerWidth - 40, x));
        y = Math.max(0, Math.min(window.innerHeight - 40, y));
        setOverride({ x, y });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        try { target.releasePointerCapture(pointerId); } catch {}
        // Persist whatever the latest override is.
        const finalPos = overrideRef.current;
        if (finalPos) {
          const layout = loadLayout();
          layout[id] = finalPos;
          saveLayout(layout);
        }
        dragRef.current = null;
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    // When override is active, force left/top pixel coords and null out the
    // right/bottom anchors from defaultPos so the panel doesn't fight itself.
    const style = override
      ? { position: 'absolute', left: override.x, top: override.y, right: 'auto', bottom: 'auto' }
      : { position: 'absolute', ...defaultPos };

    return { style, onPointerDown, ref: panelRef };
  }
  window.useDraggable = useDraggable;

  // DragHandle — style helper for the grab area inside a panel header.
  // Spread onto a <div> (or pass through {...DragHandle.style}). Consumers
  // wire the {onPointerDown} from useDraggable onto the same element.
  const DragHandle = {
    style: {
      cursor: 'grab',
      userSelect: 'none',
      touchAction: 'none',  // critical: lets pointermove fire on touch devices
      WebkitUserSelect: 'none',
    },
    activeStyle: { cursor: 'grabbing' },
  };
  window.DragHandle = DragHandle;

  // ── Timeframe button group (shared across variants) ──
  function TimeframeTabs({ value, onChange, options = [1, 5, 15], style = {} }) {
    return (
      <div style={{ display: 'inline-flex', gap: 1, background: PAL.border, padding: 1, ...style }}>
        {options.map(o => (
          <button key={o}
            onClick={() => onChange(o)}
            style={{
              background: value === o ? PAL.chrome : PAL.bgPanel,
              color: value === o ? '#000' : PAL.textDim,
              border: 'none', padding: '3px 10px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 600,
              cursor: 'pointer', letterSpacing: 0.5,
            }}>
            {o}M
          </button>
        ))}
      </div>
    );
  }
  window.TimeframeTabs = TimeframeTabs;
})();
