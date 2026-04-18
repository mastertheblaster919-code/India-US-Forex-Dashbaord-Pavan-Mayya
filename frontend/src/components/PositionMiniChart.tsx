import { useEffect, useRef, useState, useCallback } from 'react';

interface PositionMiniChartProps {
    ticker: string;
    data: any[];
    entryPrice: number;
    stopLoss: number;
    target: number;
    quantity?: number;
    height?: number;
}

export default function PositionMiniChart({ 
    ticker, 
    data, 
    entryPrice, 
    stopLoss, 
    target, 
    quantity = 10
}: PositionMiniChartProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [timeframe, setTimeframe] = useState<'15m' | '1H' | '1D'>('1D');
    const [indicators, setIndicators] = useState<Set<string>>(new Set(['ma5', 'ma20', 'vol']));
    const [showRSI, setShowRSI] = useState(false);
    const [showMACD, setShowMACD] = useState(false);
    const [tooltip, setTooltip] = useState<{x: number, y: number, visible: boolean, content: string}>({x: 0, y: 0, visible: false, content: ''});

    // Generate OHLC data from real data or fallback
    const generateOHLC = useCallback((rawData: any[]) => {
        if (!rawData || rawData.length === 0) return [];
        
        return rawData.map((d: any, i: number) => ({
            o: d.open || d.o || entryPrice * 0.99,
            h: d.high || d.h || d.close * 1.01,
            l: d.low || d.l || d.close * 0.99,
            c: d.close || d.c || entryPrice,
            v: d.volume || d.v || Math.floor(Math.random() * 1000000),
            time: d.time || i
        }));
    }, [entryPrice]);

    // Technical indicator calculations
    const calcMA = (d: any[], n: number) => d.map((_, i) => i < n - 1 ? null : d.slice(i - n + 1, i + 1).reduce((s: number, c: any) => s + c.c, 0) / n);

    const calcEMA = (d: any[], n: number) => {
        const k = 2 / (n + 1);
        const r: (number | null)[] = [];
        let e: number | null = null;
        for (let i = 0; i < d.length; i++) {
            if (i < n - 1) { r.push(null); continue; }
            if (e === null) e = d.slice(0, n).reduce((s: number, c: any) => s + c.c, 0) / n;
            else e = d[i].c * k + e * (1 - k);
            r.push(e);
        }
        return r;
    };

    const calcBB = (d: any[], n = 20, m = 2) => {
        const ma = calcMA(d, n);
        return d.map((_, i) => {
            if (ma[i] === null) return { u: null, mid: null, lo: null };
            const s = d.slice(i - n + 1, i + 1);
            const std = Math.sqrt(s.reduce((a: number, c: any) => a + Math.pow(c.c - (ma[i] || 0), 2), 0) / n);
            return { u: (ma[i] || 0) + m * std, mid: ma[i], lo: (ma[i] || 0) - m * std };
        });
    };

    const calcRSI = (d: any[], n = 14) => {
        const r: (number | null)[] = Array(d.length).fill(null);
        let ag = 0, al = 0;
        for (let i = 1; i <= n && i < d.length; i++) {
            const df = d[i].c - d[i - 1].c;
            if (df > 0) ag += df; else al -= df;
        }
        ag /= n; al /= n;
        for (let i = n; i < d.length; i++) {
            const df = d[i].c - d[i - 1].c;
            const g = df > 0 ? df : 0, l = df < 0 ? -df : 0;
            ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n;
            r[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
        }
        return r;
    };

    const calcMACD = (d: any[]) => {
        const e12 = calcEMA(d, 12), e26 = calcEMA(d, 26);
        const macd = d.map((_, i) => e12[i] !== null && e26[i] !== null ? (e12[i] || 0) - (e26[i] || 0) : null);
        const sig: (number | null)[] = [];
        let e: number | null = null;
        for (let i = 0; i < macd.length; i++) {
            if (macd[i] === null) { sig.push(null); continue; }
            if (e === null) { e = macd[i] || 0; sig.push(e); continue; }
            e = (macd[i] || 0) * 2 / 10 + e * 8 / 10; sig.push(e);
        }
        const hist = macd.map((v, i) => v !== null && sig[i] !== null ? v - (sig[i] || 0) : null);
        return { macd, sig, hist };
    };

    // Draw chart
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !data || data.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const W = container.offsetWidth - 24;
        if (W <= 0) return;

        const ohlcData = generateOHLC(data);
        const N = Math.min(ohlcData.length, 55);
        const displayData = ohlcData.slice(-N);

        const VOL_H = indicators.has('vol') ? 38 : 0;
        const RSI_H = showRSI ? 64 : 0;
        const MACD_H = showMACD ? 64 : 0;
        const MAIN_H = 155;
        const PAD = { l: 4, r: 44, t: 8, b: 2 };
        const total = MAIN_H + VOL_H + (RSI_H ? RSI_H + 3 : 0) + (MACD_H ? MACD_H + 3 : 0);

        canvas.width = W * dpr;
        canvas.height = total * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = total + 'px';
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, total);

        const cw = W - PAD.l - PAD.r;
        const step = cw / N;
        const bw = Math.max(1.5, Math.floor(step * 0.7));
        const bw2 = bw / 2;
        const xAt = (i: number) => PAD.l + i * step + step / 2;

        // Price range
        let lo = Infinity, hi = -Infinity;
        displayData.forEach((c: any) => { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
        const pr = hi - lo || 1;
        lo -= pr * 0.06; hi += pr * 0.06;
        const py = (p: number) => PAD.t + (1 - (p - lo) / (hi - lo)) * (MAIN_H - PAD.t - PAD.b);

        // Grid
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        for (let g = 0; g <= 4; g++) {
            const y = PAD.t + (g / 4) * (MAIN_H - PAD.t - PAD.b);
            ctx.strokeStyle = 'rgba(26, 38, 64, 0.7)';
            ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
            const price = hi - (g / 4) * (hi - lo);
            ctx.fillStyle = '#3a5070'; ctx.font = '8px monospace'; ctx.textAlign = 'left';
            ctx.fillText(price >= 10000 ? price.toFixed(0) : price >= 1000 ? price.toFixed(0) : price.toFixed(1), W - PAD.r + 4, y + 3);
        }

        // Reference lines (Entry, SL, Target)
        const drawDash = (price: number, color: string) => {
            const y = py(price);
            if (y < PAD.t || y > MAIN_H - PAD.b) return;
            ctx.strokeStyle = color; ctx.lineWidth = 0.7; ctx.setLineDash([3, 4]);
            ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
            ctx.setLineDash([]);
        };
        drawDash(entryPrice, 'rgba(58, 142, 240, 0.5)');
        drawDash(stopLoss, 'rgba(240, 64, 96, 0.45)');
        drawDash(target, 'rgba(0, 208, 156, 0.35)');

        // Bollinger Bands
        if (indicators.has('bb')) {
            const bb = calcBB(displayData);
            ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(32, 192, 228, 0.55)';
            ['u', 'lo'].forEach((k: string) => {
                ctx.beginPath(); let st = false;
                bb.forEach((b: any, i: number) => { if (b[k] === null) return; const x = xAt(i), y = py(b[k]); st ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), st = true); });
                ctx.stroke();
            });
            ctx.beginPath(); ctx.fillStyle = 'rgba(32, 192, 228, 0.05)';
            let s = true;
            bb.forEach((b: any, i: number) => { if (b.u !== null) { s ? ctx.moveTo(xAt(i), py(b.u)) : ctx.lineTo(xAt(i), py(b.u)); s = false; } });
            for (let i = bb.length - 1; i >= 0; i--) { if (bb[i].lo != null) ctx.lineTo(xAt(i), py(bb[i].lo as number)); }
            ctx.fill();
        }

        // MAs
        const drawLine = (vals: (number | null)[], col: string, lw = 1) => {
            ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([]);
            ctx.beginPath(); let st = false;
            vals.forEach((v, i) => { if (v === null) return; const x = xAt(i), y = py(v); st ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), st = true); });
            ctx.stroke();
        };
        if (indicators.has('ma5')) drawLine(calcMA(displayData, 5), '#f0c040', 1.1);
        if (indicators.has('ma20')) drawLine(calcMA(displayData, 20), '#3a8ef0', 1.1);
        if (indicators.has('ema9')) drawLine(calcEMA(displayData, 9), '#9060f0', 1.1);

        // Candles
        displayData.forEach((c: any, i: number) => {
            const x = xAt(i);
            const bull = c.c >= c.o;
            const col = bull ? '#00d09c' : '#f04060';
            ctx.strokeStyle = col; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(x, py(c.h)); ctx.lineTo(x, py(c.l)); ctx.stroke();
            const yt = py(Math.max(c.o, c.c)), yb = py(Math.min(c.o, c.c));
            const bh = Math.max(1, yb - yt);
            ctx.fillStyle = bull ? 'rgba(0, 208, 156, 0.9)' : 'rgba(240, 64, 96, 0.9)';
            ctx.fillRect(x - bw2, yt, bw, bh);
        });

        // Volume
        if (indicators.has('vol')) {
            const vt = MAIN_H;
            const maxV = Math.max(...displayData.map((c: any) => c.v));
            displayData.forEach((c: any, i: number) => {
                const vh = ((c.v / maxV) * (VOL_H - 4));
                ctx.fillStyle = c.c >= c.o ? 'rgba(0, 208, 156, 0.25)' : 'rgba(240, 64, 96, 0.25)';
                ctx.fillRect(xAt(i) - bw2, vt + VOL_H - 4 - vh, bw, vh);
            });
            ctx.strokeStyle = 'rgba(26, 38, 64, 0.5)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(0, vt); ctx.lineTo(W, vt); ctx.stroke();
        }

        // RSI
        if (showRSI) {
            const rt = MAIN_H + VOL_H + 3;
            ctx.fillStyle = 'rgba(10, 15, 25, 0.4)'; ctx.fillRect(0, rt, W, RSI_H);
            ctx.strokeStyle = 'rgba(26, 38, 64, 0.6)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(0, rt); ctx.lineTo(W, rt); ctx.stroke();
            const ry = (v: number) => rt + (1 - v / 100) * RSI_H;
            [30, 70].forEach((lv: number) => {
                ctx.strokeStyle = 'rgba(26, 38, 64, 0.8)'; ctx.lineWidth = 0.4; ctx.setLineDash([2, 4]);
                ctx.beginPath(); ctx.moveTo(PAD.l, ry(lv)); ctx.lineTo(W - PAD.r, ry(lv)); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#3a5070'; ctx.font = '8px monospace';
                ctx.fillText(lv.toString(), W - PAD.r + 4, ry(lv) + 3);
            });
            const rsi = calcRSI(displayData);
            const lastRSI = rsi.filter(Boolean).pop()?.toFixed(0);
            ctx.lineWidth = 1; ctx.strokeStyle = '#e060a0';
            ctx.beginPath(); let sr = false;
            rsi.forEach((v, i) => { if (v === null) return; sr ? ctx.lineTo(xAt(i), ry(v)) : (ctx.moveTo(xAt(i), ry(v)), sr = true); });
            ctx.stroke();
            if (lastRSI) { ctx.fillStyle = '#e060a0'; ctx.font = '9px monospace'; ctx.fillText('RSI ' + lastRSI, 6, rt + 10); }
        }

        // MACD
        if (showMACD) {
            const mt = MAIN_H + VOL_H + (showRSI ? RSI_H + 3 : 0) + 3;
            ctx.fillStyle = 'rgba(10, 15, 25, 0.4)'; ctx.fillRect(0, mt, W, MACD_H);
            ctx.strokeStyle = 'rgba(26, 38, 64, 0.6)'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(0, mt); ctx.lineTo(W, mt); ctx.stroke();
            const { macd, sig, hist } = calcMACD(displayData);
            const vals = [...macd, ...sig, ...hist].filter((v): v is number => v !== null);
            const mlo = Math.min(...vals), mhi = Math.max(...vals);
            const mr = Math.max(Math.abs(mlo), Math.abs(mhi)) || 1;
            const my = (v: number) => mt + MACD_H / 2 - (v / mr) * (MACD_H / 2 * 0.85);
            ctx.strokeStyle = 'rgba(26, 38, 64, 0.8)'; ctx.setLineDash([2, 4]);
            ctx.beginPath(); ctx.moveTo(PAD.l, mt + MACD_H / 2); ctx.lineTo(W - PAD.r, mt + MACD_H / 2); ctx.stroke();
            ctx.setLineDash([]);
            hist.forEach((v, i) => { if (v === null) return; const y = my(v), yZ = my(0); ctx.fillStyle = v >= 0 ? 'rgba(0, 208, 156, 0.35)' : 'rgba(240, 64, 96, 0.35)'; ctx.fillRect(xAt(i) - bw2, Math.min(y, yZ), bw, Math.abs(y - yZ)); });
            ctx.lineWidth = 1; ctx.strokeStyle = '#3a8ef0';
            ctx.beginPath(); let sm = false;
            macd.forEach((v, i) => { if (v === null) return; sm ? ctx.lineTo(xAt(i), my(v)) : (ctx.moveTo(xAt(i), my(v)), sm = true); });
            ctx.stroke();
            ctx.lineWidth = 1; ctx.strokeStyle = '#f08040';
            ctx.beginPath(); let ss = false;
            sig.forEach((v, i) => { if (v === null) return; ss ? ctx.lineTo(xAt(i), my(v)) : (ctx.moveTo(xAt(i), my(v)), ss = true); });
            ctx.stroke();
            ctx.fillStyle = '#3a8ef0'; ctx.font = '9px monospace'; ctx.fillText('MACD', 6, mt + 10);
        }
    }, [data, entryPrice, stopLoss, target, indicators, showRSI, showMACD, generateOHLC]);

    // Mouse interaction
    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !data || data.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const W = canvas.width / (window.devicePixelRatio || 1);
        const PAD = { l: 4, r: 44 };
        const cw = W - PAD.l - PAD.r;
        const ohlcData = generateOHLC(data);
        const N = Math.min(ohlcData.length, 55);
        const step = cw / N;
        const i = Math.floor((mx - PAD.l) / step);

        if (i < 0 || i >= N) {
            setTooltip(prev => ({ ...prev, visible: false }));
            return;
        }

        const c = ohlcData[ohlcData.length - N + i];
        if (!c) return;

        const pnlPer = ((c.c - entryPrice) / entryPrice * 100).toFixed(2);
        const pnlColor = c.c >= entryPrice ? '#00d09c' : '#f04060';

        setTooltip({
            x: Math.min(mx + 8, W - 120),
            y: 10,
            visible: true,
            content: `<span style="color:#4a6080">#${i + 1}</span><br>O <span style="color:#dde6f0">₹${c.o.toFixed(1)}</span><br>H <span style="color:#00d09c">₹${c.h.toFixed(1)}</span><br>L <span style="color:#f04060">₹${c.l.toFixed(1)}</span><br>C <span style="color:#dde6f0;font-weight:700">₹${c.c.toFixed(1)}</span><br>V <span style="color:#4a6080">${(c.v / 1000).toFixed(0)}K</span><br>PnL <span style="color:${pnlColor}">${pnlPer}%</span>`
        });
    };

    const handleMouseLeave = () => {
        setTooltip(prev => ({ ...prev, visible: false }));
    };

    // Toggle indicators
    const toggleInd = (ind: string) => {
        if (ind === 'rsi') setShowRSI(!showRSI);
        else if (ind === 'macd') setShowMACD(!showMACD);
        else {
            const newInds = new Set(indicators);
            newInds.has(ind) ? newInds.delete(ind) : newInds.add(ind);
            setIndicators(newInds);
        }
    };

    // Draw on mount and when dependencies change
    useEffect(() => {
        draw();
        const handleResize = () => { draw(); };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [draw]);

    const gain = data.length > 0 ? ((data[data.length - 1]?.close || entryPrice) - entryPrice) / entryPrice * 100 : 0;
    const gainAmt = gain * entryPrice * quantity / 100;
    const isG = gain >= 0;
    const gc = isG ? '#00d09c' : '#f04060';

    const inds = ['ma5', 'ma20', 'ema9', 'bb', 'macd', 'rsi', 'vol'];
    const iL: Record<string, string> = { ma5: 'MA5', ma20: 'MA20', ema9: 'EMA9', bb: 'BB', macd: 'MACD', rsi: 'RSI', vol: 'VOL' };

    return (
        <div style={{ background: '#0c111c', border: '1px solid #1a2640', borderRadius: '8px', overflow: 'hidden', fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif", fontSize: '13px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 12px 6px' }}>
                <div>
                    <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: '#dde6f0' }}>{ticker.replace('-EQ', '')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                        <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '3px', fontWeight: 700, background: isG ? 'rgba(0,208,156,.12)' : 'rgba(240,64,96,.12)', color: isG ? '#00d09c' : '#f04060' }}>
                            {isG ? '5MA Safe' : 'Watch'}
                        </span>
                        <span style={{ fontSize: '10px', color: '#4a6080' }}>Qty {quantity}</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1, color: gc }}>
                        {isG ? '+' : ''}{gain.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '2px', color: gc }}>
                        {isG ? '+' : ''}{gainAmt.toFixed(1)}R
                    </div>
                </div>
            </div>

            {/* Indicator toggles */}
            <div style={{ display: 'flex', gap: '3px', padding: '4px 12px', flexWrap: 'wrap' }}>
                {inds.map(ind => {
                    const active = ind === 'rsi' ? showRSI : ind === 'macd' ? showMACD : indicators.has(ind);
                    const colors: Record<string, string> = { ma5: '#f0c040', ma20: '#3a8ef0', ema9: '#9060f0', bb: '#20c0e4', macd: '#f08040', rsi: '#e060a0', vol: '#4a6080' };
                    const col = colors[ind];
                    return (
                        <button key={ind} onClick={() => toggleInd(ind)} style={{
                            fontSize: '9px', padding: '2px 6px', borderRadius: '3px', border: `1px solid ${active ? col : '#1a2640'}`,
                            background: active ? `${col}20` : 'transparent', color: col, cursor: 'pointer', fontWeight: 600,
                            fontFamily: "'DM Mono', 'Courier New', monospace"
                        }}>
                            {iL[ind]}
                        </button>
                    );
                })}
            </div>

            {/* Timeframe row */}
            <div style={{ display: 'flex', gap: '2px', padding: '2px 12px 6px' }}>
                {(['15m', '1H', '1D'] as const).map(tf => (
                    <button key={tf} onClick={() => setTimeframe(tf)} style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '3px', border: '1px solid transparent',
                        background: timeframe === tf ? '#070b12' : 'transparent', color: timeframe === tf ? '#dde6f0' : '#4a6080',
                        cursor: 'pointer', fontWeight: 600
                    }}>
                        {tf}
                    </button>
                ))}
                <span style={{ flex: 1 }}></span>
                <span style={{ fontSize: '9px', color: '#4a6080', alignSelf: 'center', fontFamily: "'DM Mono', monospace" }}>
                    ₹{(data[data.length - 1]?.close || entryPrice).toLocaleString('en-IN')}
                </span>
            </div>

            {/* Chart */}
            <div ref={containerRef} style={{ position: 'relative', padding: '0 12px' }}>
                <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} />
                
                {/* Tooltip */}
                {tooltip.visible && (
                    <div style={{
                        position: 'absolute', left: tooltip.x, top: tooltip.y,
                        background: 'rgba(7,11,18,0.95)', border: '1px solid #1a2640', borderRadius: '6px',
                        padding: '8px 10px', fontSize: '10px', pointerEvents: 'none', zIndex: 50,
                        fontFamily: "'DM Mono', 'Courier New', monospace", lineHeight: 1.9, whiteSpace: 'nowrap', color: '#dde6f0'
                    }} dangerouslySetInnerHTML={{ __html: tooltip.content }} />
                )}
            </div>

            {/* Footer stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderTop: '1px solid #1a2640', marginTop: '4px' }}>
                <div style={{ padding: '7px 12px' }}>
                    <div style={{ fontSize: '8px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Entry</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>₹{entryPrice.toLocaleString('en-IN')}</div>
                </div>
                <div style={{ padding: '7px 12px' }}>
                    <div style={{ fontSize: '8px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>CMP</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: gc }}>₹{(data[data.length - 1]?.close || entryPrice).toLocaleString('en-IN')}</div>
                </div>
                <div style={{ padding: '7px 12px' }}>
                    <div style={{ fontSize: '8px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Stop Loss</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#f04060' }}>₹{stopLoss.toLocaleString('en-IN')}</div>
                </div>
                <div style={{ padding: '7px 12px' }}>
                    <div style={{ fontSize: '8px', color: '#4a6080', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>Target</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#00d09c' }}>₹{target.toLocaleString('en-IN')}</div>
                </div>
            </div>
        </div>
    );
}
