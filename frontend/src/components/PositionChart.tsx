import { useEffect, useRef } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    LineSeries,
    HistogramSeries,
    createSeriesMarkers,
} from 'lightweight-charts';

interface PositionChartProps {
    data: any;
}

export default function PositionChart({ data: apiData }: PositionChartProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || !apiData?.data?.length) return;

        const rows: any[] = apiData.data;

        // ── Create chart ─────────────────────────────────────────────────────
        const chart = createChart(el, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#64748b',
                fontSize: 10,
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(30,41,59,0.1)' },
            },
            crosshair: {
                vertLine: { visible: false },
                horzLine: { visible: false },
            },
            rightPriceScale: {
                borderColor: 'rgba(30,41,59,0.1)',
                scaleMargins: { top: 0.1, bottom: 0.2 },
                visible: false, // Keep it clean for the card
            },
            timeScale: {
                borderColor: 'rgba(30,41,59,0.1)',
                visible: false, // Keep it clean
            },
            handleScroll: false,
            handleScale: false,
        });

        // ── Candlesticks ──────────────────────────────────────────────────────
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });
        candleSeries.setData(rows.map((d: any) => ({
            time: d.time, open: d.open, high: d.high, low: d.low, close: d.close,
        })));

        // ── Moving averages (Simplified subset for the small card) ─────────────
        const maConfigs = [
            { key: 'ema10', color: '#00BCD466', width: 1 },
            { key: 'ema20', color: '#2196F366', width: 1 },
            { key: 'ema50', color: '#3F51B566', width: 1 },
        ];
        for (const { key, color, width } of maConfigs) {
            const maData = rows.filter((d: any) => d[key] != null && d[key] !== 0)
                .map((d: any) => ({ time: d.time, value: d[key] }));
            if (maData.length > 5) {
                const s = chart.addSeries(LineSeries, { color, lineWidth: width as any, crosshairMarkerVisible: false });
                s.setData(maData);
            }
        }

        // ── Volume histogram ───────────────────────────────────────────────────
        const volData = rows.filter((d: any) => d.volume != null && d.volume > 0)
            .map((d: any) => ({
                time: d.time,
                value: d.volume,
                color: d.close >= d.open ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            }));
        if (volData.length) {
            const volSeries = chart.addSeries(HistogramSeries, {
                priceScaleId: 'volume',
                priceFormat: { type: 'volume' },
            });
            volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0.15 }, visible: false });
            volSeries.setData(volData);
        }

        // ── VCP Score Histogram ────────────────────────────────────────────────
        const scoreData = rows.map((d: any) => {
            const s = d.rolling_score || 0;
            let color = 'rgba(120, 144, 156, 0.4)';
            if (s >= 70) color = 'rgba(16, 185, 129, 0.5)';
            else if (s >= 50) color = 'rgba(234, 179, 8, 0.5)';
            return { time: d.time, value: s, color };
        });
        if (scoreData.length) {
            const scoreSeries = chart.addSeries(HistogramSeries, { 
                priceScaleId: 'vcp_score',
                base: 0,
            });
            scoreSeries.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 }, visible: false });
            scoreSeries.setData(scoreData);
        }

        // ── Markers (Important setups) ─────────────────────────────────────────
        const markers: any[] = [];
        rows.forEach((d: any) => {
            const time = d.time;
            if (d.tier_enc === 1) markers.push({ time, position: 'belowBar', shape: 'labelUp', color: '#FFD700', text: 'T1' });

            const isVcpBuy = (d.rolling_score >= 70 && d.vol_ratio > 1.2 && d.close > d.open);
            if (isVcpBuy) {
                markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: '#10b981' });
            }
        });

        if (markers.length) {
            createSeriesMarkers(candleSeries, markers.slice(-5)); // Only show recent markers to avoid clutter
        }

        chart.timeScale().fitContent();

        const ro = new ResizeObserver(() => {
            if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        });
        ro.observe(el);

        return () => { ro.disconnect(); chart.remove(); };
    }, [apiData]);

    return <div ref={containerRef} className="w-full h-full" />;
}
