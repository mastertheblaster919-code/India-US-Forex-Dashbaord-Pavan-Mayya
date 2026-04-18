import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
    CrosshairMode,
    createSeriesMarkers,
} from 'lightweight-charts';
import { AlertTriangle, MousePointer, TrendingUp, Minus, Square, Code, Trash2, Info } from 'lucide-react';

interface EBState { hasError: boolean; error?: string }
class ChartErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
    constructor(props: any) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError(e: Error) { return { hasError: true, error: e.message }; }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                    <AlertTriangle className="w-8 h-8 text-amber-500/60" />
                    <p className="text-sm">Chart failed to render</p>
                    <button onClick={() => this.setState({ hasError: false })} className="text-xs text-primary underline">Retry</button>
                </div>
            );
        }
        return this.props.children;
    }
}

type DrawMode = 'none' | 'trendline' | 'hline' | 'rect';
interface Drawing { id: string; type: DrawMode; points: { time: string; price: number }[]; color: string; }
interface VCPMetrics {
    score: number; r1: number; r5: number; r21: number; r63: number;
    rs: number; bbw_pctl: number; adx: number; rsi: number; vol_ratio: number;
    trend: number; atr_pct: number; dist52: number; tightness: number;
    wbase: number; squeeze: number; stage: number; vol_dry_days: number;
    handle_depth: number; sparkline: number[]; tier: number; pdh_trigger: number;
    rs_pctl: number; checklist: number; ema10: number; ema20: number;
    ema50: number; ema150: number; ema200: number;
}

function computeVCPMetrics(rows: any[]): VCPMetrics[] {
    if (!rows || rows.length < 50) return [];
    const n = rows.length;
    const closes = rows.map(r => r.close);
    const highs = rows.map(r => r.high);
    const lows = rows.map(r => r.low);
    const volumes = rows.map(r => r.volume || 0);

    const ema10 = calculateEMA(closes, 10);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema150 = calculateEMA(closes, 150);
    const ema200 = calculateEMA(closes, 200);

    const bbBasis = calculateSMA(closes, 20);
    const bbUpper = bbBasis.map((b, i) => b + 2 * calculateStdDev(closes.slice(Math.max(0, i - 19), i + 1), 20));
    const bbLower = bbBasis.map((b, i) => b - 2 * calculateStdDev(closes.slice(Math.max(0, i - 19), i + 1), 20));
    const bbw = bbUpper.map((u, i) => bbBasis[i] > 0 ? ((u - bbLower[i]) / bbBasis[i]) * 100 : 0);

    const smaVol20 = calculateSMA(volumes, 20);
    const volRatio = volumes.map((v, i) => smaVol20[i] > 0 ? v / smaVol20[i] : 1);

    const atr = calculateATR(highs, lows, closes, 14);
    const atrPct = atr.map((a, i) => closes[i] > 0 ? (a / closes[i]) * 100 : 0);

    const highest252 = calculateHighest(highs, 252);
    const dist52 = highest252.map((h, i) => closes[i] > 0 ? (1 - closes[i] / h) * 100 : 0);

    const r1 = closes.map((c, i) => i > 0 && closes[i - 1] > 0 ? ((c - closes[i - 1]) / closes[i - 1]) * 100 : 0);
    const r5 = closes.map((c, i) => i > 4 && closes[i - 5] > 0 ? ((c - closes[i - 5]) / closes[i - 5]) * 100 : 0);
    const r21 = closes.map((c, i) => i > 20 && closes[i - 21] > 0 ? ((c - closes[i - 21]) / closes[i - 21]) * 100 : 0);
    const r63 = closes.map((c, i) => i > 62 && closes[i - 63] > 0 ? ((c - closes[i - 63]) / closes[i - 63]) * 100 : 0);

    const rsi = calculateRSI(closes, 14);

    const plusDM: number[] = [], minusDM: number[] = [], tr: number[] = [];
    for (let i = 0; i < n; i++) {
        if (i === 0) {
            plusDM.push(0); minusDM.push(0); tr.push(highs[0] - lows[0]);
            continue;
        }
        const hp = highs[i] - highs[i - 1], hp2 = lows[i - 1] - lows[i];
        plusDM.push(hp > hp2 && hp > 0 ? hp : 0);
        minusDM.push(hp2 > hp && hp2 > 0 ? hp2 : 0);
        tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const adx = calculateADX(plusDM, minusDM, tr, 14);

    const metrics: VCPMetrics[] = [];
    for (let i = 0; i < n; i++) {
        const row = rows[i];
        const c = closes[i];
        const e10 = ema10[i], e20 = ema20[i], e50 = ema50[i], e150 = ema150[i], e200 = ema200[i];

        let trend = 0;
        if (c > e20 && e20 > e50 && e50 > e150 && e150 > e200) trend = 1;
        else if (c > e50) trend = 0.5;

        const tightness1 = e20 > 0 ? ((highs[Math.max(0, i - 9)] - lows[Math.max(0, i - 9)]) / c) * 100 : 0;
        const tightness2 = e20 > 0 ? ((highs[Math.max(0, i - 19)] - lows[Math.max(0, i - 19)]) / c) * 100 : 0;
        const tightness3 = e20 > 0 ? ((highs[Math.max(0, i - 29)] - lows[Math.max(0, i - 29)]) / c) * 100 : 0;
        let tightness = tightness1 < tightness2 && tightness2 < tightness3 ? 3 : tightness1 < tightness2 ? 2 : 1;

        let score = 0;
        const bbwp = bbw[i] || 0;
        const rsVal = 100; // Placeholder until benchmark is added
        
        if (row.rolling_score !== undefined) {
            score = row.rolling_score;
        } else {
            score += (100 - bbwp) * 0.35;
            score += rsVal > 105 ? 20 : rsVal > 100 ? 10 : 0;
            score += trend === 1 ? 15 : trend === 0.5 ? 5 : 0;
            score += volRatio[i] < 0.8 ? 10 : 0;
            score += dist52[i] < 5 ? 10 : dist52[i] < 15 ? 5 : 0;
            score += tightness >= 2 ? 10 : 0;
        }

        const hi52 = highest252[i];
        const inBase = c >= hi52 * 0.70;
        let wbase = 0;
        if (inBase) {
            wbase = (i - rows.findIndex(r => r.high >= hi52 * 0.70)) / 5;
            if (wbase < 0) wbase = 0;
        }

        const kcRange = atr[i] * 1.5;
        const squeeze = bbLower[i] > (bbBasis[i] - kcRange) && bbUpper[i] < (bbBasis[i] + kcRange) ? 1 : 0;

        let stage = 1;
        const e200Rising = e200 > (ema200[Math.max(0, i - 10)] || e200);
        if (c > e150 && c > e200 && e200Rising) stage = 2;
        else if (c < e150 && c > e200) stage = 3;
        else if (c < e150 && c < e200) stage = 4;

        let volDryDays = 0;
        for (let j = i; j >= 0 && volRatio[j] < 1.0; j--) volDryDays++;

        const high10 = Math.max(...highs.slice(Math.max(0, i - 10), i + 1));
        const handleDepth = high10 > 0 ? ((high10 - lows[i]) / high10) * 100 : 0;

        const tier = 0;
        const pdhTrigger = (highs[i] > (highs[i - 1] || 0)) && score >= 60 && tightness >= 2 ? 1 : 0;

        let checklist = 0;
        if (rsVal > 100) checklist++;
        if (bbwp < 25) checklist++;
        if (volRatio[i] < 1.0) checklist++;
        if (tightness >= 2) checklist++;
        if (dist52[i] < 15) checklist++;
        if (adx[i] > 20) checklist++;
        if (trend === 1) checklist++;

        const sparkline = [1, 2, 3, 4, 5, 6, 7, 8].map(offset => {
            if (i - offset < 0) return 0;
            const start = Math.max(0, i - offset - 7);
            const sMin = Math.min(...closes.slice(start, i - offset + 1));
            const sMax = Math.max(...closes.slice(start, i - offset + 1));
            const sRng = sMax - sMin;
            return sRng > 0 ? Math.round(((closes[i - offset] - sMin) / sRng) * 6) : 0;
        });

        metrics.push({
            score, r1: r1[i], r5: r5[i], r21: r21[i], r63: r63[i],
            rs: rsVal, bbw_pctl: bbwp, adx: adx[i] || 0, rsi: rsi[i] || 50,
            vol_ratio: volRatio[i], trend, atr_pct: atrPct[i], dist52: dist52[i],
            tightness, wbase, squeeze, stage, vol_dry_days: volDryDays,
            handle_depth: handleDepth, sparkline, tier, pdh_trigger: pdhTrigger,
            rs_pctl: 50, checklist, ema10: e10, ema20: e20, ema50: e50,
            ema150: e150, ema200: e200
        });
    }
    return metrics;
}

function calculateSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) { result.push(data[i]); continue; }
        const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push(sum / period);
    }
    return result;
}

function calculateEMA(data: number[], period: number): number[] {
    const k = 2 / (period + 1);
    const result: number[] = [];
    let prev = data[0];
    for (let i = 0; i < data.length; i++) {
        if (i === 0) { result.push(data[i]); prev = data[i]; continue; }
        const ema = data[i] * k + prev * (1 - k);
        result.push(ema);
        prev = ema;
    }
    return result;
}

function calculateStdDev(data: number[], period: number): number {
    if (data.length < period) return 0;
    const slice = data.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    return Math.sqrt(variance);
}

function calculateHighest(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - period + 1);
        const slice = data.slice(start, i + 1);
        result.push(Math.max(...slice));
    }
    return result;
}

function calculateRSI(data: number[], period: number): number[] {
    const rsi: number[] = new Array(data.length).fill(50);
    if (data.length <= period) return rsi;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const diff = data[i] - data[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i] - data[i - 1];
        const gain = diff >= 0 ? diff : 0;
        const loss = diff < 0 ? -diff : 0;

        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;

        if (avgLoss === 0) rsi[i] = 100;
        else {
            const rs = avgGain / avgLoss;
            rsi[i] = 100 - (100 / (1 + rs));
        }
    }
    return rsi;
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number): number[] {
    const tr: number[] = [highs[0] - lows[0]];
    for (let i = 1; i < highs.length; i++) {
        tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < tr.length; i++) {
        sum += tr[i];
        result.push(i < period ? sum / (i + 1) : sum / period);
        if (i >= period) sum -= tr[i - period];
    }
    return result;
}

function calculateADX(plusDM: number[], minusDM: number[], tr: number[], period: number): number[] {
    const n = plusDM.length;
    const adx: number[] = new Array(n).fill(0);
    const diPlus: number[] = [], diMinus: number[] = [];
    
    for (let i = 0; i < n; i++) {
        const start = Math.max(0, i - period + 1);
        const sumPlus = plusDM.slice(start, i + 1).reduce((a, b) => a + b, 0);
        const sumMinus = minusDM.slice(start, i + 1).reduce((a, b) => a + b, 0);
        const sumTR = tr.slice(start, i + 1).reduce((a, b) => a + b, 0);
        
        const dip = sumTR > 0 ? (sumPlus / sumTR) * 100 : 0;
        const dim = sumTR > 0 ? (sumMinus / sumTR) * 100 : 0;
        diPlus.push(dip);
        diMinus.push(dim);
        
        const dx = dip + dim > 0 ? Math.abs(dip - dim) / (dip + dim) * 100 : 0;
        adx[i] = dx;
    }
    
    // Smooth ADX
    const smoothAdx: number[] = new Array(n).fill(0);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += adx[i];
        if (i >= period) sum -= adx[i - period];
        smoothAdx[i] = i < period ? sum / (i + 1) : sum / period;
    }
    return smoothAdx;
}

function decodeSparklineChar(v: number): string {
    return v === 0 ? '▁' : v === 1 ? '▂' : v === 2 ? '▃' : v === 3 ? '▄' : v === 4 ? '▅' : v === 5 ? '▆' : v === 6 ? '▇' : '█';
}

function decodeSparkline(spark: number[]): string {
    return spark.slice().reverse().map(decodeSparklineChar).join('');
}

function TVChartInner({ data: apiData, indicators = new Set(), ticker = '' }: { data: any; indicators?: Set<string>; ticker?: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const [drawMode, setDrawMode] = useState<DrawMode>('none');
    const [drawColor, setDrawColor] = useState('#2196F3');
    const [drawings, setDrawings] = useState<Drawing[]>([]);
    const [showPineDialog, setShowPineDialog] = useState(false);
    const [pineScripts, setPineScripts] = useState<any[]>([]);
    const [pineInput, setPineInput] = useState('');
    const [vcpMetrics, setVcpMetrics] = useState<VCPMetrics[]>([]);
    const [showDashboard, setShowDashboard] = useState(true);
    const [overlays, setOverlays] = useState({ ema20: true, ema50: true, rsi: true, macd: false, bb: false, volume: true, adx: false, vcpScore: true });
    const drawStartRef = useRef<{ time: string; price: number } | null>(null);

    const toggleOverlay = (key: keyof typeof overlays) => {
        setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const DRAW_COLORS = ['#2196F3', '#4CAF50', '#f97316', '#ef4444', '#9C27B0', '#00BCD4', '#FFEB3B'];

    const saveDrawings = useCallback((d: Drawing[]) => {
        if (ticker) localStorage.setItem(`drawings_${ticker}`, JSON.stringify(d));
    }, [ticker]);

    const loadDrawings = useCallback(() => {
        if (ticker) {
            const saved = localStorage.getItem(`drawings_${ticker}`);
            if (saved) { try { setDrawings(JSON.parse(saved)); } catch {} }
            const scripts = localStorage.getItem('pine_scripts');
            if (scripts) { try { setPineScripts(JSON.parse(scripts)); } catch {} }
        }
    }, [ticker]);

    useEffect(() => { loadDrawings(); }, [loadDrawings]);

    useEffect(() => {
        if (apiData?.data?.length) {
            const metrics = computeVCPMetrics(apiData.data);
            setVcpMetrics(metrics);
        }
    }, [apiData]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !apiData?.data?.length) return;

        const rows: any[] = apiData.data;
        const mergedIndicators = new Set([...indicators]);
        Object.entries(overlays).forEach(([key, enabled]) => {
            if (enabled) mergedIndicators.add(key);
        });
        const metrics = vcpMetrics.length === rows.length ? vcpMetrics : computeVCPMetrics(rows);

        const chart = createChart(el, {
            layout: { background: { type: ColorType.Solid, color: '#0a0e1a' }, textColor: '#94a3b8', fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
            grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(30,41,59,0.4)' } },
            crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(59,130,246,0.4)', style: 2, labelBackgroundColor: '#2962FF', width: 1 }, horzLine: { color: 'rgba(59,130,246,0.4)', style: 2, labelBackgroundColor: '#2962FF', width: 1 } },
            rightPriceScale: { borderColor: '#1e1e32', scaleMargins: { top: 0.1, bottom: 0.35 } },
            timeScale: { borderColor: '#1e1e32', timeVisible: true, secondsVisible: false },
            autoSize: true,
        });
        chartRef.current = chart;

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#4ade80', downColor: '#f87171', borderVisible: false, wickUpColor: '#4ade80', wickDownColor: '#f87171',
        });
        candleSeries.setData(rows.map((d: any) => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close })));

        const addLineSeries = (data: { time: string; value: number }[], color: string, lw = 1) => {
            if (!data?.length) return null;
            const s = chart.addSeries(LineSeries, { color, lineWidth: lw as any, crosshairMarkerVisible: false });
            s.setData(data.filter(d => d.value !== 0 && !isNaN(d.value)));
            return s;
        };

        const emaConfigs = [
            { key: 'ema10', color: '#00BCD499', width: 1 },
            { key: 'ema20', color: '#2196F399', width: 2 },
            { key: 'ema50', color: '#3F51B599', width: 2 },
            { key: 'ema150', color: '#673AB799', width: 1 },
            { key: 'ema200', color: '#9C27B099', width: 1 },
        ];
        for (const { key, color, width } of emaConfigs) {
            if (!mergedIndicators.has(key)) continue;
            const maData = rows.filter((_: any, i: number) => {
                const m = metrics[i];
                return m && (m as any)[key] != null && (m as any)[key] !== 0;
            }).map((d: any) => ({ time: d.time, value: (metrics[rows.indexOf(d)]?.[key as keyof typeof metrics[0]] as number) || 0 }));
            if (maData.length > 5) {
                addLineSeries(maData, color, width);
            }
        }

        if (mergedIndicators.has('bb')) {
            const bbBasis = calculateSMA(rows.map(r => r.close), 20);
            const bbUpper = rows.map((_: any, i: number) => {
                const slice = rows.slice(Math.max(0, i - 19), i + 1).map(r => r.close);
                const std = calculateStdDev(slice, 20);
                return bbBasis[i] + 2 * std;
            });
            const bbLower = rows.map((_: any, i: number) => {
                const slice = rows.slice(Math.max(0, i - 19), i + 1).map(r => r.close);
                const std = calculateStdDev(slice, 20);
                return bbBasis[i] - 2 * std;
            });
            addLineSeries(rows.map((d: any, i: number) => ({ time: d.time, value: bbUpper[i] })), '#9E9E9E', 1);
            addLineSeries(rows.map((d: any, i: number) => ({ time: d.time, value: bbLower[i] })), '#9E9E9E', 1);
        }

        if (mergedIndicators.has('macd')) {
            chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.55 } } });
            const ema12 = calculateEMA(rows.map(r => r.close), 12);
            const ema26 = calculateEMA(rows.map(r => r.close), 26);
            const macdLine = rows.map((_, i) => ({ time: rows[i].time, value: ema12[i] - ema26[i] }));
            const signalLine = calculateEMA(macdLine.map(m => m.value), 9);
            addLineSeries(macdLine, '#2196F3', 2);
            addLineSeries(rows.map((d: any, i: number) => ({ time: d.time, value: signalLine[i] })), '#FF5722', 1);
        }

        if (mergedIndicators.has('volume')) {
            chart.applyOptions({ rightPriceScale: { scaleMargins: { top: 0.05, bottom: 0.35 } } });
            const volData = rows.filter((d: any) => d.volume > 0).map((d: any) => ({ 
                time: d.time, 
                value: d.volume, 
                color: d.close >= d.open ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)' 
            }));
            if (volData.length) {
                const volSeries = chart.addSeries(HistogramSeries, { 
                    priceScaleId: 'volume', 
                    priceFormat: { type: 'volume' },
                });
                chart.priceScale('volume').applyOptions({ 
                    scaleMargins: { top: 0.75, bottom: 0.15 },
                    visible: false
                });
                volSeries.setData(volData);
            }
        }

        if (mergedIndicators.has('vcpScore')) {
            const scoreData = rows.map((d, i) => {
                const s = metrics[i]?.score || 0;
                let color = 'rgba(120, 144, 156, 0.5)'; // Baseline gray
                if (s >= 70) color = 'rgba(0, 230, 118, 0.6)'; // Success green
                else if (s >= 50) color = 'rgba(255, 214, 0, 0.6)'; // Warning yellow
                
                return { time: d.time, value: s, color };
            });

            if (scoreData.length > 10) {
                const scoreSeries = chart.addSeries(HistogramSeries, { 
                    priceScaleId: 'vcp_score',
                    base: 0,
                });
                chart.priceScale('vcp_score').applyOptions({ 
                    scaleMargins: { top: 0.88, bottom: 0 },
                    visible: false,
                });
                scoreSeries.setData(scoreData);

                // Add Buy (70) and Watch (50) levels
                const buyLevel = chart.addSeries(LineSeries, { 
                    priceScaleId: 'vcp_score', 
                    color: 'rgba(0, 230, 118, 0.3)', 
                    lineWidth: 1 as any, 
                    lineStyle: 2, 
                    crosshairMarkerVisible: false 
                });
                buyLevel.setData(scoreData.map(d => ({ time: d.time, value: 70 })));

                const watchLevel = chart.addSeries(LineSeries, { 
                    priceScaleId: 'vcp_score', 
                    color: 'rgba(255, 214, 0, 0.3)', 
                    lineWidth: 1 as any, 
                    lineStyle: 3, 
                    crosshairMarkerVisible: false 
                });
                watchLevel.setData(scoreData.map(d => ({ time: d.time, value: 50 })));
            }
        }

        if (mergedIndicators.has('rsi')) {
            const rsiData = rows.filter((_: any, i: number) => metrics[i]?.rsi != null).map((d: any, i: number) => ({ time: d.time, value: metrics[i]?.rsi || 50 }));
            if (rsiData.length > 10) {
                const rsiSeries = chart.addSeries(LineSeries, { priceScaleId: 'rsi', color: '#a78bfa', lineWidth: 2 as any });
                chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.87, bottom: 0 }, visible: false });
                rsiSeries.setData(rsiData);
                for (const [level, color] of [[70, 'rgba(248,113,113,0.35)'], [30, 'rgba(74,222,128,0.35)']] as const) {
                    const refS = chart.addSeries(LineSeries, { priceScaleId: 'rsi', color, lineWidth: 1 as any, lineStyle: 2, crosshairMarkerVisible: false });
                    refS.setData(rsiData.map((d: any) => ({ time: d.time, value: level })));
                }
            }
        }

        if (mergedIndicators.has('adx')) {
            const adxData = rows.filter((_, i) => metrics[i]?.adx > 0).map((d: any, i: number) => ({ time: d.time, value: metrics[i]?.adx || 0 }));
            if (adxData.length > 10) {
                const adxSeries = chart.addSeries(LineSeries, { priceScaleId: 'adx', color: '#9C27B0', lineWidth: 2 as any });
                chart.priceScale('adx').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.1 }, visible: false });
                adxSeries.setData(adxData);
            }
        }

        if (mergedIndicators.has('trendlines') && apiData.trendlines) {
            const tl = apiData.trendlines;
            if (tl.resistance?.length) addLineSeries(tl.resistance.map((p: any) => ({ time: p.time, value: p.value })), '#f97316');
            if (tl.support?.length) addLineSeries(tl.support.map((p: any) => ({ time: p.time, value: p.value })), '#06b6d4');
        }

        // Draw user drawings
        drawings.forEach(d => {
            if (d.points.length < 2) return;
            const s = chart.addSeries(LineSeries, { color: d.color, lineWidth: 2 as any, crosshairMarkerVisible: false });
            s.setData(d.points.map(p => ({ time: p.time, value: p.price })));
        });

        // Add Markers for VCP signals and Squeeze
        const markers: any[] = [];
        rows.forEach((d, i) => {
            const m = metrics[i];
            if (!m) return;
            
            if (m.squeeze === 1) {
                markers.push({
                    time: d.time,
                    position: 'belowBar',
                    shape: 'circle',
                    color: '#FF5252',
                    text: 'S',
                });
            }

            if (m.score >= 70 && d.close > d.open) {
                markers.push({
                    time: d.time,
                    position: 'aboveBar',
                    shape: 'arrowDown',
                    color: '#00E676',
                    text: 'VCP',
                });
            }
        });
        if (markers.length) {
            createSeriesMarkers(candleSeries, markers);
        }

        chart.subscribeClick((param: any) => {
            if (drawMode === 'none' || !param.time) return;
            if (!drawStartRef.current) {
                const price = param.seriesData.get(candleSeries)?.close || 0;
                drawStartRef.current = { time: param.time, price };
            } else {
                const newDrawing: Drawing = { id: Date.now().toString(), type: drawMode, points: [drawStartRef.current, { time: param.time, price: param.seriesData.get(candleSeries)?.close || drawStartRef.current.price }], color: drawColor };
                setDrawings(prev => { const next = [...prev, newDrawing]; saveDrawings(next); return next; });
                drawStartRef.current = null;
            }
        });

        chart.timeScale().fitContent();
        const ro = new ResizeObserver(() => { if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); });
        ro.observe(el);

        return () => { ro.disconnect(); chart.remove(); };
    }, [apiData, indicators, overlays, drawings, drawMode, drawColor, saveDrawings, vcpMetrics]);

    const clearDrawings = () => { setDrawings([]); if (ticker) localStorage.removeItem(`drawings_${ticker}`); };

    const addPineScript = () => {
        if (!pineInput.trim()) return;
        const name = pineInput.split('\n')[0].replace('//', '').trim() || `Script ${pineScripts.length + 1}`;
        const newScript = { name, formula: pineInput };
        const updated = [...pineScripts, newScript];
        setPineScripts(updated);
        localStorage.setItem('pine_scripts', JSON.stringify(updated));
        setPineInput('');
        setShowPineDialog(false);
    };

    if (!apiData?.data?.length) return <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data</div>;

    const lastMetric = (vcpMetrics[vcpMetrics.length - 1] || {}) as VCPMetrics;
    const scoreColor = (lastMetric.score || 0) >= 70 ? '#00E676' : (lastMetric.score || 0) >= 50 ? '#FFD600' : '#607d8b';
    const stageColor = lastMetric.stage === 2 ? '#00E676' : lastMetric.stage === 1 ? '#757575' : '#FF5252';

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 p-2 bg-[#0a0e1a] border-b border-[#1e1e32] flex-wrap">
                <span className="text-xs text-slate-400 font-mono">{ticker || 'Chart'}</span>
                <div className="h-4 w-px bg-[#1e1e32]" />
                {([{ key: 'none', icon: MousePointer, label: 'Select' }, { key: 'trendline', icon: TrendingUp, label: 'Line' }, { key: 'hline', icon: Minus, label: 'H-Line' }, { key: 'rect', icon: Square, label: 'Rect' }] as const).map(m => (
                    <button key={m.key} onClick={() => setDrawMode(m.key)} className={`p-1.5 rounded text-xs ${drawMode === m.key ? 'bg-primary text-white' : 'bg-[#1a1a28] text-slate-400 hover:text-white'}`} title={m.label}>
                        <m.icon size={14} />
                    </button>
                ))}
                <div className="flex items-center gap-1">
                    {DRAW_COLORS.map(c => (
                        <button key={c} onClick={() => setDrawColor(c)} className={`w-4 h-4 rounded border ${drawColor === c ? 'border-white' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                    ))}
                </div>
                <div className="h-4 w-px bg-[#1e1e32]" />
                <button onClick={clearDrawings} className="p-1.5 bg-[#1a1a28] rounded text-slate-400 hover:text-red-400" title="Clear drawings"><Trash2 size={14} /></button>
                <button onClick={() => setShowPineDialog(true)} className="flex items-center gap-1 px-2 py-1 bg-[#1a1a28] rounded text-slate-400 hover:text-primary text-xs" title="Pine Script"><Code size={14} /> Pine</button>
                <div className="h-4 w-px bg-[#1e1e32]" />
                <button onClick={() => setShowDashboard(!showDashboard)} className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${showDashboard ? 'bg-primary text-white' : 'bg-[#1a1a28] text-slate-400'}`}><Info size={14} /> VCP</button>
                <div className="h-4 w-px bg-[#1e1e32]" />
                <button onClick={() => toggleOverlay('ema20')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.ema20 ? 'bg-[#2196F3]/30 text-[#2196F3]' : 'bg-[#1a1a28] text-slate-500'}`} title="EMA 20">E20</button>
                <button onClick={() => toggleOverlay('ema50')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.ema50 ? 'bg-[#3F51B5]/30 text-[#3F51B5]' : 'bg-[#1a1a28] text-slate-500'}`} title="EMA 50">E50</button>
                <button onClick={() => toggleOverlay('rsi')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.rsi ? 'bg-[#a78bfa]/30 text-[#a78bfa]' : 'bg-[#1a1a28] text-slate-500'}`} title="RSI">RSI</button>
                <button onClick={() => toggleOverlay('macd')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.macd ? 'bg-[#2196F3]/30 text-[#2196F3]' : 'bg-[#1a1a28] text-slate-500'}`} title="MACD">MACD</button>
                <button onClick={() => toggleOverlay('bb')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.bb ? 'bg-[#9E9E9E]/30 text-[#9E9E9E]' : 'bg-[#1a1a28] text-slate-500'}`} title="Bollinger Bands">BB</button>
                <button onClick={() => toggleOverlay('volume')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.volume ? 'bg-[#4CAF50]/30 text-[#4CAF50]' : 'bg-[#1a1a28] text-slate-500'}`} title="Volume">VOL</button>
                <button onClick={() => toggleOverlay('vcpScore')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.vcpScore ? 'bg-emerald-400/30 text-emerald-400' : 'bg-[#1a1a28] text-slate-500'}`} title="VCP Score Histogram">VCP</button>
                <button onClick={() => toggleOverlay('adx')} className={`px-1.5 py-1 rounded text-[10px] font-bold ${overlays.adx ? 'bg-[#9C27B0]/30 text-[#9C27B0]' : 'bg-[#1a1a28] text-slate-500'}`} title="ADX">ADX</button>
                {drawings.length > 0 && <span className="text-[10px] text-slate-500">{drawings.length} drawings</span>}
            </div>

            {showDashboard && (
                <div className="flex flex-wrap gap-3 p-2 bg-[#0D1B2A]/90 border-b border-[#333] text-[10px] font-mono">
                    <div className="flex flex-col"><span className="text-slate-500">SCORE</span><span style={{ color: scoreColor }}>{lastMetric.score?.toFixed(0) || '--'}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">STAGE</span><span style={{ color: stageColor }}>S{lastMetric.stage || 1}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">CHECK</span><span style={{ color: lastMetric.checklist >= 6 ? '#00E676' : lastMetric.checklist >= 4 ? '#FFD600' : '#607d8b' }}>{lastMetric.checklist || 0}/7</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">SPARK</span><span className="text-[#FFD600]">{decodeSparkline(lastMetric.sparkline || [0,0,0,0,0,0,0,0])}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">BBW%</span><span style={{ color: (lastMetric.bbw_pctl || 0) < 15 ? '#00E676' : '#FF5252' }}>{(lastMetric.bbw_pctl || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">SQUEEZE</span><span style={{ color: lastMetric.squeeze === 1 ? '#FF5252' : '#607d8b' }}>{lastMetric.squeeze === 1 ? 'ON' : 'OFF'}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">TIGHT</span><span className="text-[#FFD600]">{lastMetric.tightness || 0}T</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">RVOL</span><span style={{ color: (lastMetric.vol_ratio || 0) < 0.8 ? '#00E676' : (lastMetric.vol_ratio || 0) > 2 ? '#FFD600' : '#fff' }}>{(lastMetric.vol_ratio || 0).toFixed(2)}x</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">VOL DRY</span><span style={{ color: (lastMetric.vol_dry_days || 0) >= 3 ? '#00E676' : '#607d8b' }}>{lastMetric.vol_dry_days || 0}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">52W%</span><span style={{ color: (lastMetric.dist52 || 0) < 5 ? '#00E676' : '#FFD600' }}>{(lastMetric.dist52 || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">ADX</span><span className="text-white">{(lastMetric.adx || 0).toFixed(0)}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">WBASE</span><span style={{ color: (lastMetric.wbase || 0) >= 6 ? '#00E676' : '#FFD600' }}>{(lastMetric.wbase || 0).toFixed(1)}W</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">HNDL%</span><span style={{ color: (lastMetric.handle_depth || 0) < 12 ? '#00E676' : '#FF5252' }}>{(lastMetric.handle_depth || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">TIER</span><span style={{ color: (lastMetric.tier || 0) > 0 ? '#FFD600' : '#607d8b' }}>{(lastMetric.tier || 0) > 0 ? `T${lastMetric.tier}` : '--'}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">PDH</span><span style={{ color: lastMetric.pdh_trigger === 1 ? '#00E676' : '#607d8b' }}>{lastMetric.pdh_trigger === 1 ? 'YES' : 'NO'}</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">1D</span><span style={{ color: (lastMetric.r1 || 0) > 0 ? '#00E676' : '#FF5252' }}>{(lastMetric.r1 || 0).toFixed(2)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">5D</span><span style={{ color: (lastMetric.r5 || 0) > 0 ? '#00E676' : '#FF5252' }}>{(lastMetric.r5 || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">1M</span><span style={{ color: (lastMetric.r21 || 0) > 0 ? '#00E676' : '#FF5252' }}>{(lastMetric.r21 || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">3M</span><span style={{ color: (lastMetric.r63 || 0) > 0 ? '#00E676' : '#FF5252' }}>{(lastMetric.r63 || 0).toFixed(1)}%</span></div>
                    <div className="flex flex-col"><span className="text-slate-500">ATR%</span><span className="text-slate-400">{(lastMetric.atr_pct || 0).toFixed(2)}%</span></div>
                </div>
            )}

            {showPineDialog && (
                <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center">
                    <div className="bg-[#12121c] border border-[#1e1e32] rounded-lg p-4 w-[500px] max-h-[80vh] overflow-auto">
                        <h3 className="text-sm font-bold text-white mb-3">Pine Script Import</h3>
                        <textarea value={pineInput} onChange={e => setPineInput(e.target.value)} placeholder="// Paste Pine Script here..." className="w-full h-40 bg-[#1a1a28] border border-[#1e1e32] rounded text-[10px] font-mono text-slate-300 p-2" />
                        <div className="flex gap-2 mt-3">
                            <button onClick={addPineScript} className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:bg-primary/90">Add Script</button>
                            <button onClick={() => setShowPineDialog(false)} className="px-3 py-1.5 bg-[#1a1a28] text-slate-400 rounded text-xs hover:text-white">Cancel</button>
                        </div>
                        {pineScripts.length > 0 && (
                            <div className="mt-4">
                                <h4 className="text-xs text-slate-400 mb-2">Saved Scripts:</h4>
                                {pineScripts.map((s, i) => (
                                    <div key={i} className="text-[10px] font-mono text-slate-500 mb-1 p-1 bg-[#1a1a28] rounded">{s.name}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div ref={containerRef} className="flex-1 min-h-0" />
        </div>
    );
}

export default function TVChart({ data, indicators, ticker }: { data: any; indicators?: Set<string>; ticker?: string }) {
    return (
        <ChartErrorBoundary>
            <TVChartInner data={data} indicators={indicators} ticker={ticker} />
        </ChartErrorBoundary>
    );
}