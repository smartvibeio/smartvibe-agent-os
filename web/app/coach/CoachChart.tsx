"use client";
import { useEffect, useRef, type ReactNode } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type Time,
  type SeriesMarker,
  type LogicalRange,
  type LineData,
  type WhitespaceData,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import {
  calcBollinger,
  calcMacd,
  calcRsi,
  type Candle,
} from "@smartvibe/agent/indicators.js";
const NO_MARKERS: SeriesMarker<Time>[] = [];
export type ChartActionTag = { time: number; side: "long" | "short"; title: string; price: number; priceLabel?: string };
export type ChartAgentNote = { time: number; side: "long" | "short"; text: string; price: number; lane: number };
export default function CoachChart({ candles, markers = NO_MARKERS, compact = false, actionTags = [], agentNotes = [], entryLine = null, mainHeight: requestedMainHeight, overlay }: { candles: Candle[]; markers?: SeriesMarker<Time>[]; compact?: boolean; actionTags?: ChartActionTag[]; agentNotes?: ChartAgentNote[]; entryLine?: { price: number; title: string; side?: "long" | "short" } | null; mainHeight?: number; overlay?: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const mainRoot = useRef<HTMLDivElement>(null);
  const macdRoot = useRef<HTMLDivElement>(null);
  const rsiRoot = useRef<HTMLDivElement>(null);
  const indicatorCharts = useRef<{ macd?: IChartApi; rsi?: IChartApi }>({});
  const updateChartData = useRef<((nextCandles: Candle[], nextMarkers: SeriesMarker<Time>[]) => void) | null>(null);
  const indicatorHeights = useRef({ macd: 105, rsi: 105 });
  const savedVisibleRange = useRef<LogicalRange | null>(null);
  const draggedNotes = useRef(new Map<string, { left: number; top: number }>());
  const hasCandles = candles.length > 0;
  const actionTagsKey = actionTags.map((tag) => `${tag.time}:${tag.side}:${tag.title}:${tag.price}:${tag.priceLabel ?? ""}`).join("|");
  const agentNotesKey = agentNotes.map((note) => `${note.time}:${note.side}:${note.text}:${note.price}:${note.lane}`).join("|");
  const entryLineKey = entryLine ? `${entryLine.price}:${entryLine.title}:${entryLine.side ?? ""}` : "";
  useEffect(() => {
    if (!root.current || !mainRoot.current || !candles.length) return;
    const charts: IChartApi[] = [];
    // 指标形成前也保留同一根 K 线的空白时间点，三个图层才能共享同一条时间轴。
    const lines = (source: Candle[], values: (number | null)[]): Array<LineData<Time> | WhitespaceData<Time>> =>
      values.map((value, index) => value == null
        ? { time: source[index].time as Time }
        : { time: source[index].time as Time, value });
    const make = (container: HTMLElement, height: number, interactive = true) => {
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "#0b0e11" },
          textColor: "#adb6c3",
          attributionLogo: false,
        },
        localization: { locale: "zh-CN" },
        width: root.current!.clientWidth,
        height,
        grid: {
          vertLines: { color: "#1e2329" },
          horzLines: { color: "#1e2329" },
        },
        rightPriceScale: { minimumWidth: 85, borderColor: "#2b3139" },
        timeScale: { timeVisible: true, borderColor: "#2b3139" },
        handleScroll: interactive ? {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: false,
        } : false,
        handleScale: interactive ? {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        } : false,
        kineticScroll: { mouse: interactive, touch: interactive },
        crosshair: interactive ? {
          mode: CrosshairMode.Normal,
          vertLine: { visible: false, labelVisible: false },
          horzLine: {
            visible: true,
            labelVisible: true,
            color: "#7f8a99",
            style: LineStyle.Dashed,
          },
        } : {
          vertLine: { visible: false, labelVisible: false },
          horzLine: { visible: false, labelVisible: false },
        },
      });
      charts.push(chart);
      return chart;
    };
    const mainHeight = requestedMainHeight ?? (compact ? 560 : 555);
    const main = make(mainRoot.current, mainHeight);
    const series = main.addCandlestickSeries({
        upColor: "#0ecb81",
        downColor: "#f6465d",
        wickUpColor: "#0ecb81",
        wickDownColor: "#f6465d",
        borderVisible: false,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      });
    if (entryLine) series.createPriceLine({ price: entryLine.price, color: entryLine.side === "short" ? "#f6465d" : "#0ecb81", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: entryLine.title });
    const bollingerSeries = ([
      ["upper", "#c6a548"],
      ["mid", "#8a96a7"],
      ["lower", "#c6a548"],
    ] as const).map(([key, color]) => ({
      key,
      series: main.addLineSeries({
          color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
        }),
    }));
    let updateIndicators: ((nextCandles: Candle[], incremental: boolean) => void) | null = null;
    if (!compact) {
    const m = make(macdRoot.current!, indicatorHeights.current.macd, false);
    indicatorCharts.current.macd = m;
    const histogram = m.addHistogramSeries({ priceLineVisible: false });
    const difSeries = m.addLineSeries({
      color: "#f0b90b",
      lineWidth: 1,
      title: "DIF",
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const deaSeries = m.addLineSeries({
      color: "#a78bfa",
      lineWidth: 1,
      title: "DEA",
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const r = make(rsiRoot.current!, indicatorHeights.current.rsi, false);
    indicatorCharts.current.rsi = r;
    const rs = r.addLineSeries({
      color: "#a78bfa",
      lineWidth: 2,
      title: "RSI(14)",
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });
    [30, 70].forEach((price) =>
      rs.createPriceLine({
        price,
        color: "#637083",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
      }),
    );
    updateIndicators = (nextCandles, incremental) => {
      const close = nextCandles.map((c) => c.close);
      const macd = calcMacd(close);
      const rsi = calcRsi(close);
      const histogramData = lines(nextCandles, macd.hist).map((point) => "value" in point ? ({
          ...point,
          color: point.value >= 0 ? "#0ecb81" : "#f6465d",
        }) : point);
      const difData = lines(nextCandles, macd.dif);
      const deaData = lines(nextCandles, macd.dea);
      const rsiData = lines(nextCandles, rsi);
      if (incremental) {
        histogram.update(histogramData.at(-1)!);
        difSeries.update(difData.at(-1)!);
        deaSeries.update(deaData.at(-1)!);
        rs.update(rsiData.at(-1)!);
      } else {
        histogram.setData(histogramData);
        difSeries.setData(difData);
        deaSeries.setData(deaData);
        rs.setData(rsiData);
      }
    };
    }
    let previousDataScope = "";
    updateChartData.current = (nextCandles, nextMarkers) => {
      if (!nextCandles.length) return;
      const first = nextCandles[0];
      const last = nextCandles.at(-1)!;
      // 同一市场、同一根实时K线只更新末端数据；切换市场/周期或滚入新K线时才全量替换。
      const dataScope = `${nextCandles.length}:${first.time}:${first.open}:${first.high}:${first.low}:${first.close}:${last.time}`;
      const incremental = previousDataScope === dataScope;
      const currentRange = main.timeScale().getVisibleLogicalRange();
      const candleData = nextCandles.map((c) => ({ ...c, time: c.time as Time }));
      if (incremental) series.update(candleData.at(-1)!);
      else series.setData(candleData);
      series.setMarkers(nextMarkers);
      const close = nextCandles.map((c) => c.close);
      const bb = calcBollinger(close);
      bollingerSeries.forEach(({ key, series: lineSeries }) => {
        const data = lines(nextCandles, bb[key]);
        if (incremental) lineSeries.update(data.at(-1)!);
        else lineSeries.setData(data);
      });
      updateIndicators?.(nextCandles, incremental);
      // 行情更新只替换数据，不销毁图表；用户正在拖动或已平移到的位置应保持不变。
      if (!incremental && currentRange) main.timeScale().setVisibleLogicalRange(currentRange);
      previousDataScope = dataScope;
    };
    updateChartData.current(candles, markers);
    const visibleCandleCount = compact ? Math.min(30, candles.length) : candles.length;
    const futureSpace = Math.max(1, visibleCandleCount / 2);
    const initialRange = savedVisibleRange.current ?? {
      from: candles.length - visibleCandleCount - 0.5,
      to: candles.length - 0.5 + futureSpace,
    };
    charts.forEach((chart) => chart.timeScale().setVisibleLogicalRange(initialRange));
    // 只让主图驱动副图时间轴，避免三个图表相互回写，把用户刚拖动的位置推回去。
    main.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      savedVisibleRange.current = range;
      charts
        .filter((chart) => chart !== main)
        .forEach((chart) => chart.timeScale().setVisibleLogicalRange(range));
    });
    const chartRoot = mainRoot.current!;
    chartRoot.style.position = "relative";
    const positionBadge = entryLine ? document.createElement("div") : null;
    if (positionBadge && entryLine) {
      positionBadge.className = `chart-position-badge chart-position-badge--${entryLine.side ?? "long"}`;
      positionBadge.innerHTML = `<strong>${entryLine.title}</strong><span>开仓价 ${entryLine.price.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}</span>`;
      chartRoot.appendChild(positionBadge);
    }
    const tags = actionTags.flatMap(tag => {
      const el = document.createElement("div");
      el.className = `chart-action-tag chart-action-tag--${tag.side}`;
      const title = document.createElement("strong");
      title.textContent = tag.title;
      const price = document.createElement("span");
      price.textContent = `${tag.priceLabel ?? "开仓价"} ${tag.price.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}`;
      el.append(title, price);
      chartRoot.appendChild(el); return [{ el, tag }];
    });
    const notes = agentNotes.map(note => {
      const el = document.createElement("div");
      el.className = "chart-agent-note";
      el.textContent = `私教观察：${note.text}`;
      el.title = "按住并拖动说明";
      const key = `${note.time}:${note.text}`;
      el.addEventListener("pointerdown", event => {
        event.preventDefault(); event.stopPropagation();
        el.setPointerCapture(event.pointerId); el.classList.add("chart-agent-note--dragging");
        const startX = event.clientX, startY = event.clientY, startLeft = el.offsetLeft, startTop = el.offsetTop;
        const move = (next: PointerEvent) => {
          const left = Math.max(8, Math.min(chartRoot.clientWidth - el.offsetWidth - 8, startLeft + next.clientX - startX));
          const top = Math.max(8, Math.min(chartRoot.clientHeight - el.offsetHeight - 8, startTop + next.clientY - startY));
          el.style.left = `${left}px`; el.style.top = `${top}px`; draggedNotes.current.set(key, { left, top });
        };
        const finish = () => { el.classList.remove("chart-agent-note--dragging"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", finish); el.removeEventListener("pointercancel", finish); };
        el.addEventListener("pointermove", move); el.addEventListener("pointerup", finish); el.addEventListener("pointercancel", finish);
      });
      chartRoot.appendChild(el); return { el, note, key };
    });
    const placeTags = () => tags.forEach(({ el, tag }) => {
      const x = main.timeScale().timeToCoordinate(tag.time as Time), y = series.priceToCoordinate(tag.price);
      if (x == null || y == null || x < 0 || x > chartRoot.clientWidth) { el.style.display = "none"; return; }
      el.style.display = "grid"; el.style.left = `${x}px`; el.style.top = `${y}px`;
    });
    const placeNotes = () => {
      const parentRect = chartRoot.getBoundingClientRect();
      const occupied = tags.filter(({ el }) => el.style.display !== "none").map(({ el }) => { const r = el.getBoundingClientRect(); return { left: r.left - parentRect.left, right: r.right - parentRect.left, top: r.top - parentRect.top, bottom: r.bottom - parentRect.top }; });
      const overlaps = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) => a.left < b.right + 10 && a.right + 10 > b.left && a.top < b.bottom + 10 && a.bottom + 10 > b.top;
      notes.forEach(({ el, note, key }) => {
        const dragged = draggedNotes.current.get(key);
        if (dragged) {
          const left = Math.max(8, Math.min(chartRoot.clientWidth - el.offsetWidth - 8, dragged.left));
          const top = Math.max(8, Math.min(chartRoot.clientHeight - el.offsetHeight - 8, dragged.top));
          el.style.display = "block"; el.style.left = `${left}px`; el.style.top = `${top}px`;
          occupied.push({ left, right: left + el.offsetWidth, top, bottom: top + el.offsetHeight });
          return;
        }
        const x = main.timeScale().timeToCoordinate(note.time as Time), y = series.priceToCoordinate(note.price);
        if (x == null || y == null || x < 0 || x > chartRoot.clientWidth) { el.style.display = "none"; return; }
        const width = chartRoot.clientWidth, cardWidth = Math.min(300, Math.max(210, width * .24));
        const left = Math.max(8, Math.min(width - cardWidth - 8, x - cardWidth - 72));
        el.style.display = "block"; el.style.width = `${cardWidth}px`; el.style.left = `${left}px`; el.style.top = "-9999px";
        const height = el.offsetHeight || 64;
        const preferred = y - height - 76 - (note.lane % 2) * (height + 18);
        const candidates = [preferred, preferred - height - 18, preferred + height + 18, preferred - (height + 18) * 2, preferred + (height + 18) * 2];
        let top = Math.max(8, Math.min(mainHeight - height - 8, preferred));
        for (const candidate of candidates) {
          const next = Math.max(8, Math.min(mainHeight - height - 8, candidate));
          const rect = { left, right: left + cardWidth, top: next, bottom: next + height };
          if (!occupied.some(other => overlaps(rect, other))) { top = next; break; }
        }
        el.style.top = `${top}px`; occupied.push({ left, right: left + cardWidth, top, bottom: top + height });
      });
    };
    const placeOverlays = () => { placeTags(); placeNotes(); };
    main.timeScale().subscribeVisibleLogicalRangeChange(placeOverlays); requestAnimationFrame(placeOverlays);
    const resize = new ResizeObserver(() =>
      charts.forEach((c) =>
        c.applyOptions({ width: root.current!.clientWidth }),
      ),
    );
    resize.observe(root.current);
    return () => {
      resize.disconnect();
      positionBadge?.remove();
      tags.forEach(({ el }) => el.remove());
      notes.forEach(({ el }) => el.remove());
      charts.forEach((c) => c.remove());
      indicatorCharts.current = {};
      updateChartData.current = null;
    };
  }, [hasCandles, compact, actionTagsKey, agentNotesKey, entryLineKey, requestedMainHeight]);
  useEffect(() => {
    updateChartData.current?.(candles, markers);
  }, [candles, markers]);
  const startResize = (panel: "macd" | "rsi", event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startHeight = indicatorHeights.current[panel];
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const height = Math.max(70, Math.min(280, startHeight + next.clientY - startY));
      indicatorHeights.current[panel] = height;
      indicatorCharts.current[panel]?.applyOptions({ height });
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  };
  return (
    <div ref={root} className="coach-chart">
      <div className="coach-chart-main">
        <div ref={mainRoot} aria-label="K线与布林带" />
        {overlay}
      </div>
      {!compact && <>
        <div ref={macdRoot} aria-label="MACD 副图" />
        <div className="chart-pane-resizer" role="separator" aria-label="拖动调整 MACD 高度" onPointerDown={(event) => startResize("macd", event)}><span /></div>
        <div ref={rsiRoot} aria-label="RSI 副图" />
        <div className="chart-pane-resizer" role="separator" aria-label="拖动调整 RSI 高度" onPointerDown={(event) => startResize("rsi", event)}><span /></div>
      </>}
    </div>
  );
}
