// Intraday stacked range-bands — the per-bar nested quantile fan (50/68/80/90/95%).
// Reads ./intraday_bands.json. Each candle sits inside the box predicted from the PREVIOUS bar;
// nested boxes = confidence levels (OOS-calibrated). Direction is unforecastable → boxes are
// close-centered (no tilt); only the WIDTH is predicted. A candle breaking the outer box = a
// volatility-expansion event.
(function () {
  const { useState, useEffect, useRef } = React;
  const PURPLE = '#c084fc';
  // outer (95%) faint → inner (50%) solid
  const OPACITY = { 95: 0.07, 90: 0.12, 80: 0.19, 68: 0.28, 50: 0.42 };

  function IntradayBandHero() {
    const ref = useRef(null);
    const [data, setData] = useState(window.__BANDS || null);
    const [err, setErr] = useState(null);

    useEffect(() => {
      fetch('./intraday_bands.json?t=' + Date.now(), { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(setData).catch(e => setErr(String(e)));
    }, []);

    useEffect(() => {
      if (!data || !ref.current || !window.Plotly) return;
      const bars = data.bars;
      const levels = data.levels.slice().sort((a, b) => b - a); // outer → inner
      const xs = bars.map(b => b.t);
      const NEXT = '次根→';                         // synthetic x for the live next-bar forecast
      const cats = xs.concat([NEXT]);

      const traces = [];
      // nested ribbons: box framing candle i comes from bars[i-1]; last box (at NEXT) is live.
      levels.forEach(L => {
        const X = [], UP = [], LO = [];
        for (let i = 1; i < bars.length; i++) {
          const bd = bars[i - 1].bands[String(L)];
          if (!bd) continue;
          X.push(bars[i].t); UP.push(bd[1]); LO.push(bd[0]);
        }
        const last = bars[bars.length - 1].bands[String(L)];   // live next-bar box
        if (last) { X.push(NEXT); UP.push(last[1]); LO.push(last[0]); }
        traces.push({
          x: X.concat(X.slice().reverse()),
          y: UP.concat(LO.slice().reverse()),
          fill: 'toself', fillcolor: `rgba(192,132,252,${OPACITY[L]})`,
          line: { width: 0 }, hoverinfo: 'skip', mode: 'lines',
          name: L + '%', type: 'scatter',
        });
      });
      // candles on top
      traces.push({
        type: 'candlestick', x: xs,
        open: bars.map(b => b.o), high: bars.map(b => b.h),
        low: bars.map(b => b.l), close: bars.map(b => b.c),
        increasing: { line: { color: '#26c281' } }, decreasing: { line: { color: '#e74c3c' } },
        name: 'TXF', showlegend: false,
      });
      // mark candles that BROKE their 90% box (vol-expansion events)
      const bx = [], by = [];
      for (let i = 1; i < bars.length; i++) {
        const bd = bars[i - 1].bands['90']; if (!bd) continue;
        if (bars[i].h > bd[1] || bars[i].l < bd[0]) { bx.push(bars[i].t); by.push(bars[i].h); }
      }
      traces.push({
        type: 'scatter', mode: 'markers', x: bx, y: by, name: '破框 (波動擴張)',
        marker: { symbol: 'triangle-up', size: 9, color: '#ffb020' }, hoverinfo: 'x',
      });

      const layout = {
        paper_bgcolor: '#000', plot_bgcolor: '#000',
        font: { color: '#cbd5e1', family: 'JetBrains Mono, monospace', size: 11 },
        margin: { l: 56, r: 16, t: 8, b: 36 },
        xaxis: { type: 'category', categoryorder: 'array', categoryarray: cats,
                 gridcolor: 'rgba(255,255,255,0.05)', tickangle: 0, fixedrange: false,
                 rangeslider: { visible: false } },
        yaxis: { gridcolor: 'rgba(255,255,255,0.06)', tickformat: ',d', fixedrange: false,
                 title: { text: 'TXF', font: { color: PURPLE } } },
        legend: { orientation: 'h', x: 0, y: 1.06, bgcolor: 'rgba(0,0,0,0)',
                  font: { size: 10 } },
        showlegend: true, hovermode: 'x unified',
      };
      window.Plotly.react(ref.current, traces, layout, { responsive: true, displayModeBar: false });
    }, [data]);

    const head = {
      position: 'absolute', top: 14, left: 18, right: 18, zIndex: 5, pointerEvents: 'none',
      fontFamily: 'IBM Plex Sans, Noto Sans TC, sans-serif',
    };
    return (
      React.createElement('div', { style: { width: '100vw', height: '100vh', background: '#000', position: 'relative' } },
        React.createElement('div', { style: head },
          React.createElement('div', { style: { color: '#fff', fontSize: 18, fontWeight: 700 } },
            'TAIEX 盤中堆疊區間 · Intraday Stacked Bands'),
          React.createElement('div', { style: { color: '#94a3b8', fontSize: 12, marginTop: 3 } },
            data ? `${data.instrument} · ${data.timeframe_min}分K · ${data.date} · 巢狀 50/68/80/90/95% 信心框（每框=下一根的預測區間，OOS 校準）`
                 : (err ? ('載入失敗: ' + err) : '載入中…')),
          React.createElement('div', { style: { color: '#64748b', fontSize: 11, marginTop: 2 } },
            '以收盤為中心（方向不可測→不偏移）；只預測「寬度」。🔺=破90%框=波動擴張事件。'),
          React.createElement('a', { href: './V4.html', style: { color: PURPLE, fontSize: 12, pointerEvents: 'auto' } },
            '← 回 V4 cone')),
        React.createElement('div', { ref: ref, style: { width: '100%', height: '100%' } }))
    );
  }
  window.IntradayBandHero = IntradayBandHero;
})();
