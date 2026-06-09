"use client";

import {AreaSeries, ColorType, CrosshairMode, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp} from "lightweight-charts";
import {useEffect, useRef} from "react";

import type {PriceChartProps} from "./PriceChart";

export default function PriceChartImpl({series, symbol, height = 320, decimals = 2}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

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
      rightPriceScale: {borderColor: "#1c252e"},
      timeScale: {borderColor: "#1c252e", timeVisible: true, secondsVisible: false},
      crosshair: {mode: CrosshairMode.Normal},
      handleScale: false,
      handleScroll: false
    });

    const precision = Math.max(0, Math.min(8, decimals));
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#82e2a8",
      topColor: "rgba(130, 226, 168, 0.28)",
      bottomColor: "rgba(130, 226, 168, 0.0)",
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
    chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

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
