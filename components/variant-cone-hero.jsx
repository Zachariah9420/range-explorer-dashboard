// V4 · Cone-as-Hero — the prediction cone is the visual centerpiece.
// Full-bleed SVG hero, HUD-style floating overlays, dramatic breach moment.
(function () {
  const { useState, useMemo, useRef, useEffect, useCallback } = React;
  const fmt = window.fmt;

  const C = {
    bg:       '#000000',
    bgSoft:   '#060606',
    glass:    'rgba(12,12,18,0.78)',
    glassHi:  'rgba(20,20,30,0.92)',
    border:   'rgba(255,255,255,0.08)',
    borderHi: 'rgba(255,255,255,0.18)',
    text:     '#f3f4f8',
    textDim:  '#7a8093',
    textFaint:'#454a5c',
    chrome:   '#e5b25f',
    up:       '#ff3b54',
    down:     '#22c55e',
    cone:     '#c084fc',
    coneSoft: 'rgba(192,132,252,0.35)',
    q90:      '#ff3b54',
    q10:      '#22c55e',
    q50:      '#fbbf24',
    alert:    '#ff3b54',
    warn:     '#fb923c',
  };

  const styles = {
    root: {
      width: '100%', height: '100%', background: C.bg, color: C.text,
      fontFamily: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
      fontSize: 12, position: 'relative', overflow: 'hidden',
    },
    mono: { fontFamily: '"JetBrains Mono", monospace', fontVariantNumeric: 'tabular-nums' },
    glassCard: {
      background: C.glass,
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: `1px solid ${C.border}`, borderRadius: 8,
      padding: 12,
    },
  };

  // ── Hero SVG chart with zoom/pan ──
  // Day boundary derived from data.asOfDate so it works for any trading day.
  function getDayBounds(data) {
    const date = data?.asOfDate || (data?.OHLC?.ts?.[0]?.slice(0, 10)) || '2026-05-15';
    return {
      DAY: date,
      DATA_START_MS: new Date(`${date}T09:00:00`).getTime(),
      DATA_END_MS:   new Date(`${date}T13:30:00`).getTime(),
      CLOSE_MS:      new Date(`${date}T13:24:00`).getTime(),
    };
  }
  const MIN_RANGE_MS = 5 * 60 * 1000; // can't zoom tighter than 5min

  // Fallback constants for initial state if data not loaded yet
  const _today = new Date().toISOString().slice(0, 10);
  const DATA_START_MS = new Date(`${_today}T09:00:00`).getTime();
  const DATA_END_MS   = new Date(`${_today}T13:30:00`).getTime();

  function HeroCone({ data, width, height, view, setView }) {
    // Day-aware bounds for this dataset
    const { DATA_START_MS, DATA_END_MS, CLOSE_MS } = getDayBounds(data);

    // Layout the chart into the SVG (tightened padding to fill more of viewport)
    const padding = { top: 28, right: 80, bottom: 36, left: 56 };
    const W = Math.max(120, width - padding.left - padding.right);
    const H = Math.max(120, height - padding.top - padding.bottom);

    const ohlc = data.OHLC;
    const xMin = view.xMin, xMax = view.xMax;
    const xms = (ts) => new Date(ts).getTime();

    // Visible bars and history (with small padding for partials)
    const visibleOhlcIdx = [];
    for (let i = 0; i < ohlc.ts.length; i++) {
      const t = xms(ohlc.ts[i]);
      if (t >= xMin - 60000 && t <= xMax + 60000) visibleOhlcIdx.push(i);
    }
    const visibleHistory = data.HISTORY.filter(r => {
      const t = xms(r.ts);
      return t >= xMin - 60000 && t <= xMax + 60000;
    });

    // Auto Y domain from visible data
    const prices = [ohlc.open[0]];
    for (const i of visibleOhlcIdx) prices.push(ohlc.high[i], ohlc.low[i]);
    for (const r of visibleHistory) prices.push(r.close_q10_price, r.close_q90_price, r.signal_close);
    if (CLOSE_MS >= xMin && CLOSE_MS <= xMax && data.HISTORY?.length) {
      const last = data.HISTORY[data.HISTORY.length - 1];
      prices.push(last.close_q10_price, last.close_q90_price);
    }
    let pMin = Math.min(...prices);
    let pMax = Math.max(...prices);
    if (!isFinite(pMin) || !isFinite(pMax)) { pMin = 41000; pMax = 42500; }
    const yPad = (pMax - pMin) * 0.06 + 8;
    pMin -= yPad; pMax += yPad;

    const xScale = (ms) => ((ms - xMin) / (xMax - xMin)) * W;
    const yScale = (p)  => H - ((p - pMin) / (pMax - pMin)) * H;
    const tx = (ts) => xScale(xms(ts));

    // Wedges
    const wedges = data.HISTORY.map((r) => {
      const sx = xScale(xms(r.ts));
      const sy = yScale(r.signal_close);
      const cx = xScale(CLOSE_MS);
      const cy10 = yScale(r.close_q10_price);
      const cy90 = yScale(r.close_q90_price);
      return { sx, sy, cx, cy10, cy90, r };
    });

    // Candle width = pixel-width of one minute of view * 0.65 (snug but not touching).
    // Previously used `W / max(40, visibleBars)` which made candles fat when few
    // bars existed in a wide view (e.g. early replay frames: 30 bars in 09:00-13:30
    // view → candles ~4× wider than 1-min spacing → severe overlap).
    const viewRangeMin = Math.max(1, (xMax - xMin) / 60000);
    const candleWidth = Math.max(1.5, Math.min(18, (W / viewRangeMin) * 0.65));

    // Y ticks — dynamic step
    const yRange = pMax - pMin;
    let yStep = 200;
    if (yRange < 80)  yStep = 10;
    else if (yRange < 200)  yStep = 25;
    else if (yRange < 400)  yStep = 50;
    else if (yRange < 800)  yStep = 100;
    else if (yRange < 1600) yStep = 200;
    else yStep = 500;
    const yTicks = [];
    for (let p = Math.ceil(pMin / yStep) * yStep; p <= pMax; p += yStep) yTicks.push(p);

    // X ticks — dynamic step
    const rangeMin = (xMax - xMin) / 60000;
    let xStep = 60;
    if (rangeMin < 15) xStep = 1;
    else if (rangeMin < 30) xStep = 5;
    else if (rangeMin < 90) xStep = 10;
    else if (rangeMin < 180) xStep = 30;
    const xTicks = [];
    const xStart = Math.ceil(xMin / (xStep * 60000)) * xStep * 60000;
    for (let t = xStart; t <= xMax; t += xStep * 60000) {
      const d = new Date(t);
      const label = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      xTicks.push({ x: xScale(t), label });
    }

    // Events
    const highEvents = data.EVENTS.filter(e => e.level === 'high');
    const open = ohlc.open[0];
    const lastIdx = ohlc.close.length - 1;
    const lastClose = ohlc.close[lastIdx];
    const lastClosePtVisible = xms(ohlc.ts[lastIdx]) >= xMin && xms(ohlc.ts[lastIdx]) <= xMax;

    // Pre-prediction window (09:00-09:34): HISTORY is empty. Fall back to
    // last actual close so the chart renders something instead of crashing.
    const lastHist = data.HISTORY?.length ? data.HISTORY[data.HISTORY.length - 1] : null;
    const lastMedianPrice = lastHist
      ? lastHist.signal_close * (1 + (lastHist.close_q50_h_pct + lastHist.close_q50_l_pct) / 200)
      : lastClose;
    const lastQ90Price = lastHist
      ? lastHist.signal_close * (1 + lastHist.close_q90_pct / 100)
      : lastClose;
    const lastQ10Price = lastHist
      ? lastHist.signal_close * (1 + lastHist.close_q10_pct / 100)
      : lastClose;
    const closeColVisible = CLOSE_MS >= xMin && CLOSE_MS <= xMax;

    // ── Interaction handlers ──
    const svgRef = useRef(null);
    const dragRef = useRef(null);
    const [cursor, setCursor] = useState(null); // {x, y, ms, price}
    const [hoverIdx, setHoverIdx] = useState(null); // nearest candle index

    const clientToMs = (clientX) => {
      const rect = svgRef.current.getBoundingClientRect();
      const localX = clientX - rect.left - padding.left;
      return xMin + (localX / W) * (xMax - xMin);
    };

    // Non-passive wheel for preventDefault
    useEffect(() => {
      const el = svgRef.current;
      if (!el) return;
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const factor = e.deltaY < 0 ? 0.78 : 1.28;
        const cursorMs = clientToMs(e.clientX);
        let newMin = cursorMs - (cursorMs - xMin) * factor;
        let newMax = cursorMs + (xMax - cursorMs) * factor;
        const range = newMax - newMin;
        if (range < MIN_RANGE_MS) return;
        if (range > DATA_END_MS - DATA_START_MS) {
          newMin = DATA_START_MS; newMax = DATA_END_MS;
        } else {
          if (newMin < DATA_START_MS) { newMax += DATA_START_MS - newMin; newMin = DATA_START_MS; }
          if (newMax > DATA_END_MS)   { newMin -= newMax - DATA_END_MS;   newMax = DATA_END_MS; }
        }
        setView({ xMin: newMin, xMax: newMax });
      };
      el.addEventListener('wheel', handler, { passive: false });
      return () => el.removeEventListener('wheel', handler);
    }, [xMin, xMax, W]);

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, sMin: xMin, sMax: xMax };
    };
    const onPointerMove = (e) => {
      // Update cursor coords for hover crosshair
      const rect = svgRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left - padding.left;
      const localY = e.clientY - rect.top - padding.top;
      if (localX >= 0 && localX <= W && localY >= 0 && localY <= H) {
        const ms = xMin + (localX / W) * (xMax - xMin);
        const price = pMin + ((H - localY) / H) * (pMax - pMin);
        setCursor({ x: localX, y: localY, ms, price });
        // Find nearest candle in visibleOhlcIdx by time
        let best = -1, bestDist = Infinity;
        for (const i of visibleOhlcIdx) {
          const d = Math.abs(xms(ohlc.ts[i]) - ms);
          if (d < bestDist) { bestDist = d; best = i; }
        }
        setHoverIdx(best >= 0 ? best : null);
      } else {
        setCursor(null);
        setHoverIdx(null);
      }
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const range = dragRef.current.sMax - dragRef.current.sMin;
      const dt = -(dx / W) * range;
      let newMin = dragRef.current.sMin + dt;
      let newMax = dragRef.current.sMax + dt;
      if (newMin < DATA_START_MS) { newMax += DATA_START_MS - newMin; newMin = DATA_START_MS; }
      if (newMax > DATA_END_MS)   { newMin -= newMax - DATA_END_MS;   newMax = DATA_END_MS; }
      setView({ xMin: newMin, xMax: newMax });
    };
    const onPointerUp = (e) => {
      if (dragRef.current) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
        dragRef.current = null;
      }
    };
    const onDoubleClick = (e) => {
      e.stopPropagation();
      setView({ xMin: DATA_START_MS, xMax: DATA_END_MS });
    };
    const onPointerLeave = () => { setCursor(null); setHoverIdx(null); };

    // Cursor crosshair labels
    const cursorTimeLabel = cursor ? (() => {
      const d = new Date(cursor.ms);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    })() : '';

    return (
      <svg ref={svgRef} width={width} height={height}
        style={{ position: 'absolute', inset: 0, cursor: dragRef.current ? 'grabbing' : 'crosshair', userSelect: 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          {/* Cone gradient: median (purple) at apex, fades to red/green at close */}
          <radialGradient id="coneFan" cx="100%" cy="50%" r="100%">
            <stop offset="0%"  stopColor={C.cone} stopOpacity="0.45" />
            <stop offset="60%" stopColor={C.cone} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.cone} stopOpacity="0.04" />
          </radialGradient>
          {/* glow for breach */}
          <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" />
          </filter>
          {/* Up envelope outline */}
          <linearGradient id="q90grad" x1="0" x2="1">
            <stop offset="0%" stopColor={C.q90} stopOpacity="0.0" />
            <stop offset="80%" stopColor={C.q90} stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="q10grad" x1="0" x2="1">
            <stop offset="0%" stopColor={C.q10} stopOpacity="0.0" />
            <stop offset="80%" stopColor={C.q10} stopOpacity="0.8" />
          </linearGradient>
        </defs>

        {/* Transparent capture rect for empty-space pointer events */}
        <rect x={padding.left} y={padding.top} width={W} height={H} fill="transparent" />

        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Clipping for chart contents */}
          <defs>
            <clipPath id="chartClip"><rect x={0} y={0} width={W} height={H} /></clipPath>
          </defs>
          {/* Grid */}
          {yTicks.map((p) => (
            <g key={p}>
              <line x1={0} x2={W} y1={yScale(p)} y2={yScale(p)} stroke="#13141c" strokeWidth={1} />
              <text x={-8} y={yScale(p) + 3} fill={C.textFaint} fontSize={10} textAnchor="end"
                fontFamily="JetBrains Mono, monospace">{fmt.int(p)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <g key={i}>
              <line x1={t.x} x2={t.x} y1={0} y2={H} stroke="#0d0e15" strokeWidth={1} />
              <text x={t.x} y={H + 18} fill={C.textFaint} fontSize={10} textAnchor="middle"
                fontFamily="JetBrains Mono, monospace">{t.label}</text>
            </g>
          ))}

          {/* Open price reference */}
          <line x1={0} x2={W} y1={yScale(open)} y2={yScale(open)}
            stroke={C.chrome} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="2 4" />
          <text x={W + 4} y={yScale(open) + 3} fill={C.chrome} fontSize={9}
            fontFamily="JetBrains Mono, monospace">open {fmt.int(open)}</text>

          {/* Previous-day close reference line (cyan, dotted) — gives the
              operator a sense of today's intraday move relative to where
              yesterday settled. Only drawn when prev_close is in the y view. */}
          {data.prev_close != null && data.prev_close >= pMin && data.prev_close <= pMax && (
            <g>
              <line x1={0} x2={W} y1={yScale(data.prev_close)} y2={yScale(data.prev_close)}
                stroke="#67e8f9" strokeOpacity={0.45} strokeWidth={1} strokeDasharray="1 3" />
              <text x={W + 4} y={yScale(data.prev_close) + 3} fill="#67e8f9" fontSize={9}
                fontFamily="JetBrains Mono, monospace">prev {fmt.int(data.prev_close)}</text>
            </g>
          )}

          {/* Cone wedges — every triangle from sig point to close q10/q90.
              Latest wedge gets bumped opacity so single-signal pre-10:00
              cone is actually visible. */}
          <g style={{ mixBlendMode: 'screen' }}>
            {wedges.map((w, i) => {
              const isLatest = i === wedges.length - 1;
              return (
                <polygon key={i}
                  points={`${w.sx},${w.sy} ${w.cx},${w.cy90} ${w.cx},${w.cy10}`}
                  fill={C.cone} fillOpacity={isLatest ? 0.12 : 0.045}
                  stroke="none"
                />
              );
            })}
          </g>

          {/* Outer q90 envelope line — only when at least one signal exists */}
          {wedges.length > 0 && (
          <path
            d={wedges.map((w, i) => (i === 0 ? `M ${w.sx} ${w.sy}` : `L ${w.sx} ${w.sy}`)).join(' ') +
               ` L ${wedges[wedges.length-1].cx} ${wedges[wedges.length-1].cy90}` +
               ` ` + [...wedges].reverse().map(w => `L ${w.sx} ${yScale(w.r.signal_close * (1 + w.r.close_q90_pct/100))}`).join(' ') + ' Z'}
            fill="url(#coneFan)" stroke="none"
          />
          )}

          {/* q90 line through history */}
          <polyline
            points={data.HISTORY.map(r => `${tx(r.ts)},${yScale(r.close_q90_price)}`).join(' ')}
            fill="none" stroke={C.q90} strokeWidth={1.4} strokeOpacity={0.85}
          />
          {/* q10 line */}
          <polyline
            points={data.HISTORY.map(r => `${tx(r.ts)},${yScale(r.close_q10_price)}`).join(' ')}
            fill="none" stroke={C.q10} strokeWidth={1.4} strokeOpacity={0.85}
          />
          {/* Median line (★) */}
          <polyline
            points={data.HISTORY.map(r => {
              const m = r.signal_close * (1 + (r.close_q50_h_pct + r.close_q50_l_pct) / 200);
              return `${tx(r.ts)},${yScale(m)}`;
            }).join(' ')}
            fill="none" stroke={C.cone} strokeWidth={2.5}
            filter="url(#softGlow)"
          />

          {/* Candlesticks (visible only) */}
          <g clipPath="url(#chartClip)">
            {visibleOhlcIdx.map((i) => {
              const x = tx(ohlc.ts[i]);
              const o = ohlc.open[i], cl = ohlc.close[i], h = ohlc.high[i], l = ohlc.low[i];
              const up = cl >= o;
              const yO = yScale(o), yC = yScale(cl), yH = yScale(h), yL = yScale(l);
              const top = Math.min(yO, yC), bodyH = Math.max(1, Math.abs(yO - yC));
              const color = up ? C.up : C.down;
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={yH} y2={yL} stroke={color} strokeWidth={Math.min(1.4, Math.max(0.6, candleWidth * 0.15))} strokeOpacity={0.95} />
                  <rect x={x - candleWidth / 2} y={top}
                    width={candleWidth} height={bodyH}
                    fill={color} fillOpacity={up ? 0.9 : 0.85} />
                </g>
              );
            })}
          </g>

          {/* HIGH events as glowing markers + labels (visible only) */}
          {highEvents.map((e, i) => {
            if (!e.y) return null;
            const eMs = xms(e.ts);
            if (eMs < xMin || eMs > xMax) return null;
            const x = tx(e.ts);
            const y = yScale(e.y);
            const label = e.kind;
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={8} fill={C.alert} fillOpacity={0.18} filter="url(#glowRed)" />
                <circle cx={x} cy={y} r={4} fill={C.alert} />
                <line x1={x} x2={x} y1={y} y2={y + 36} stroke={C.alert} strokeWidth={1} strokeDasharray="2 2" />
                <g transform={`translate(${x - 80}, ${y + 36})`}>
                  <rect width={160} height={24} fill="#000" stroke={C.alert} strokeWidth={1} rx={2} />
                  <text x={6} y={10} fill={C.alert} fontSize={9} fontFamily="JetBrains Mono, monospace" fontWeight={700}>⚠ {label}</text>
                  <text x={6} y={20} fill={C.text} fontSize={9} fontFamily="'Noto Sans TC', sans-serif">{e.msg.slice(0, 26)}</text>
                </g>
              </g>
            );
          })}

          {/* Volume bars — bottom 12% strip, only when ohlc.volume present
              (Shioaji always sends it; older mock payloads may not).
              Color matches each bar's up/down direction. */}
          {ohlc.volume && (() => {
            const VOL_BAND = 0.12;           // 12% of H at bottom
            const VOL_TOP = H * (1 - VOL_BAND);
            const VOL_H   = H * VOL_BAND;
            const maxVol = Math.max(...visibleOhlcIdx.map(i => ohlc.volume[i] || 0));
            if (!isFinite(maxVol) || maxVol <= 0) return null;
            return (
              <g opacity={0.55} clipPath="url(#chartClip)">
                {visibleOhlcIdx.map(i => {
                  const v = ohlc.volume[i] || 0;
                  if (v <= 0) return null;
                  const x = tx(ohlc.ts[i]);
                  const bh = (v / maxVol) * VOL_H;
                  const up = ohlc.close[i] >= ohlc.open[i];
                  return (
                    <rect key={`v${i}`}
                      x={x - candleWidth / 2} y={VOL_TOP + (VOL_H - bh)}
                      width={Math.max(0.5, candleWidth)} height={bh}
                      fill={up ? C.up : C.down} fillOpacity={0.7}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* Last point marker (only if visible) */}
          {lastClosePtVisible && (
            <g>
              <circle cx={tx(ohlc.ts[lastIdx])} cy={yScale(lastClose)} r={6}
                fill={C.cone} fillOpacity={0.3} filter="url(#glowRed)" />
              <circle cx={tx(ohlc.ts[lastIdx])} cy={yScale(lastClose)} r={3.5} fill="#fff" />
              <text x={tx(ohlc.ts[lastIdx]) + 10} y={yScale(lastClose) - 8}
                fill="#fff" fontSize={11} fontFamily="JetBrains Mono, monospace" fontWeight={700}>
                {fmt.int(lastClose)}
              </text>
            </g>
          )}

          {/* Post-close actual marker — when the latest OHLC bar is at or
              past 13:24, the day has ended. Draw a yellow disc at the
              actual close price next to the prediction labels so the
              operator can eyeball model error at a glance. */}
          {closeColVisible && (() => {
            const lastTs = ohlc.ts[lastIdx];
            const lastMin = new Date(lastTs).getHours() * 60 + new Date(lastTs).getMinutes();
            const isPostClose = lastMin >= 804;   // 13:24 = last continuous bar
            if (!isPostClose) return null;
            const ax = xScale(CLOSE_MS);
            const ay = yScale(lastClose);
            const errFromMedian = lastClose - lastMedianPrice;
            const errPct = (errFromMedian / lastClose) * 100;
            return (
              <g>
                <circle cx={ax} cy={ay} r={7}
                  fill={C.chrome} fillOpacity={0.25} filter="url(#glowRed)" />
                <circle cx={ax} cy={ay} r={4} fill={C.chrome} stroke="#000" strokeWidth={1.5} />
                <g transform={`translate(${ax + 12}, ${ay + 4})`}>
                  <rect x={-2} y={-12} width={84} height={18}
                    fill="#000" stroke={C.chrome} strokeWidth={1} rx={2} />
                  <text x={2} y={1} fill={C.chrome} fontSize={10}
                    fontFamily="JetBrains Mono, monospace" fontWeight={700}>
                    actual {fmt.int(lastClose)}
                  </text>
                  <text x={2} y={11} fill={errPct >= 0 ? C.up : C.down} fontSize={8}
                    fontFamily="JetBrains Mono, monospace">
                    vs ★ {fmt.pct(errPct)}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* Right-side prediction labels at close (only if visible) */}
          {closeColVisible && (
          <g transform={`translate(${xScale(CLOSE_MS)}, 0)`}>
            <line x1={0} x2={0} y1={0} y2={H} stroke={C.cone} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="3 3" />
            <text x={-4} y={32} fill={C.cone} fontSize={9} fontFamily="JetBrains Mono, monospace" textAnchor="end">13:24 close</text>
            <g transform={`translate(2, ${yScale(lastQ90Price)})`}>
              <rect x={0} y={-9} width={64} height={16} fill="#000" stroke={C.q90} strokeWidth={1} />
              <text x={4} y={3} fill={C.q90} fontSize={10} fontWeight={700} fontFamily="JetBrains Mono, monospace">{fmt.int(lastQ90Price)}</text>
            </g>
            <g transform={`translate(2, ${yScale(lastMedianPrice)})`}>
              <rect x={0} y={-9} width={64} height={16} fill={C.cone} />
              <text x={4} y={3} fill="#000" fontSize={10} fontWeight={700} fontFamily="JetBrains Mono, monospace">★{fmt.int(lastMedianPrice)}</text>
            </g>
            <g transform={`translate(2, ${yScale(lastQ10Price)})`}>
              <rect x={0} y={-9} width={64} height={16} fill="#000" stroke={C.q10} strokeWidth={1} />
              <text x={4} y={3} fill={C.q10} fontSize={10} fontWeight={700} fontFamily="JetBrains Mono, monospace">{fmt.int(lastQ10Price)}</text>
            </g>
          </g>
          )}

          {/* Hovered candle highlight + tooltip */}
          {hoverIdx != null && cursor && (() => {
            const i = hoverIdx;
            const x = tx(ohlc.ts[i]);
            const o = ohlc.open[i], cl = ohlc.close[i], h = ohlc.high[i], l = ohlc.low[i];
            const yH = yScale(h), yL = yScale(l);
            const up = cl >= o;
            const ringColor = up ? C.up : C.down;
            // Change vs prev close
            const prev = i > 0 ? ohlc.close[i - 1] : ohlc.open[0];
            const chg = cl - prev;
            const chgPct = (chg / prev) * 100;
            // From open
            const fromOpen = ((cl - ohlc.open[0]) / ohlc.open[0]) * 100;
            // Find matching HISTORY signal (signal_time matches ohlc.ts HH:MM)
            const hhmm = ohlc.ts[i].slice(11, 16);
            const sig = data.HISTORY.find(r => r.signal_time === hhmm);
            const tooltipW = sig ? 220 : 180;
            const tooltipH = sig ? 160 : 112;
            // Tooltip position — keep on screen
            let tx0 = cursor.x + 16;
            let ty0 = cursor.y + 12;
            if (tx0 + tooltipW > W) tx0 = cursor.x - tooltipW - 16;
            if (ty0 + tooltipH > H) ty0 = cursor.y - tooltipH - 12;
            const timeLabel = ohlc.ts[i].slice(11, 16);
            return (
              <g pointerEvents="none">
                {/* Highlight ring around the candle */}
                <rect x={x - candleWidth / 2 - 3} y={yH - 3}
                  width={candleWidth + 6} height={Math.max(8, yL - yH + 6)}
                  fill="none" stroke={ringColor} strokeWidth={1.2} strokeOpacity={0.9} rx={2} />
                {/* Tooltip */}
                <g transform={`translate(${tx0}, ${ty0})`}>
                  <rect width={tooltipW} height={tooltipH}
                    fill="rgba(8,8,14,0.95)" stroke={C.borderHi} strokeWidth={1} rx={4} />
                  <g fontFamily="JetBrains Mono, monospace">
                    {/* header */}
                    <text x={10} y={16} fill={C.chrome} fontSize={11} fontWeight={700} letterSpacing={0.6}>{timeLabel}</text>
                    <text x={tooltipW - 10} y={16} fill={up ? C.up : C.down} fontSize={11} fontWeight={700} textAnchor="end">
                      {fmt.pct(chgPct)}
                    </text>
                    {/* divider */}
                    <line x1={8} x2={tooltipW - 8} y1={22} y2={22} stroke={C.border} />
                    {/* OHLC rows */}
                    <text x={10} y={36} fill={C.textDim} fontSize={10}>OPEN</text>
                    <text x={tooltipW - 10} y={36} fill={C.text} fontSize={11} fontWeight={600} textAnchor="end">{fmt.int(o)}</text>
                    <text x={10} y={50} fill={C.textDim} fontSize={10}>HIGH</text>
                    <text x={tooltipW - 10} y={50} fill={C.up} fontSize={11} fontWeight={600} textAnchor="end">{fmt.int(h)}</text>
                    <text x={10} y={64} fill={C.textDim} fontSize={10}>LOW</text>
                    <text x={tooltipW - 10} y={64} fill={C.down} fontSize={11} fontWeight={600} textAnchor="end">{fmt.int(l)}</text>
                    <text x={10} y={78} fill={C.textDim} fontSize={10}>CLOSE</text>
                    <text x={tooltipW - 10} y={78} fill={up ? C.up : C.down} fontSize={11} fontWeight={700} textAnchor="end">{fmt.int(cl)}</text>
                    {/* from open */}
                    <line x1={8} x2={tooltipW - 8} y1={84} y2={84} stroke={C.border} />
                    <text x={10} y={98} fill={C.textDim} fontSize={10}>from open</text>
                    <text x={tooltipW - 10} y={98} fill={fromOpen >= 0 ? C.up : C.down} fontSize={11} fontWeight={600} textAnchor="end">
                      {fmt.pct(fromOpen)}
                    </text>
                    {/* Signal cone (if matches a HISTORY signal) */}
                    {sig && (
                      <g>
                        <line x1={8} x2={tooltipW - 8} y1={106} y2={106} stroke={C.border} />
                        <text x={10} y={120} fill={C.cone} fontSize={10} fontWeight={700} letterSpacing={0.4}>★ SIGNAL → close cone</text>
                        <text x={10} y={134} fill={C.textDim} fontSize={9}>q90</text>
                        <text x={tooltipW - 10} y={134} fill={C.q90} fontSize={11} fontWeight={600} textAnchor="end">{fmt.int(sig.close_q90_price)}</text>
                        <text x={10} y={148} fill={C.textDim} fontSize={9}>q10</text>
                        <text x={tooltipW - 10} y={148} fill={C.q10} fontSize={11} fontWeight={600} textAnchor="end">{fmt.int(sig.close_q10_price)}</text>
                      </g>
                    )}
                  </g>
                </g>
              </g>
            );
          })()}

          {/* Cursor crosshair */}
          {cursor && (
            <g pointerEvents="none">
              <line x1={cursor.x} x2={cursor.x} y1={0} y2={H} stroke="#fff" strokeOpacity={0.25} strokeWidth={1} strokeDasharray="2 3" />
              <line x1={0} x2={W} y1={cursor.y} y2={cursor.y} stroke="#fff" strokeOpacity={0.18} strokeWidth={1} strokeDasharray="2 3" />
              {/* X label */}
              <g transform={`translate(${cursor.x}, ${H})`}>
                <rect x={-22} y={2} width={44} height={16} fill="#fff" />
                <text x={0} y={13} fill="#000" fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="JetBrains Mono, monospace">{cursorTimeLabel}</text>
              </g>
              {/* Y label */}
              <g transform={`translate(${W}, ${cursor.y})`}>
                <rect x={2} y={-9} width={54} height={16} fill="#fff" />
                <text x={6} y={3} fill="#000" fontSize={10} fontWeight={700} fontFamily="JetBrains Mono, monospace">{fmt.int(cursor.price)}</text>
              </g>
            </g>
          )}
        </g>
      </svg>
    );
  }

  // ── Radial panic gauge ──
  function PanicGauge({ value }) {
    const r = 56;
    const cx = 72, cy = 72;
    const startA = -210, endA = 30;
    const arc = (a1, a2, radius = r) => {
      const p = (a) => {
        const rad = (a * Math.PI) / 180;
        return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius];
      };
      const [x1, y1] = p(a1), [x2, y2] = p(a2);
      const large = a2 - a1 > 180 ? 1 : 0;
      return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
    };
    // map 0..25 to startA..endA
    const v = Math.min(25, value);
    const a = startA + (v / 25) * (endA - startA);
    const color = value >= 15 ? C.alert : value >= 8 ? C.warn : C.down;
    return (
      <svg width={144} height={144} viewBox="0 0 144 144">
        <defs>
          <linearGradient id="gaugeBg" x1="0" x2="1">
            <stop offset="0%"  stopColor={C.down} />
            <stop offset="50%" stopColor={C.warn} />
            <stop offset="100%" stopColor={C.alert} />
          </linearGradient>
        </defs>
        <path d={arc(startA, endA)} stroke="#1a1a1a" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d={arc(startA, endA)} stroke="url(#gaugeBg)" strokeWidth={10} fill="none" strokeLinecap="round" strokeOpacity={0.45} />
        <path d={arc(startA, a)} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" filter="url(#softGlow)" />
        <text x={cx} y={cy - 6} fill={color} fontSize={28} fontWeight={700} textAnchor="middle"
          fontFamily="JetBrains Mono, monospace">{value.toFixed(1)}</text>
        <text x={cx} y={cy + 14} fill={C.textDim} fontSize={9} textAnchor="middle" letterSpacing={1}
          fontFamily="JetBrains Mono, monospace">PANIC INDEX</text>
        <text x={cx} y={cy + 28} fill={color} fontSize={9} textAnchor="middle" fontWeight={700}
          fontFamily="JetBrains Mono, monospace">{value >= 15 ? '⚠ ALERT' : value >= 8 ? 'CAUTION' : 'CALM'}</text>
      </svg>
    );
  }

  // ── Stat block ──
  function Stat({ label, value, sub, color }) {
    return (
      <div>
        <div style={{ ...styles.mono, fontSize: 9, color: C.textFaint, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ ...styles.mono, fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
        {sub && <div style={{ ...styles.mono, fontSize: 10, color: C.textDim }}>{sub}</div>}
      </div>
    );
  }

  // ── HUD top bar ──
  function TopHud({ data, state }) {
    const blink = window.useBlink(800);
    return (
      <div style={{
        position: 'absolute', top: 16, left: 16, right: 16,
        display: 'flex', alignItems: 'center', gap: 18,
        zIndex: 5, pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>
            <span style={{ color: C.chrome }}>◆</span> TAIEX
          </span>
          <span style={{ fontSize: 11, color: C.textDim, ...styles.mono }}>
            Range Explorer · {data.asOfDate} · {data.asOf.slice(11)} · {data.signalsCount} signals
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{
          ...styles.mono, fontSize: 10, color: C.down,
          padding: '4px 12px', border: `1px solid ${C.down}44`, borderRadius: 99,
          background: `${C.down}10`, fontWeight: 600,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: C.down, opacity: blink ? 1 : 0.3 }} />
          LIVE · 30s
        </span>
      </div>
    );
  }

  // ── HUD overlays ──
  function HudKpis({ data, state }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const drag = window.useDraggable('hud-kpis', { top: 64, left: 16 });
    const idxColor = state.fromOpen >= 0 ? C.up : C.down;
    // q90/q10 source: prefer precomputed quotes block (PR #4); fall back to
    // deriveState values when payload predates PR #4 or HISTORY is empty.
    const q = data?.quotes;
    const q90Price = q?.q90_price ?? state.q90;
    const q10Price = q?.q10_price ?? state.q10;
    const q90Pct   = q?.q90_pct   ?? ((state.q90 / state.last - 1) * 100);
    const q10Pct   = q?.q10_pct   ?? ((state.q10 / state.last - 1) * 100);
    // PANIC tier color: ≥15 alert, ≥8 warn, 0 faint (calm), otherwise neutral.
    const panicColor = state.panic >= 15 ? C.alert
                     : state.panic >= 8  ? C.warn
                     : state.panic <= 0  ? C.textFaint
                     : C.text;
    const signalsCount = data?.signalsCount ?? 0;
    const Divider = () => <div style={{ width: 1, height: 40, background: C.border }} />;
    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        padding: collapsed ? '6px 10px' : '14px 18px',
        display: 'flex', gap: collapsed ? 8 : 16, alignItems: 'center',
        transition: 'padding 200ms, gap 200ms',
      }}>
        {collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.textFaint, letterSpacing: 0.6 }}>INDEX</span>
            <span style={{ ...styles.mono, fontSize: 16, fontWeight: 700, color: idxColor }}>{fmt.int(state.last)}</span>
            <span style={{ ...styles.mono, fontSize: 10, color: idxColor }}>{fmt.pct(state.fromOpen)}</span>
            <button onClick={() => setCollapsed(false)} style={{
              background: 'rgba(255,255,255,0.06)', color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '2px 6px', fontSize: 10, cursor: 'pointer',
              fontFamily: 'monospace', lineHeight: 1,
            }} title="展開">▶</button>
          </div>
        ) : (
          <>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11,
                           alignSelf: 'flex-start', padding: '0 2px', pointerEvents: 'auto' }}
                  title="拖曳移動">⋮⋮</span>
            <Stat label="實際 INDEX" value={fmt.int(state.last)} color={idxColor}
              sub={`${fmt.pct(state.fromOpen)} from open · ${state.lastTime}`} />
            <Divider />
            <Stat label="q90 上界" value={fmt.int(q90Price)} color={C.up}
              sub={fmt.pct(q90Pct) + ' from sig'} />
            <Divider />
            <Stat label="★ MEDIAN" value={fmt.int(state.median)} color={C.cone}
              sub={fmt.pct((state.median / state.last - 1) * 100) + ' from now'} />
            <Divider />
            <Stat label="q10 下界" value={fmt.int(q10Price)} color={C.down}
              sub={fmt.pct(q10Pct) + ' from sig'} />
            <Divider />
            <Stat label="DAY RANGE" value={fmt.int(state.range)}
              color={state.rangePct > 3 ? C.alert : C.text}
              sub={state.rangePct.toFixed(2) + '%'} />
            <Divider />
            <Stat label="PANIC" value={state.panic.toFixed(1)} color={panicColor}
              sub={state.panic >= 15 ? 'ALERT'
                 : state.panic >= 8  ? 'CAUTION'
                 : state.panic <= 0  ? 'CALM'
                 : 'WATCH'} />
            <Divider />
            <Stat label="SIGNALS" value={String(signalsCount)} color={C.chrome}
              sub="predictions today" />
            <button onClick={() => setCollapsed(true)} style={{
              background: 'rgba(255,255,255,0.06)', color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '2px 6px', fontSize: 10, cursor: 'pointer',
              fontFamily: 'monospace', lineHeight: 1,
              alignSelf: 'flex-start', marginLeft: 4, pointerEvents: 'auto',
            }} title="收起">◀</button>
          </>
        )}
      </div>
    );
  }

  // ── Right-side AI card ──
  function HudAi({ ai }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const drag = window.useDraggable('hud-ai', { top: 64, right: 16 });
    if (!ai) return null;
    // Confidence tier color: high (>=70%) green-ish, mid (40-70%) amber,
    // low (<40%) red. The pill is the most operator-relevant metric on
    // this card, so it gets a big number + tier label.
    const conf = ai.confidence ?? 0;
    const confPct = Math.round(conf * 100);
    const tier = conf >= 0.7 ? { c: C.down, lbl: '高' }
               : conf >= 0.4 ? { c: C.warn, lbl: '中' }
               :               { c: C.alert, lbl: '低' };
    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        width: collapsed ? 'auto' : 340,
        padding: collapsed ? '6px 10px' : '14px 16px',
        transition: 'width 200ms, padding 200ms',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8, pointerEvents: 'auto' }}>
          <span onPointerDown={drag.onPointerDown}
                style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                title="拖曳移動">⋮⋮</span>
          <span style={{ color: C.cone, fontSize: 14, fontWeight: 700 }}>★</span>
          <span style={{ ...styles.mono, fontSize: 9, color: C.cone, letterSpacing: 0.6, textTransform: 'uppercase' }}>AI 解讀</span>
          <div style={{ flex: 1 }} />
          {/* Promoted confidence badge — was 9px corner pill, now a tier-
              colored chunk so the operator sees model health at a glance */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 4,
            padding: '3px 8px', borderRadius: 4,
            background: `${tier.c}1a`, border: `1px solid ${tier.c}55`,
          }}>
            <span style={{ ...styles.mono, fontSize: 17, fontWeight: 700, color: tier.c, lineHeight: 1 }}>
              {confPct}%
            </span>
            <span style={{ ...styles.mono, fontSize: 9, color: tier.c, letterSpacing: 0.4 }}>
              信心{tier.lbl}
            </span>
          </div>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'monospace', lineHeight: 1, marginLeft: 4,
          }} title={collapsed ? '展開' : '收起'}>
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
        {!collapsed && <>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 8 }}>{ai.headline}</div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.5, color: C.text }}>
          {ai.bullets.slice(0, 4).map((b, i) => <li key={i} style={{ marginBottom: 3 }}>{b}</li>)}
        </ul>
        <div style={{
          marginTop: 8, padding: '8px 10px',
          background: `${C.cone}15`, border: `1px solid ${C.cone}33`, borderRadius: 4,
          fontSize: 11, lineHeight: 1.4,
        }}>
          <b style={{ color: C.cone }}>盤後焦點：</b>{ai.suggestion}
        </div>
        </>}
      </div>
    );
  }

  // ── Right-bottom panic gauge ──
  function HudPanic({ data, state }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const drag = window.useDraggable('hud-panic', { bottom: 16, right: 16 });
    // When no panic event has occurred yet (e.g. during replay before
    // the panic trigger), show panel in calm/baseline state instead of hiding.
    const p = data.PANIC?.[0] || {
      panic_index: 0, n_high_margin: 0, n_severe_drop: 0,
      avg_order_imbalance: 0,
    };
    const calm = !data.PANIC?.[0];
    const idxColor = state.panic >= 15 ? C.alert : state.panic >= 8 ? C.warn :
                       calm ? C.textFaint : C.down;
    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        display: 'flex', alignItems: 'center', gap: collapsed ? 8 : 16,
        padding: collapsed ? '6px 10px' : 12,
        transition: 'gap 200ms, padding 200ms',
      }}>
        {collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.textFaint, letterSpacing: 0.6 }}>PANIC</span>
            <span style={{ ...styles.mono, fontSize: 16, fontWeight: 700, color: idxColor }}>
              {state.panic.toFixed(1)}
            </span>
            <button onClick={() => setCollapsed(false)} style={{
              background: 'rgba(255,255,255,0.06)', color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '2px 6px', fontSize: 10, cursor: 'pointer',
              fontFamily: 'monospace', lineHeight: 1,
            }} title="展開">▲</button>
          </div>
        ) : (
          <>
            <PanicGauge value={state.panic} />
            <div style={{ minWidth: 160 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, pointerEvents: 'auto' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span onPointerDown={drag.onPointerDown}
                        style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                        title="拖曳移動">⋮⋮</span>
                  <span style={{ ...styles.mono, fontSize: 9, color: C.textFaint, letterSpacing: 0.6 }}>MARKET STRUCTURE</span>
                </span>
                <button onClick={() => setCollapsed(true)} style={{
                  background: 'rgba(255,255,255,0.06)', color: C.text,
                  border: `1px solid ${C.border}`, borderRadius: 3,
                  padding: '2px 6px', fontSize: 10, cursor: 'pointer',
                  fontFamily: 'monospace', lineHeight: 1,
                }} title="收起">▼</button>
              </div>
              <Row k="高融資個股" v={p.n_high_margin ?? 0} color={C.warn} />
              <Row k="嚴重下跌" v={p.n_severe_drop ?? 0} color={C.alert} />
              <Row k="委買賣失衡" v={(p.avg_order_imbalance ?? 0).toFixed(2)} color={C.down} />
            </div>
          </>
        )}
      </div>
    );
  }
  function Row({ k, v, color }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: C.textDim }}>{k}</span>
        <span style={{ ...styles.mono, color, fontWeight: 700 }}>{v}</span>
      </div>
    );
  }

  // ── Bottom-strip floating: prediction width evolution (V3 chart-width parity) ──
  function HudWidthChart({ data }) {
    const [collapsed, setCollapsed] = React.useState(false);
    // Default position above HudTimeline (which spans `left:16, right:380, bottom:16`).
    // Sitting at bottom:160 keeps a ~30px gap above the timeline strip.
    const drag = window.useDraggable('hud-width-chart', { left: 16, bottom: 160 });
    const history = data.HISTORY || [];
    const isEmpty = history.length === 0;

    const buildTraces = () => {
      if (isEmpty) return [];
      const ts = history.map(r => r.ts);
      return [
        { name: 'h5',    x: ts, y: history.map(r => r.h5_width_pct),
          type: 'scatter', mode: 'lines', line: { color: '#67e8f9', width: 1.2 } },
        { name: 'h15',   x: ts, y: history.map(r => r.h15_width_pct),
          type: 'scatter', mode: 'lines', line: { color: '#fbbf24', width: 1.2 } },
        { name: 'h30',   x: ts, y: history.map(r => r.h30_width_pct),
          type: 'scatter', mode: 'lines', line: { color: '#fb923c', width: 1.2 } },
        { name: 'close', x: ts, y: history.map(r => r.close_width_pct),
          type: 'scatter', mode: 'lines', line: { color: '#a855f7', width: 2 } },
      ];
    };
    const buildLayout = () => window.plotlyDarkLayout({
      margin: { t: 6, l: 36, r: 8, b: 22 },
      showlegend: true,
      xaxis: { tickformat: '%H:%M', tickfont: { size: 9 } },
      yaxis: { ticksuffix: '%', tickfont: { size: 9 } },
      extra: {
        legend: { orientation: 'h', x: 1, xanchor: 'right', y: -0.18,
                  font: { size: 9 }, bgcolor: 'rgba(0,0,0,0)' },
      },
    });
    const plotRef = window.usePlotly(
      buildTraces, buildLayout,
      [history.length, collapsed, isEmpty]
    );

    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        width: 360,
        padding: 0,
        overflow: 'hidden',
        transition: 'padding 200ms',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       padding: '6px 10px', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
                       pointerEvents: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              預測寬度演化 (%)
            </span>
          </span>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'monospace', lineHeight: 1,
          }} title={collapsed ? '展開' : '收起'}>{collapsed ? '▼' : '▲'}</button>
        </div>
        {!collapsed && (
          isEmpty ? (
            <div style={{
              height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...styles.mono, fontSize: 11, color: C.textFaint,
            }}>尚無預測資料</div>
          ) : (
            <div ref={plotRef} style={{ height: 140, width: '100%' }} />
          )
        )}
      </div>
    );
  }

  // ── Right-bottom floating: panic timeline (V3 chart-panic parity) ──
  // Prefers intraday cumulative series (PANIC_INTRADAY, from PR #8), falls back
  // to rolling 30-day max (PANIC_HISTORY), then to degenerate single-point PANIC.
  function HudPanicTimeline({ data }) {
    const [collapsed, setCollapsed] = React.useState(false);
    // Sits above HudPanic (bottom:16, right:16) with a small gap.
    const drag = window.useDraggable('hud-panic-timeline', { right: 16, bottom: 200 });

    const intraday = Array.isArray(data.PANIC_INTRADAY) ? data.PANIC_INTRADAY : null;
    const history  = Array.isArray(data.PANIC_HISTORY)  ? data.PANIC_HISTORY  : null;
    const panicNow = Array.isArray(data.PANIC)          ? data.PANIC          : null;

    let source = null;  // 'intraday' | 'history' | 'point' | null
    let title  = '盤中 PANIC';
    let rows   = null;
    if (intraday && intraday.length) {
      source = 'intraday'; rows = intraday; title = '盤中 PANIC';
    } else if (history && history.length) {
      source = 'history';  rows = history;  title = '近 30 日 PANIC';
    } else if (panicNow && panicNow.length) {
      source = 'point';    rows = panicNow; title = '盤中 PANIC';
    }
    const isEmpty = !source;

    const buildTraces = () => {
      if (isEmpty) return [];
      if (source === 'history') {
        const x = rows.map(r => r.date);
        const y = rows.map(r => r.panic);
        return [
          { name: 'panic', x, y,
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#c084fc', width: 2 }, marker: { size: 4 } },
        ];
      }
      // intraday or point — both have ts/panic_index/n_high_margin shape
      const x  = rows.map(r => r.ts);
      const y  = rows.map(r => r.panic_index);
      const y2 = rows.map(r => r.n_high_margin ?? 0);
      return [
        { name: 'panic', x, y,
          type: 'scatter', mode: 'lines+markers',
          line: { color: '#c084fc', width: 2 }, marker: { size: 4 } },
        { name: 'high-margin', x: x, y: y2,
          type: 'scatter', mode: 'lines',
          line: { color: '#fb923c', width: 1, dash: 'dot' }, yaxis: 'y2' },
      ];
    };
    const buildLayout = () => {
      if (isEmpty) return window.plotlyDarkLayout({});
      const xFirst = source === 'history' ? rows[0].date : rows[0].ts;
      const xLast  = source === 'history'
        ? rows[rows.length - 1].date
        : rows[rows.length - 1].ts;
      const layout = window.plotlyDarkLayout({
        margin: { t: 6, l: 32, r: source === 'history' ? 8 : 28, b: 22 },
        showlegend: false,
        xaxis: {
          tickformat: source === 'history' ? undefined : '%H:%M',
          tickfont: { size: 9 },
        },
        yaxis: { tickfont: { size: 9 } },
        shapes: [{
          type: 'line', x0: xFirst, x1: xLast, y0: 15, y1: 15,
          line: { color: '#ef4444', width: 1, dash: 'dash' },
        }],
        annotations: [{
          x: xLast, y: 15, xref: 'x', yref: 'y',
          text: 'ALERT', showarrow: false,
          font: { size: 8, color: '#ef4444' },
          xanchor: 'right', yanchor: 'bottom',
        }],
      });
      if (source !== 'history') {
        layout.yaxis2 = {
          overlaying: 'y', side: 'right',
          tickfont: { size: 9, color: '#fb923c' },
          showgrid: false,
        };
      }
      return layout;
    };
    const plotRef = window.usePlotly(
      buildTraces, buildLayout,
      [source, rows ? rows.length : 0, collapsed, isEmpty]
    );

    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        width: 320,
        padding: 0,
        overflow: 'hidden',
        transition: 'padding 200ms',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       padding: '6px 10px', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
                       pointerEvents: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {title}
            </span>
          </span>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'monospace', lineHeight: 1,
          }} title={collapsed ? '展開' : '收起'}>{collapsed ? '▼' : '▲'}</button>
        </div>
        {!collapsed && (
          isEmpty ? (
            <div style={{
              height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...styles.mono, fontSize: 11, color: C.textFaint,
            }}>尚無 panic 資料</div>
          ) : (
            <div ref={plotRef} style={{ height: 140, width: '100%' }} />
          )
        )}
      </div>
    );
  }

  // ── Left-side floating: predict_tomorrow 3-horizon table ──
  // Reads data.TOMORROW (PR #9), the JSON sibling of predict_tomorrow_<date>.html.
  // One row per horizon (1d/5d/10d) showing q90/q50/q10 + width + no-wave prob.
  function HudTomorrow({ data }) {
    const [collapsed, setCollapsed] = React.useState(false);
    // Below HudKpis (top:64) — sits at mid-vertical left rail.
    const drag = window.useDraggable('hud-tomorrow', { left: 16, top: 320 });
    const tom = data?.TOMORROW;
    const horizons = tom?.horizons || null;
    const horizonKeys = horizons ? Object.keys(horizons).sort((a, b) => Number(a) - Number(b)) : [];
    const isEmpty = !tom || horizonKeys.length === 0;
    const noWaveEmoji = (p) => p == null ? '' : (p >= 0.05 ? '🔴' : p >= 0.01 ? '🟡' : '🟢');

    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        width: 320,
        padding: 0,
        overflow: 'hidden',
        transition: 'padding 200ms',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       padding: '6px 10px', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
                       pointerEvents: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              明日 / 5日 / 10日 預測 · v3-deep
            </span>
          </span>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'monospace', lineHeight: 1,
          }} title={collapsed ? '展開' : '收起'}>{collapsed ? '▼' : '▲'}</button>
        </div>
        {!collapsed && (
          isEmpty ? (
            <div style={{
              padding: '20px 14px', textAlign: 'center',
              ...styles.mono, fontSize: 11, color: C.textFaint,
            }}>尚無隔日預測</div>
          ) : (
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {horizonKeys.map(k => {
                const h = horizons[k];
                const upPct = h.upper_pct;
                const dnPct = h.lower_pct;
                const upBnd = h.upper_bound;
                const dnBnd = h.lower_bound;
                const upMid = h.upper_median;
                const dnMid = h.lower_median;
                const width = h.range_pct;
                const nw = h.no_wave_prob;
                return (
                  <div key={k} style={{
                    ...styles.mono, fontSize: 10,
                    borderBottom: `1px dashed ${C.border}`, paddingBottom: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ color: C.chrome, fontWeight: 700, fontSize: 11 }}>{k}d</span>
                      <span style={{ color: C.textDim, fontSize: 9 }}>
                        width {width != null ? width.toFixed(2) : '—'}%
                        {nw != null && <span style={{ marginLeft: 6 }}>
                          no-wave {(nw * 100).toFixed(1)}% {noWaveEmoji(nw)}
                        </span>}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ color: C.up, fontWeight: 700 }}>
                        {upBnd != null ? fmt.int(upBnd) : '—'}
                        <span style={{ color: C.up, fontWeight: 400, marginLeft: 4 }}>
                          ({upPct != null ? (upPct >= 0 ? '+' : '') + upPct.toFixed(2) : '—'}%)
                        </span>
                      </span>
                      <span style={{ color: C.textDim }}>
                        q50 {upMid != null ? fmt.int(upMid) : '—'}..{dnMid != null ? fmt.int(dnMid) : '—'}
                      </span>
                      <span style={{ color: C.down, fontWeight: 700 }}>
                        {dnBnd != null ? fmt.int(dnBnd) : '—'}
                        <span style={{ color: C.down, fontWeight: 400, marginLeft: 4 }}>
                          ({dnPct != null ? (dnPct >= 0 ? '+' : '') + dnPct.toFixed(2) : '—'}%)
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    );
  }

  // ── Right rail floating: top stocks + sectors ──
  function HudSideStocks({ stocks, sectors, ins, breadth }) {
    const [collapsed, setCollapsed] = React.useState(false);
    const drag = window.useDraggable('hud-side-stocks', { right: 16, top: 320 });
    const hasStocks = stocks && stocks.length;
    const hasIns = ins && ins.foreign;
    const hasBreadth = breadth && breadth.advance != null;
    if (!hasStocks && !hasIns && !hasBreadth) return null;
    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        width: collapsed ? 'auto' : 340,
        maxHeight: collapsed ? 32 : 360,
        overflow: 'hidden', padding: 0,
        display: 'flex', flexDirection: 'column',
        transition: 'width 200ms, max-height 200ms',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                       padding: '6px 10px', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
                       pointerEvents: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6 }}>市場面板</span>
          </span>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            background: 'rgba(255,255,255,0.06)', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 3,
            padding: '2px 6px', fontSize: 10, cursor: 'pointer',
            fontFamily: 'monospace', lineHeight: 1,
          }} title={collapsed ? '展開' : '收起'}>{collapsed ? '▼' : '▲'}</button>
        </div>
        {hasIns && !collapsed && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              三大法人
              {ins.estimated && <span style={{ color: C.textFaint, marginLeft: 4 }}>· 估算</span>}
              {ins.source && <span style={{ color: C.textFaint, marginLeft: 4, textTransform: 'none' }}>· {ins.source}</span>}
            </span>
            <span style={{ ...styles.mono, fontSize: 13, fontWeight: 700, color: ins.total.today >= 0 ? C.up : C.down }}>
              {ins.total.today >= 0 ? '+' : ''}{ins.total.today.toFixed(1)} 億
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10, ...styles.mono }}>
            <span><span style={{ color: C.textDim }}>外資 </span><span style={{ color: ins.foreign.today >= 0 ? C.up : C.down, fontWeight: 700 }}>{ins.foreign.today.toFixed(0)}</span></span>
            <span><span style={{ color: C.textDim }}>投信 </span><span style={{ color: ins.trust.today >= 0 ? C.up : C.down, fontWeight: 700 }}>{ins.trust.today >= 0 ? '+' : ''}{ins.trust.today.toFixed(0)}</span></span>
            <span><span style={{ color: C.textDim }}>自營 </span><span style={{ color: ins.dealer.today >= 0 ? C.up : C.down, fontWeight: 700 }}>{ins.dealer.today.toFixed(0)}</span></span>
          </div>
        </div>
        )}
        {hasBreadth && !collapsed && (
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              BREADTH
              {breadth.estimated && <span style={{ color: C.textFaint, marginLeft: 4, textTransform: 'none' }}>· 估算</span>}
              {breadth.source && <span style={{ color: C.textFaint, marginLeft: 4, textTransform: 'none' }}>· {breadth.source}</span>}
            </span>
            <span style={{ ...styles.mono, fontSize: 10, color: C.textDim }}>A/D {(breadth.advance / breadth.decline).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ ...styles.mono, color: C.up, fontSize: 16, fontWeight: 700 }}>▲{breadth.advance}</span>
            <span style={{ ...styles.mono, color: C.down, fontSize: 16, fontWeight: 700 }}>{breadth.decline}▼</span>
          </div>
          <div style={{ display: 'flex', height: 4, background: C.border, marginTop: 4, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(breadth.advance / (breadth.advance + breadth.decline + breadth.unchanged)) * 100}%`, background: C.up }} />
            <div style={{ width: `${(breadth.unchanged / (breadth.advance + breadth.decline + breadth.unchanged)) * 100}%`, background: C.textFaint }} />
            <div style={{ flex: 1, background: C.down }} />
          </div>
        </div>
        )}
        {hasStocks && !collapsed && (
        <div style={{ padding: '8px 14px', flex: 1, overflowY: 'auto' }}>
          <div style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>權值股 TOP 6</div>
          {stocks.slice(0, 6).map((s) => (
            <div key={s.code} style={{
              display: 'grid', gridTemplateColumns: '44px 1fr 58px', gap: 6,
              padding: '3px 0', fontSize: 11, alignItems: 'baseline',
            }}>
              <span style={{ ...styles.mono, color: C.chrome }}>{s.code}</span>
              <span>{s.name}</span>
              <span style={{ ...styles.mono, color: s.pct >= 0 ? C.up : C.down, textAlign: 'right', fontWeight: 700 }}>{fmt.pct(s.pct)}</span>
            </div>
          ))}
        </div>
        )}
      </div>
    );
  }

  // ── Bottom event timeline ──
  function HudTimeline({ events }) {
    const [collapsed, setCollapsed] = React.useState(false);
    // HudTimeline is a stretched panel (left:16, right:380). When draggable
    // activates, we need an explicit width so it doesn't collapse to content
    // after right:'auto' is forced. Use the same default visible width.
    const drag = window.useDraggable('hud-timeline', { left: 16, right: 380, bottom: 16 });
    const sorted = [...events].sort((a, b) => a.ts.localeCompare(b.ts));
    return (
      <div ref={drag.ref} style={{
        ...drag.style,
        zIndex: 5,
        pointerEvents: 'none',
        ...styles.glassCard,
        padding: '10px 14px',
        maxHeight: collapsed ? 32 : 130,
        overflow: 'hidden',
        transition: 'max-height 200ms ease',
        // Preserve width after override (override forces right:'auto')
        width: drag.style.right === 'auto' ? 'calc(100vw - 32px - 380px)' : undefined,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 6, pointerEvents: 'auto' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span onPointerDown={drag.onPointerDown}
                  style={{ ...window.DragHandle.style, color: C.textFaint, fontSize: 11, padding: '0 2px' }}
                  title="拖曳移動">⋮⋮</span>
            <span style={{ ...styles.mono, fontSize: 9, color: C.chrome, letterSpacing: 0.6, textTransform: 'uppercase' }}>當日事件 · {events.length}</span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ ...styles.mono, fontSize: 9, color: C.alert }}>{events.filter(e => e.level === 'high').length} HIGH</span>
            <button onClick={() => setCollapsed(!collapsed)} style={{
              background: 'rgba(255,255,255,0.06)', color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 3,
              padding: '2px 8px', fontSize: 10, cursor: 'pointer',
              fontFamily: 'monospace', lineHeight: 1,
            }} title={collapsed ? '展開' : '收起'}>
              {collapsed ? '▲' : '▼'}
            </button>
          </div>
        </div>
        <div style={{
          display: collapsed ? 'none' : 'flex',
          gap: 8, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 4,
          pointerEvents: 'auto'
        }}>
          {sorted.map((e, i) => {
            const high = e.level === 'high';
            const color = high ? C.alert : C.warn;
            return (
              <div key={i} style={{
                flex: '0 0 auto', minWidth: 150, maxWidth: 220,
                padding: '6px 10px', borderRadius: 4,
                background: high ? `${color}15` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${high ? color + '55' : C.border}`,
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ ...styles.mono, fontSize: 10, color: C.textDim }}>{fmt.time(e.ts)}</span>
                  <span style={{ ...styles.mono, fontSize: 9, color, fontWeight: 700 }}>{e.kind}</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.text, marginTop: 2, lineHeight: 1.3 }}>{e.msg}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Layout presets (PR #10) ──
  // Each preset writes pixel-pos overrides for all 7 HUD ids into
  // localStorage[v4.layout.v1], then fires LAYOUT_RESET so the hooks reload.
  function applyLayoutPreset(name) {
    const key = window.LAYOUT_STORAGE_KEY || 'v4.layout.v1';
    if (name === 'default') {
      // resetLayout() clears the key + dispatches LAYOUT_RESET internally.
      window.resetLayout();
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    let layout = {};
    if (name === 'wide') {
      // Push panels toward the edges to free up center for the chart.
      layout = {
        'hud-kpis':           { x: 16,        y: 64 },
        'hud-ai':             { x: W - 360,   y: 64 },
        'hud-panic':          { x: W - 300,   y: H - 140 },
        'hud-side-stocks':    { x: W - 360,   y: 220 },
        'hud-timeline':       { x: 16,        y: H - 150 },
        'hud-width-chart':    { x: 16,        y: H - 310 },
        'hud-panic-timeline': { x: W - 340,   y: 380 },
        'hud-tomorrow':       { x: 16,        y: 280 },
      };
    } else if (name === 'compact') {
      // Compact panels themselves track collapsed state internally (via
      // useState), so a preset can't toggle them. Best-effort: just reset to
      // defaults — user can then click each ▲ button to collapse.
      window.resetLayout();
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(layout));
    } catch (e) {
      console.warn('[layout] preset save failed', e);
    }
    window.dispatchEvent(new Event('LAYOUT_RESET'));
  }

  // ── Chart controls (zoom, pan presets, reset) ──
  function ChartControls({ view, zoomBy, resetView, setPreset, data }) {
    const { DATA_START_MS, DATA_END_MS } = getDayBounds(data);
    const rangeMin = (view.xMax - view.xMin) / 60000;
    const startD = new Date(view.xMin);
    const endD = new Date(view.xMax);
    const lbl = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const fullRange = (DATA_END_MS - DATA_START_MS);
    const left = ((view.xMin - DATA_START_MS) / fullRange) * 100;
    const width = ((view.xMax - view.xMin) / fullRange) * 100;

    const btn = (label, onClick, opts = {}) => (
      <button onClick={onClick}
        title={opts.title}
        style={{
          background: opts.active ? C.chrome : 'rgba(255,255,255,0.04)',
          color: opts.active ? '#000' : C.text,
          border: `1px solid ${opts.active ? C.chrome : 'rgba(255,255,255,0.1)'}`,
          padding: '4px 10px', fontSize: 10, fontWeight: 600,
          fontFamily: '"JetBrains Mono", monospace', letterSpacing: 0.5,
          borderRadius: 3, cursor: 'pointer',
        }}>{label}</button>
    );

    return (
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 6,
        background: 'rgba(12,12,18,0.82)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '8px 12px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Time window display */}
        <div style={{ ...styles.mono, fontSize: 10, color: C.textDim, minWidth: 96 }}>
          <span style={{ color: C.text }}>{lbl(startD)}</span>
          <span style={{ margin: '0 4px', color: C.textFaint }}>→</span>
          <span style={{ color: C.text }}>{lbl(endD)}</span>
          <span style={{ marginLeft: 6, color: C.chrome, fontWeight: 600 }}>{Math.round(rangeMin)}m</span>
        </div>

        {/* Range track minimap */}
        <div style={{ position: 'relative', width: 140, height: 18, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: `${left}%`, width: `${width}%`,
            background: `${C.cone}50`, border: `1px solid ${C.cone}`, borderRadius: 2,
          }} />
        </div>

        {/* Zoom controls */}
        <div style={{ display: 'flex', gap: 4 }}>
          {btn('−', () => zoomBy(1.4), { title: '縮小 (zoom out)' })}
          {btn('+', () => zoomBy(0.7), { title: '放大 (zoom in)' })}
          {btn('⤢', resetView, { title: '全顯示 (double-click chart)' })}
        </div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 4 }}>
          {btn('30m', () => setPreset(30))}
          {btn('1h', () => setPreset(60))}
          {btn('2h', () => setPreset(120))}
          {btn('ALL', resetView)}
        </div>

        {/* Layout reset (PR #3) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {btn('↺ 視窗', () => window.resetLayout(),
               { title: '重置所有面板位置到預設' })}
        </div>

        {/* Layout presets (PR #10) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {btn('DEFAULT', () => applyLayoutPreset('default'),
               { title: '預設位置 — 清除所有面板偏移' })}
          {btn('WIDE',    () => applyLayoutPreset('wide'),
               { title: '寬版 — 面板靠邊讓主圖最大化' })}
          {btn('COMPACT', () => applyLayoutPreset('compact'),
               { title: '緊湊 — 重置後請手動收起各面板' })}
        </div>

        {/* Hint */}
        <span style={{ ...styles.mono, fontSize: 9, color: C.textFaint, marginLeft: 4 }}>
          滾輪縮放 · 拖拉平移 · 雙擊重置 · ⋮⋮ 拖視窗
        </span>
      </div>
    );
  }

  // ── deriveState that tolerates partial data ──
  function safeDerive(data) {
    if (!data || !data.OHLC || !data.OHLC.ts || !data.OHLC.ts.length) return null;
    try { return window.deriveState(data); } catch (e) { console.error(e); return null; }
  }

  function ConeHeroVariant() {
    const [tick, setTick] = useState(0);  // bumped on DATA_UPDATED
    useEffect(() => {
      const onUpdate = () => setTick(t => t + 1);
      window.addEventListener('DATA_UPDATED', onUpdate);
      return () => window.removeEventListener('DATA_UPDATED', onUpdate);
    }, []);

    const data = window.DATA;
    const state = useMemo(() => safeDerive(data), [data, tick]);
    const [view, setView] = useState(() => {
      const { DATA_START_MS, DATA_END_MS } = getDayBounds(window.DATA);
      return { xMin: DATA_START_MS, xMax: DATA_END_MS };
    });

    // When data refreshes, if we were showing the full day, snap to track
    // the data. During live/replay, follow the latest bar with a small
    // buffer so candles don't cluster on the left.
    const wasFullRef = useRef(true);
    useEffect(() => {
      const { DATA_START_MS, DATA_END_MS } = getDayBounds(data);
      // "Full" means anchored at left edge — user hasn't zoomed/panned in.
      wasFullRef.current = (view.xMin <= DATA_START_MS + 1);
    }, [view, data]);
    useEffect(() => {
      if (!wasFullRef.current) return;
      const { DATA_START_MS, DATA_END_MS, CLOSE_MS } = getDayBounds(data);
      // xMax must always include CLOSE_MS so cone wedges render fully
      // (they project from each signal time to CLOSE_MS). Extending beyond
      // CLOSE_MS only when data has grown past it.
      const ohlcTs = data?.OHLC?.ts;
      if (!ohlcTs || ohlcTs.length === 0) {
        setView({ xMin: DATA_START_MS, xMax: DATA_END_MS });
        return;
      }
      const lastBarMs = new Date(ohlcTs[ohlcTs.length - 1]).getTime();
      const BUFFER_MS = 6 * 60 * 1000;  // small buffer past last bar
      const xMax = Math.min(
        DATA_END_MS,
        Math.max(CLOSE_MS + BUFFER_MS, lastBarMs + BUFFER_MS)
      );
      setView({ xMin: DATA_START_MS, xMax });
    }, [tick]);

    // Container ref to measure size
    const ref = useRef(null);
    const [size, setSize] = useState({ w: 1680, h: 1050 });
    useEffect(() => {
      if (!ref.current) return;
      const update = () => {
        const r = ref.current.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);

    if (!data || !state) {
      return (
        <div style={{
          ...styles.root, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ ...styles.mono, color: C.chrome, fontSize: 14, letterSpacing: 1 }}>
            ◆ LOADING DATA…
          </div>
        </div>
      );
    }

    const zoomBy = (factor) => {
      const { DATA_START_MS, DATA_END_MS } = getDayBounds(data);
      const center = (view.xMin + view.xMax) / 2;
      let newMin = center - (center - view.xMin) * factor;
      let newMax = center + (view.xMax - center) * factor;
      const range = newMax - newMin;
      if (range < MIN_RANGE_MS) return;
      if (range > DATA_END_MS - DATA_START_MS) { newMin = DATA_START_MS; newMax = DATA_END_MS; }
      else {
        if (newMin < DATA_START_MS) { newMax += DATA_START_MS - newMin; newMin = DATA_START_MS; }
        if (newMax > DATA_END_MS)   { newMin -= newMax - DATA_END_MS;   newMax = DATA_END_MS; }
      }
      setView({ xMin: newMin, xMax: newMax });
    };
    const resetView = () => {
      const { DATA_START_MS, DATA_END_MS } = getDayBounds(data);
      setView({ xMin: DATA_START_MS, xMax: DATA_END_MS });
    };
    const setPreset = (mins) => {
      const { DATA_START_MS, DATA_END_MS } = getDayBounds(data);
      const last = new Date(data.OHLC.ts[data.OHLC.ts.length - 1]).getTime();
      setView({
        xMin: Math.max(DATA_START_MS, last - mins * 60000),
        xMax: Math.min(DATA_END_MS, last + 5 * 60000),
      });
    };

    return (
      <div ref={ref} style={styles.root}>
        {/* Background subtle vignette */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, #06080f 0%, #000 80%)',
          pointerEvents: 'none',
        }} />
        {/* Hero chart */}
        <HeroCone data={data} width={size.w} height={size.h} view={view} setView={setView} />

        {/* HUD overlays */}
        <TopHud data={data} state={state} />
        <ChartControls view={view} zoomBy={zoomBy} resetView={resetView} setPreset={setPreset} data={data} />
        <HudKpis data={data} state={state} />
        <HudAi ai={data.AI_SUMMARY} />
        <HudPanic data={data} state={state} />
        <HudSideStocks stocks={data.TOP_STOCKS} sectors={data.SECTORS}
          ins={data.INSTITUTIONS} breadth={data.BREADTH} />
        <HudWidthChart data={data} />
        <HudPanicTimeline data={data} />
        <HudTomorrow data={data} />
        <HudTimeline events={data.EVENTS} />
      </div>
    );
  }

  window.ConeHeroVariant = ConeHeroVariant;
})();
