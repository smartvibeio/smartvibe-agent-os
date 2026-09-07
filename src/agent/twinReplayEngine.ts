import { z } from "zod";
import type { Candle } from "./indicators.js";

export const REPLAY_FEE = 0.0005;
export const replayDecisionSchema = z.object({
  动作: z.enum(["观望", "开多", "开空", "平仓"]),
  仓位百分比: z.number().min(0).max(100),
  止损百分比: z.number().min(0.1).max(50).nullable(),
  止盈百分比: z.number().min(0.1).max(100).nullable(),
  理由: z.string().min(1).max(400),
  习惯依据: z.string().min(1).max(300),
});
export type ReplayDecision = z.infer<typeof replayDecisionSchema>;
export type ReplayPosition = { side: "多" | "空"; entry: number; quantity: number; capital: number; stop: number | null; target: number | null };
export type ReplayFill = { time: number; price: number; quantity: number; action: string; fee: number; pnl: number; reason: string };
export type ReplayLedger = { cash: number; position: ReplayPosition | null; fees: number; realized: number; fills: ReplayFill[] };

export type ScenarioPolicy = {
  direction: "做多" | "做空";
  entryAfter: number;
  initialMarginPct: number;
  addAtLossPct: number | null;
  addMarginPct: number;
  maxAdds: number;
  stopLossPct: number | null;
  takeProfitPct: number | null;
  rationale: string;
  habitBasis: string;
  entryPrice?: number | null;
  addPrice?: number | null;
  entryQuantity?: number | null;
  addQuantity?: number | null;
};
export type ScenarioPosition = { side: "多" | "空"; entry: number; quantity: number; margin: number; leverage: number; liquidation: number; adds: number };
export type ScenarioLedger = { initial: number; cash: number; position: ScenarioPosition | null; fees: number; realized: number; fills: ReplayFill[]; liquidated: boolean };
export type ScenarioFrame = { index: number; action: string; explanation: string; ledger: ScenarioLedger; equity: number };
export type MarginMode = "全仓" | "逐仓";

const futuresFee = 0.0005;
const maintenanceRate = 0.005;
const showPrice = (price: number) => price.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
function scenarioEquity(l: ScenarioLedger, price: number) {
  const p = l.position;
  const pnl = p ? (price - p.entry) * p.quantity * (p.side === "多" ? 1 : -1) : 0;
  return l.cash + (p?.margin ?? 0) + pnl;
}
function crossLiquidationPrice(ledger: ScenarioLedger) {
  const p = ledger.position;
  if (!p || p.quantity <= 0) return 0;
  // Cross margin: every unused USDT in the virtual futures wallet supports the
  // position. Liquidation starts when wallet equity reaches maintenance margin.
  const walletBeforePnl = ledger.cash + p.margin;
  if (p.side === "空") return (walletBeforePnl + p.quantity * p.entry) / (p.quantity * (1 + maintenanceRate));
  return Math.max(0, (p.quantity * p.entry - walletBeforePnl) / (p.quantity * (1 - maintenanceRate)));
}
function isolatedLiquidationPrice(side: "多" | "空", entry: number, leverage: number) {
  return side === "多" ? entry * (1 - 1 / leverage + maintenanceRate) : entry * (1 + 1 / leverage - maintenanceRate);
}
export function runScenarioPolicy(candles: Candle[], capital: number, leverage: number, policy: ScenarioPolicy, marginMode: MarginMode = "全仓"): ScenarioFrame[] {
  const ledger: ScenarioLedger = { initial: capital, cash: capital, position: null, fees: 0, realized: 0, fills: [], liquidated: false };
  const frames: ScenarioFrame[] = [];
  const side = policy.direction === "做多" ? "多" : "空";
  const adverse = (price: number, entry: number) => (side === "多" ? (entry - price) / entry : (price - entry) / entry) * 100;
  const favorable = (price: number, entry: number) => (side === "多" ? (price - entry) / entry : (entry - price) / entry) * 100;
  const open = (c: Candle, price: number, marginPct: number, action: string, requestedQuantity?: number | null) => {
    const requestedMargin = requestedQuantity ? requestedQuantity * price / leverage : ledger.initial * marginPct / 100;
    const requestedFee = requestedMargin * leverage * futuresFee;
    if (requestedMargin + requestedFee > ledger.cash) throw new Error(`${action}需要约${(requestedMargin + requestedFee).toFixed(2)} USDT保证金和手续费，超过当时可用资金${ledger.cash.toFixed(2)} USDT。`);
    const margin = requestedMargin;
    if (margin <= 0) return;
    const notional = margin * leverage, qty = requestedQuantity ?? notional / price, fee = notional * futuresFee;
    ledger.cash -= margin + fee; ledger.fees += fee;
    if (!ledger.position) {
      ledger.position = { side, entry: price, quantity: qty, margin, leverage, liquidation: 0, adds: 0 };
      ledger.position.liquidation = marginMode === "全仓" ? crossLiquidationPrice(ledger) : isolatedLiquidationPrice(side, price, leverage);
    }
    else {
      const p = ledger.position, total = p.quantity + qty;
      p.entry = (p.entry * p.quantity + price * qty) / total; p.quantity = total; p.margin += margin; p.adds += 1;
      p.liquidation = marginMode === "全仓" ? crossLiquidationPrice(ledger) : isolatedLiquidationPrice(side, p.entry, leverage);
    }
    ledger.fills.push({ time: c.time, price, quantity: qty, action, fee, pnl: 0, reason: action === "加多" || action === "加空" ? "分身逆势增加仓位" : "分身模拟开仓" });
  };
  const closePosition = (c: Candle, price: number, reason: string, action: string) => {
    const p = ledger.position!; const pnl = (price - p.entry) * p.quantity * (p.side === "多" ? 1 : -1);
    const fee = p.quantity * price * futuresFee; ledger.cash += p.margin + pnl - fee; ledger.realized += pnl; ledger.fees += fee;
    if (action === "强平") ledger.cash = Math.max(0, ledger.cash);
    ledger.fills.push({ time: c.time, price, quantity: p.quantity, action, fee, pnl, reason }); ledger.position = null;
  };
  candles.forEach((c, i) => {
    let action = "观察", explanation = "分身继续观察价格变化，等待设定的入场时机。";
    const entryReady = policy.entryPrice ? c.low <= policy.entryPrice && c.high >= policy.entryPrice : i === Math.min(policy.entryAfter, candles.length - 1);
    if (!ledger.position && !ledger.liquidated && entryReady) {
      const price = policy.entryPrice ?? c.open;
      open(c, price, policy.initialMarginPct, policy.direction, policy.entryQuantity); action = policy.direction;
      explanation = `价格来到 ${showPrice(price)}，你的分身选择以${leverage}倍杠杆${side === "空" ? "开空" : "开多"}，开始执行这段交易。`;
    } else if (ledger.position) {
      const p = ledger.position;
      const liqHit = p.liquidation > 0 && (p.side === "多" ? c.low <= p.liquidation : c.high >= p.liquidation);
      if (liqHit) { const price = p.liquidation; closePosition(c, price, "触及教学模拟强平线", "强平"); ledger.liquidated = true; action = "强平"; explanation = `价格触及强平线 ${showPrice(price)}，你的账户保证金已经无法维持这笔仓位，仓位被强平。`; }
      else if (policy.stopLossPct !== null && adverse(c.close, p.entry) >= policy.stopLossPct) { closePosition(c, c.close, "分身按策略止损", p.side === "多" ? "平多" : "平空"); action = "止损"; explanation = "亏损达到分身预先设定的退出条件。"; }
      else if (policy.takeProfitPct !== null && favorable(c.close, p.entry) >= policy.takeProfitPct) { closePosition(c, c.close, "分身按策略止盈", p.side === "多" ? "平多" : "平空"); action = "止盈"; explanation = "盈利达到分身预先设定的退出条件。"; }
      else if (p.adds < policy.maxAdds && (policy.addPrice ? c.low <= policy.addPrice && c.high >= policy.addPrice : policy.addAtLossPct !== null && adverse(c.close, p.entry) >= policy.addAtLossPct * (p.adds + 1))) { const price = policy.addPrice ?? c.open; open(c, price, policy.addMarginPct, side === "多" ? "加多" : "加空", policy.addQuantity); action = side === "多" ? "加多" : "加空"; explanation = `价格持续反向运行，你的分身按照交易习惯继续增加${side === "空" ? "空单" : "多单"}，试图降低持仓成本。`; }
      else { action = "继续持有"; explanation = adverse(c.close, p.entry) > 0 ? "价格正在逆向运行，分身仍选择持有当前仓位。" : "仓位仍在计划内，分身继续持有。"; }
    }
    frames.push({ index: i + 1, action, explanation, ledger: structuredClone(ledger), equity: scenarioEquity(ledger, c.close) });
  });
  if (ledger.position && candles.length) {
    const c = candles.at(-1)!; closePosition(c, c.close, "演示区间结束，按收盘价结算", ledger.position.side === "多" ? "平多" : "平空");
    const last = frames.at(-1)!; last.action = "区间结算"; last.explanation = "演示区间结束，剩余仓位按最后收盘价结算。"; last.ledger = structuredClone(ledger); last.equity = scenarioEquity(ledger, c.close);
  }
  return frames;
}
export function emptyReplayLedger(capital: number): ReplayLedger { return { cash: capital, position: null, fees: 0, realized: 0, fills: [] }; }
export function replayEquity(ledger: ReplayLedger, price: number) {
  const p = ledger.position;
  const floating = p ? (price - p.entry) * p.quantity * (p.side === "多" ? 1 : -1) : 0;
  return { cash: ledger.cash, occupied: p?.capital ?? 0, floating, equity: ledger.cash + (p?.capital ?? 0) + floating, realized: ledger.realized, fees: ledger.fees };
}
function close(ledger: ReplayLedger, price: number, time: number, reason: string) {
  const p = ledger.position!;
  const pnl = (price - p.entry) * p.quantity * (p.side === "多" ? 1 : -1);
  const fee = p.quantity * price * REPLAY_FEE;
  ledger.cash += p.capital + pnl - fee;
  ledger.realized += pnl; ledger.fees += fee;
  ledger.fills.push({ time, price, quantity: p.quantity, action: p.side === "多" ? "平多" : "平空", fee, pnl, reason });
  ledger.position = null;
}
/** Decision was made on the previous closed candle. Execute at next open;
 * then apply protective orders. Same-bar ambiguity uses stop-first, not hindsight.
 */
export function executeReplayDecision(previous: ReplayLedger, input: ReplayDecision, candle: Candle, last: boolean): ReplayLedger {
  const d = replayDecisionSchema.parse(input);
  const ledger = structuredClone(previous);
  if ((d.动作 === "开多" || d.动作 === "开空") && ledger.position) throw new Error("分身已有持仓，本步只能持有或平仓。");
  if (d.动作 === "平仓" && !ledger.position) throw new Error("分身当前空仓，不能平仓。");
  if ((d.动作 === "开多" || d.动作 === "开空") && (d.仓位百分比 < 1 || ledger.cash <= 0)) throw new Error("开仓金额无效，请重试本步。");
  if (d.动作 === "平仓") close(ledger, candle.open, candle.time, "分身主动平仓");
  else if (d.动作 === "开多" || d.动作 === "开空") {
    const sign = d.动作 === "开多" ? 1 : -1;
    const capital = ledger.cash * d.仓位百分比 / 100 / (1 + REPLAY_FEE);
    const fee = capital * REPLAY_FEE;
    ledger.cash -= capital + fee; ledger.fees += fee;
    ledger.position = { side: sign === 1 ? "多" : "空", entry: candle.open, quantity: capital / candle.open, capital,
      stop: d.止损百分比 === null ? null : candle.open * (1 - sign * d.止损百分比 / 100),
      target: d.止盈百分比 === null ? null : candle.open * (1 + sign * d.止盈百分比 / 100) };
    ledger.fills.push({ time: candle.time, price: candle.open, quantity: ledger.position.quantity, action: d.动作, fee, pnl: 0, reason: "分身模拟开仓" });
  }
  const p = ledger.position;
  if (p) {
    const long = p.side === "多";
    // Gaps are resolved before intrabar range checks.
    const stopGap = p.stop !== null && (long ? candle.open <= p.stop : candle.open >= p.stop);
    const targetGap = p.target !== null && (long ? candle.open >= p.target : candle.open <= p.target);
    const stopHit = p.stop !== null && (long ? candle.low <= p.stop : candle.high >= p.stop);
    const targetHit = p.target !== null && (long ? candle.high >= p.target : candle.low <= p.target);
    if (stopGap || targetGap) close(ledger, candle.open, candle.time, stopGap ? "跳空触发止损" : "跳空触发止盈");
    else if (stopHit) close(ledger, p.stop!, candle.time, targetHit ? "同根触及止损止盈，按止损先成交" : "触发止损");
    else if (targetHit) close(ledger, p.target!, candle.time, "触发止盈");
  }
  if (last && ledger.position) close(ledger, candle.close, candle.time, "区间结束，按收盘价结算（非分身主动决定）");
  return ledger;
}
