export type ReturnTradeImport = ReturnType<typeof parseTradeCsv>;
/** CSV-only import. Unknown columns (including account identifiers) are discarded. */
export function parseTradeCsv(text: string) {
  if (Buffer.byteLength(text, "utf8") > 2_000_000) throw new Error("文件超过 2 MB，请缩小导出时间范围。");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n")) {
      row.push(field.replace(/\r$/, "")); field = "";
      if (c === "\n") { rows.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw new Error("CSV 引号未闭合，请重新导出。");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift()?.map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase()) ?? [];
  const aliases = [
    ["时间", "成交时间", "date(utc)", "date", "time", "timestamp"],
    ["交易对", "币对", "symbol", "pair", "market"],
    ["方向", "买卖方向", "side", "type"],
    ["成交价", "价格", "price"],
    ["成交数量", "数量", "quantity", "amount", "executed"],
  ];
  const cols = aliases.map(names => header.findIndex(h => names.includes(h)));
  if (cols.some(c => c < 0)) throw new Error("未识别必要列：时间、交易对、方向、成交价、成交数量。请按模板整理为 CSV 后上传。");
  const trades: Array<{ time: string; symbol: string; side: string; price: number; quantity: number }> = [];
  const rejected: number[] = [];
  let duplicates = 0;
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    if (r.every(c => !c.trim())) return;
    const [date, symbol, side, price, quantity] = cols.map(c => (r[c] ?? "").trim());
    const direction = /^(buy|买入|买)$/i.test(side) ? "买入" : /^(sell|卖出|卖)$/i.test(side) ? "卖出" : "";
    // Only explicit calendar dates; timezone-free exports are interpreted as UTC.
    const rawTime = date.replace(" ", "T");
    const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(rawTime)
      ? Date.parse(rawTime + (/(Z|[+-]\d{2}:?\d{2})$/i.test(rawTime) ? "" : "Z")) : NaN;
    const p = Number(price), q = Number(quantity);
    if (!Number.isFinite(time) || !/^[A-Za-z0-9/_-]{2,30}$/.test(symbol) || !direction || !Number.isFinite(p) || p <= 0 || !Number.isFinite(q) || q <= 0) { rejected.push(i + 2); return; }
    const trade = { time: new Date(time).toISOString(), symbol: symbol.toUpperCase(), side: direction, price: p, quantity: q };
    const key = JSON.stringify(trade);
    // Identical executions may be legitimate split fills: report, do not delete.
    if (seen.has(key)) duplicates++;
    seen.add(key); trades.push(trade);
  });
  if (!trades.length) throw new Error("没有识别到有效成交，请检查时间格式、方向和数值。");
  if (trades.length > 5000) throw new Error("最多支持 5000 笔成交，请缩小导出范围。");
  trades.sort((a, b) => a.time.localeCompare(b.time));
  return { count: trades.length, rejected: rejected.length, rejectedRows: rejected.slice(0, 20), duplicates,
    start: trades[0].time, end: trades.at(-1)!.time,
    symbols: [...new Set(trades.map(t => t.symbol))],
    buys: trades.filter(t => t.side === "买入").length, sells: trades.filter(t => t.side === "卖出").length,
    activeDays: new Set(trades.map(t => t.time.slice(0, 10))).size,
    recentTrades: trades.slice(-100),
    note: "用户上传的成交证据，未通过交易所验证。无时区时间按 UTC 解析；相同行保留。不含完整持仓、止损计划和开平仓关系，不能据此计算收益或断言止损纪律。仅最近100笔明细进入分析，其余计入汇总。" };
}
