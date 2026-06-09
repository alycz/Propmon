"use client";

import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp
} from "lightweight-charts";
import {useEffect, useRef} from "react";

import type {PriceChartProps} from "./PriceChart";

const MAX_MARKERS = 12;

export default function PriceChartImpl({series, symbol, height = 320, decimals = 2, marketMaking}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const bidLineRef = useRef<IPriceLine | null>(null);
  const askLineRef = useRef<IPriceLine | null>(null);
  const markersApiRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const markersRef = useRef<SeriesMarker<Time>[]>([]);
  const lastTickRef = useRef(0);
  const didFitRef = useRef(false);

  // Create the chart once; lightweight-charts touches the DOM/window so this only
  // runs client-side (the wrapper loads this module with ssr:false).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: {type: ColorType.Solid, color: "#0d1116"},
        textColor: "#8a949e",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11
      },
      grid: {
        vertLines: {color: "#141b21"},
        horzLines: {color: "#141b21"}
      },
      rightPriceScale: {borderColor: "#1c252e", autoScale: true},
      timeScale: {borderColor: "#1c252e", timeVisible: true, secondsVisible: false},
      crosshair: {mode: CrosshairMode.Normal},
      // Full interaction: wheel/pinch zoom on both axes, drag-to-scroll, and
      // drag the price axis to rescale the y-range manually.
      handleScale: {
        axisPressedMouseMove: {time: true, price: true},
        mouseWheel: true,
        pinch: true
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true
      }
    });

    const precision = Math.max(0, Math.min(8, decimals));
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#836ef9",
      topColor: "rgba(131, 110, 249, 0.30)",
      bottomColor: "rgba(131, 110, 249, 0.0)",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {type: "price", precision, minMove: 1 / 10 ** precision}
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) chart.applyOptions({width: Math.floor(width)});
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      bidLineRef.current = null;
      askLineRef.current = null;
      markersApiRef.current = null;
      markersRef.current = [];
      lastTickRef.current = 0;
      didFitRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, decimals]);

  // Push data whenever the series content changes (signature avoids redundant sets).
  const last = series[series.length - 1];
  const signature = `${series.length}:${last?.time ?? 0}:${last?.value ?? 0}`;
  useEffect(() => {
    const areaSeries = seriesRef.current;
    if (!areaSeries) return;
    const data = series
      .filter((point) => Number.isFinite(point.value))
      .map((point) => ({time: Math.floor(point.time) as UTCTimestamp, value: point.value}));
    areaSeries.setData(data);
    // Only auto-fit on the first data load. Afterwards the viewport is left
    // alone so the user's manual zoom / pan / y-axis scaling sticks as ticks
    // stream in.
    if (!didFitRef.current && data.length > 0) {
      chartRef.current?.timeScale().fitContent();
      didFitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Simulated market-making overlay: bid/ask quote lines that hug the mark and
  // re-center as it moves, plus periodic fill markers driven by the demo tick.
  const mmActive = marketMaking?.active ?? false;
  const mmTick = marketMaking?.tick ?? 0;
  const mmSpread = (marketMaking?.spreadBps ?? 8) / 10_000;
  const mark = last?.value;
  const markTime = last?.time;
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;

    if (bidLineRef.current) {
      s.removePriceLine(bidLineRef.current);
      bidLineRef.current = null;
    }
    if (askLineRef.current) {
      s.removePriceLine(askLineRef.current);
      askLineRef.current = null;
    }

    if (!mmActive || mark === undefined || !Number.isFinite(mark)) {
      markersRef.current = [];
      markersApiRef.current?.setMarkers([]);
      lastTickRef.current = 0;
      return;
    }

    bidLineRef.current = s.createPriceLine({
      price: mark * (1 - mmSpread),
      color: "#836ef9",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "BID"
    });
    askLineRef.current = s.createPriceLine({
      price: mark * (1 + mmSpread),
      color: "#ff6262",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "ASK"
    });

    if (markTime !== undefined && mmTick > lastTickRef.current) {
      lastTickRef.current = mmTick;
      const isAsk = mmTick % 2 === 0;
      const marker: SeriesMarker<Time> = {
        time: Math.floor(markTime) as UTCTimestamp,
        position: isAsk ? "aboveBar" : "belowBar",
        color: isAsk ? "#ff6262" : "#836ef9",
        shape: "circle",
        size: 0.6
      };
      markersRef.current = [...markersRef.current, marker].slice(-MAX_MARKERS);
    }

    if (!markersApiRef.current) {
      markersApiRef.current = createSeriesMarkers(s, markersRef.current);
    } else {
      markersApiRef.current.setMarkers(markersRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mmActive, mmTick, mark, markTime, mmSpread]);

  return (
    <div className="chartWrap">
      <div className="chartHeader">
        <span className="chartSymbol mono">{symbol}</span>
        <span className="chartMark mono">{last ? formatMark(last.value, decimals) : "--"}</span>
      </div>
      <div ref={containerRef} className="chartCanvas" style={{height}} />
    </div>
  );
}

function formatMark(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "--";
  return value >= 1
    ? `$${value.toLocaleString(undefined, {maximumFractionDigits: Math.min(decimals, 2)})}`
    : `$${value.toFixed(Math.max(decimals, 4))}`;
}
