/** 单机模拟练盘：只读行情 + 本地账本，不调用任何真实交易接口。 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { 获取实盘图表包, 记录决策记忆 } from "./coreTools.js";
import { getTwin, runtimeDataDir, upsertTwin, listMemories } from "./store.js";
import { modelTwinResponse } from "../domain/modelResponse.js";
import { 决策动作中文 } from "./zh.js";
import type { MarketContext, DecisionPattern } from "../domain/types.js";
import type { MarketPack } from "./binancePublic.js";
import { 拉取币安最新价 } from "./binancePublic.js";
import { 尝试调用币安Mcp工具 } from "./binanceMcp.js";
import { normalizeTradingSymbol, tradingSymbolCandidates } from "./symbol.js";

const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,20}$/, "请输入交易标的，例如 AKE 或 AKEUSDT")
  .transform(normalizeTradingSymbol);
export const marketSchema = z.object({
  交易对: symbolSchema.default("BTCUSDT"),
  市场: z.enum(["现货", "U本位合约"]).default("现货"),
  周期: z.enum(["5m", "15m", "1h", "4h", "1d"]).default("1h"),
  根数: z.number().int().min(50).max(500).default(120),
});
const orderSchema = z.object({
  分身编号: z.string(),
  请求编号: z.string().uuid(),
  行情编号: z.string().uuid(),
  方向: z.enum(["做多", "做空", "观望"]),
  订单类型: z.enum(["市价", "限价"]),
  杠杆倍数: z.number().int().min(1).max(125).default(1),
  仓位比例: z.number().finite().min(1).max(100),
  开仓数量: z.number().finite().positive().optional(),
  限价: z.number().positive().optional(),
  止损: z.number().positive().optional(),
  止盈: z.number().positive().optional(),
  风险预算: z.number().finite().positive().optional(),
  理由: z.string().max(500).default(""),
});
type Input = z.infer<typeof orderSchema>;
export type PracticeOrder = Input & {
  编号: string;
  创建时间: string;
  行情: MarketPack;
  状态: "待成交" | "持仓中" | "已平仓" | "已撤单" | "观望";
  本金: number;
  数量: number;
  成交价: number | null;
  成交时间?: string;
  当前价: number;
  盈亏: number;
  手续费: number;
  平仓价?: number;
  结束时间?: string;
  结束原因?: string;
  已记忆?: boolean;
  点评?: ReturnType<typeof reviewOrder>;
};
type Book = {
  orders: PracticeOrder[];
  markets: Record<string, MarketPack>;
  accounts?: Record<string, AccountEvidence>;
};
export type AccountEvidence = {
  状态: string;
  账户尾号: string;
  范围: string;
  成交笔数: number;
  订单数: number;
  说明: string;
  观察: string[];
  更新时间: string;
};
export function accountEvidence(twinId: string) {
  requireTwin(twinId);
  return readBook().accounts?.[twinId] ?? null;
}
export function practiceMarket(id: string) {
  const pack = readBook().markets[id];
  if (!pack) throw new Error("行情快照已过期，请刷新行情后重试");
  return pack;
}
function readBook(): Book {
  const file = path.join(runtimeDataDir(), "practice-book.json");
  if (!fs.existsSync(file)) return { orders: [], markets: {} };
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeBook(book: Book) {
  fs.mkdirSync(runtimeDataDir(), { recursive: true });
  const file = path.join(runtimeDataDir(), "practice-book.json");
  fs.writeFileSync(file + ".tmp", JSON.stringify(book), "utf8");
  fs.renameSync(file + ".tmp", file);
}
function requireTwin(id: string) {
  const twin = getTwin(id);
  if (!twin) throw new Error("请先建立交易分身");
  return twin;
}
function context(pack: MarketPack): MarketContext {
  return {
    symbol: pack.交易对,
    summary: `${pack.周期} · ${pack.根数} 根 · ${pack.涨跌百分比}% · ${pack.更新时间}`,
    source: pack.来源.includes("MCP") ? "binance_mcp" : "binance_public",
    metrics: {
      price_change_pct: pack.涨跌百分比,
      volatility_regime:
        pack.波动百分比 >= 2.5
          ? "extreme"
          : pack.波动百分比 >= 1.2
            ? "high"
            : "medium",
      volume_change_pct: pack.成交量变化约百分比,
      open_interest_change_pct: null,
      funding_rate: null,
      funding_elevated: null,
    },
  };
}
function balance(orders: PracticeOrder[]) {
  const 已实现 = orders
    .filter((o) => o.状态 === "已平仓")
    .reduce((sum, o) => sum + o.盈亏, 0);
  const 费用 = orders.reduce((sum, o) => sum + o.手续费, 0);
  const 占用 = orders
    .filter((o) => o.状态 === "持仓中" || o.状态 === "待成交")
    .reduce((sum, o) => sum + o.本金, 0);
  const 浮盈亏 = orders
    .filter((o) => o.状态 === "持仓中")
    .reduce((sum, o) => sum + o.盈亏, 0);
  return {
    可用: 100000 + 已实现 - 费用 - 占用,
    权益: 100000 + 已实现 - 费用 + 浮盈亏,
    占用,
    已实现,
    浮盈亏,
    费用,
  };
}
export function practiceState(id: string) {
  const twin = requireTwin(id);
  const orders = readBook().orders.filter((o) => o.分身编号 === id);
  const counts: Record<string, number> = {};
  const reviewed = orders.filter(
    (o) => o.已记忆 && o.方向 !== "观望" && o.状态 !== "已撤单",
  );
  const previous = reviewed.at(-2)?.点评?.发现的问题 ?? [];
  const latest = reviewed.at(-1)?.点评?.发现的问题 ?? [];
  orders
    .filter((o) => o.已记忆)
    .forEach((o) =>
      o.点评?.发现的问题.forEach((p) => {
        counts[p] = (counts[p] ?? 0) + 1;
      }),
    );
  return {
    分身: { 分身编号: twin.id, 名称: twin.display_name, 版本: twin.version },
    资金: balance(orders),
    订单: orders.slice().reverse(),
    重复问题: Object.entries(counts)
      .filter(([, n]) => n > 1)
      .map(([问题, 次数]) => ({ 问题, 次数 })),
    已复盘: orders.filter((o) => o.已记忆).length,
    改善观察: previous.filter((issue) => !latest.includes(issue)),
  };
}
function pnl(o: PracticeOrder, price: number) {
  return (price - o.成交价!) * o.数量 * (o.方向 === "做空" ? -1 : 1);
}
function close(o: PracticeOrder, price: number, reason: string) {
  o.盈亏 = pnl(o, price);
  o.当前价 = price;
  o.平仓价 = price;
  o.结束时间 = new Date().toISOString();
  o.状态 = "已平仓";
  o.结束原因 = reason;
  o.手续费 += price * o.数量 * 0.0005;
}
export function applyQuote(o: PracticeOrder, price: number) {
  o.当前价 = price;
  if (
    o.状态 === "待成交" &&
    (o.方向 === "做多" ? price <= o.限价! : price >= o.限价!)
  ) {
    o.成交价 = price;
    o.成交时间 = new Date().toISOString();
    const leverage = o.行情.市场 === "U本位合约" ? (o.杠杆倍数 ?? 1) : 1;
    o.数量 = o.开仓数量 ?? (o.本金 * leverage) / price;
    o.本金 = (o.数量 * price) / leverage;
    o.状态 = "持仓中";
    o.手续费 = o.数量 * price * 0.0005;
  }
  if (o.状态 !== "持仓中") return;
  o.盈亏 = pnl(o, price);
  if (o.止损 && (o.方向 === "做多" ? price <= o.止损 : price >= o.止损))
    close(o, price, "模拟止损触发");
  else if (o.止盈 && (o.方向 === "做多" ? price >= o.止盈 : price <= o.止盈))
    close(o, price, "模拟止盈触发");
}
export async function loadPracticeMarket(args: unknown, twinId?: string) {
  const rawSymbol = z.object({ 交易对: z.string().optional() }).passthrough().parse(args ?? {}).交易对 ?? "BTCUSDT";
  const parsed = marketSchema.parse(args);
  const candidates = tradingSymbolCandidates(rawSymbol);
  let pack: MarketPack | undefined;
  let lastError: unknown;
  for (const 交易对 of candidates) {
    try {
      pack = await 获取实盘图表包({ ...parsed, 交易对 });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!pack) throw lastError instanceof Error ? lastError : new Error("未找到这个币安交易标的");
  const book = readBook();
  const id = randomUUID();
  book.markets[id] = pack;
  for (const [key, value] of Object.entries(book.markets))
    if (Date.now() - Date.parse(value.更新时间) > 3600000)
      delete book.markets[key];
  if (twinId)
    book.orders
      .filter(
        (o) =>
          o.分身编号 === twinId &&
          o.行情.交易对 === pack.交易对 &&
          (o.行情.市场 ?? "现货") === (pack.市场 ?? "现货") &&
          ["持仓中", "待成交"].includes(o.状态),
      )
      .forEach((o) => applyQuote(o, pack.最新价));
  writeBook(book);
  return { ...pack, 行情编号: id };
}
export async function syncPracticeQuote(twinId: string, marketId: string) {
  requireTwin(twinId);
  const before = practiceMarket(marketId);
  const price = await 拉取币安最新价(before.交易对, before.市场 ?? "现货");
  const book = readBook();
  const source = book.markets[marketId];
  if (!source) throw new Error("行情快照已过期，请刷新行情后重试");
  const latestCandle = source.K线.at(-1);
  const pack: MarketPack = {
    ...source,
    更新时间: new Date().toISOString(),
    最新价: price,
    K线: latestCandle
      ? [
          ...source.K线.slice(0, -1),
          {
            ...latestCandle,
            close: price,
            high: Math.max(latestCandle.high, price),
            low: Math.min(latestCandle.low, price),
          },
        ]
      : source.K线,
  };
  const nextId = randomUUID();
  book.markets[nextId] = pack;
  book.orders
    .filter(
      (order) =>
        order.分身编号 === twinId &&
        order.行情.交易对 === pack.交易对 &&
        (order.行情.市场 ?? "现货") === (pack.市场 ?? "现货") &&
        ["持仓中", "待成交"].includes(order.状态),
    )
    .forEach((order) => applyQuote(order, price));
  writeBook(book);
  return { ...pack, 行情编号: nextId };
}
export function submitPracticeOrder(args: unknown) {
  const input = orderSchema.parse(args);
  requireTwin(input.分身编号);
  const book = readBook();
  const duplicate = book.orders.find(
    (o) => o.请求编号 === input.请求编号 && o.分身编号 === input.分身编号,
  );
  if (duplicate) return duplicate;
  const pack = book.markets[input.行情编号];
  if (!pack || Date.now() - Date.parse(pack.更新时间) > 120000)
    throw new Error("行情已过期，请刷新行情后重新提交");
  const active = book.orders.some(
    (o) =>
      o.分身编号 === input.分身编号 && ["持仓中", "待成交"].includes(o.状态),
  );
  if (active) throw new Error("请先平仓或撤销当前模拟单，再开始下一单");
  if ((pack.市场 ?? "现货") === "现货" && input.方向 === "做空")
    throw new Error("现货练习不支持直接做空，请选择合约或改为观望");
  const leverage = (pack.市场 ?? "现货") === "U本位合约" ? input.杠杆倍数 : 1;
  const price = input.订单类型 === "限价" ? input.限价 : pack.最新价;
  if (input.方向 !== "观望") {
    if (!price) throw new Error("请输入有效限价");
    if (
      input.止损 &&
      (input.方向 === "做多" ? input.止损 >= price : input.止损 <= price)
    )
      throw new Error("止损应位于入场价的亏损方向");
    if (
      input.止盈 &&
      (input.方向 === "做多" ? input.止盈 <= price : input.止盈 >= price)
    )
      throw new Error("止盈应位于入场价的盈利方向");
  }
  const funds = balance(
    book.orders.filter((o) => o.分身编号 === input.分身编号),
  );
  const allocated = (Math.max(0, funds.可用) * input.仓位比例) / 100;
  const notional =
    input.方向 === "观望"
      ? 0
      : input.开仓数量
        ? input.开仓数量 * price!
        : allocated / (1 / leverage + 0.0005);
  const principal = notional / leverage;
  const entryFee = notional * 0.0005;
  if (input.方向 !== "观望" && principal <= 0) throw new Error("模拟资金不足");
  if (input.方向 !== "观望" && principal + entryFee > funds.可用)
    throw new Error("开仓量超过当前可用资金");
  const order: PracticeOrder = {
    ...input,
    杠杆倍数: leverage,
    仓位比例:
      input.方向 === "观望" || funds.可用 <= 0
        ? input.仓位比例
        : (principal / funds.可用) * 100,
    编号: randomUUID(),
    创建时间: new Date().toISOString(),
    行情: pack,
    状态: input.方向 === "观望" ? "观望" : "待成交",
    本金: principal,
    数量: 0,
    成交价: null,
    当前价: pack.最新价,
    盈亏: 0,
    手续费: 0,
  };
  if (input.方向 !== "观望") {
    if (input.订单类型 === "市价") {
      order.状态 = "持仓中";
      order.成交价 = pack.最新价;
      order.成交时间 = new Date().toISOString();
      order.数量 = input.开仓数量 ?? notional / pack.最新价;
      order.手续费 = order.数量 * pack.最新价 * 0.0005;
    } else applyQuote(order, pack.最新价);
  }
  book.orders.push(order);
  writeBook(book);
  return order;
}
function findOrder(book: Book, twinId: string, id: string) {
  requireTwin(twinId);
  const order = book.orders.find((o) => o.编号 === id && o.分身编号 === twinId);
  if (!order) throw new Error("未找到本分身的模拟单");
  return order;
}
export async function finishPracticeOrder(twinId: string, id: string) {
  let book = readBook();
  let order = findOrder(book, twinId, id);
  if (order.状态 === "待成交") {
    order.状态 = "已撤单";
    writeBook(book);
    return order;
  }
  if (order.状态 !== "持仓中") return order;
  const pack = await 获取实盘图表包({
    交易对: order.行情.交易对,
    周期: order.行情.周期,
    根数: 50,
    市场: order.行情.市场 ?? "现货",
  });
  book = readBook();
  order = findOrder(book, twinId, id);
  if (order.状态 === "持仓中") {
    applyQuote(order, pack.最新价);
    if (order.状态 === "持仓中") close(order, pack.最新价, "手动模拟平仓");
    writeBook(book);
  }
  return order;
}
function reviewOrder(order: PracticeOrder) {
  const twin = requireTwin(order.分身编号);
  const response = modelTwinResponse(twin, context(order.行情));
  const 问题: string[] = [],
    建议: string[] = [];
  if (!order.理由.trim()) {
    问题.push("尚未写清本次交易依据");
    建议.push("记录触发条件与失效条件，下次检查是否按计划执行。");
  }
  if (order.方向 !== "观望" && !order.止损) {
    问题.push("未设置可检验的止损条件");
    建议.push("在模拟单中明确愿意承担的最大亏损，再检验仓位是否匹配。");
  }
  const risk = order.止损
    ? (Math.abs(
        (order.成交价 ?? order.限价 ?? order.行情.最新价) - order.止损,
      ) /
        (order.成交价 ?? order.限价 ?? order.行情.最新价)) *
      order.本金 * (order.杠杆倍数 ?? 1)
    : null;
  if (order.仓位比例 >= 30 && order.方向 !== "观望") {
    问题.push("单次资金占用较高");
    建议.push("比较相同止损下不同仓位的亏损金额，检查是否超出自己的风险预算。");
  }
  if (risk != null && order.风险预算 != null && risk > order.风险预算) {
    问题.push("计划止损金额超过自己填写的风险预算");
    建议.push("核对止损距离、资金占比与预算，说明下次如何让它们一致。");
  }
  if (
    order.方向 !== "观望" &&
    Math.abs(order.行情.涨跌百分比) >= 8 &&
    !order.理由.trim()
  ) {
    问题.push("大幅波动时入场但未记录确认依据");
    建议.push(
      "复盘这次入场来自预设条件还是担心错过；区间涨跌不代表下一步方向。",
    );
  }
  return {
    发现的问题: 问题,
    改进建议: 建议.length
      ? 建议
      : ["本次已记录理由与风险条件，继续观察执行结果是否符合计划。"],
    计划止损金额: risk,
    超出预算金额:
      risk != null && order.风险预算 != null
        ? Math.max(0, risk - order.风险预算)
        : null,
    分身反应: {
      决策倾向: 决策动作中文(response.decision_pattern),
      倾向代码: response.decision_pattern,
      理由: "根据建档习惯与这笔单提交时的真实行情计算；仅供行为对照，不代表建议方向。",
    },
    行情时间: order.行情.更新时间,
    说明: "规则私教点评：不以盈亏判定决策好坏，不提供买卖信号。",
  };
}
export function reviewPracticeOrder(twinId: string, id: string) {
  const book = readBook();
  const order = findOrder(book, twinId, id);
  order.点评 ??= reviewOrder(order);
  writeBook(book);
  return order;
}
export function rememberPracticeOrder(twinId: string, id: string) {
  const book = readBook();
  const order = findOrder(book, twinId, id);
  if (!order.点评) throw new Error("请先查看私教点评");
  if (order.已记忆) return practiceState(twinId);
  if (listMemories(twinId).some((m) => m.scenario_id === `practice_${id}`)) {
    order.已记忆 = true;
    writeBook(book);
    return practiceState(twinId);
  }
  // 做空不是离场、做多不自动等于追涨；记录进场规模，不推断方向性人格。
  const choice: DecisionPattern =
    order.方向 === "观望" ? "observe_wait" : "open_position";
  记录决策记忆({
    分身编号: twinId,
    样本编号: `practice_${id}`,
    行情快照: context(order.行情),
    分身倾向代码: order.点评.分身反应.倾向代码,
    用户真实选择代码: choice,
    暴露的弱点: order.点评.发现的问题.join("；"),
    盈亏原因备注: `${order.方向} · ${order.订单类型} · ${order.理由}`,
  });
  order.已记忆 = true;
  writeBook(book);
  return practiceState(twinId);
}

export async function importAccountHistory(twinId: string, symbol: string) {
  const twin = requireTwin(twinId);
  symbolSchema.parse(symbol);
  const account = (await 尝试调用币安Mcp工具("spot.getAccount", {
    omitZeroBalances: true,
  })) as { uid?: number; balances?: unknown[] } | null;
  if (!account || !Array.isArray(account.balances))
    throw new Error("账户只读连接不可用，请在 Codex 检查授权");
  const trades = (await 尝试调用币安Mcp工具("spot.myTrades", {
    symbol,
    limit: 500,
  })) as Array<{
    id: number;
    orderId?: number;
    time: number;
    isBuyer: boolean;
    quoteQty: string;
    qty: string;
  }> | null;
  if (!Array.isArray(trades)) throw new Error("账户已连接，但成交历史无法读取");
  const grouped = new Map<string, (typeof trades)[number]>();
  for (const trade of trades) {
    const key =
      trade.orderId != null ? `order_${trade.orderId}` : `fill_${trade.id}`;
    if (!grouped.has(key) || grouped.get(key)!.time > trade.time)
      grouped.set(key, trade);
  }
  const sorted = [...grouped.values()].sort((a, b) => a.time - b.time);
  const intervals = sorted.slice(1).map((t, i) => t.time - sorted[i]!.time);
  const rapid = intervals.filter((ms) => ms <= 300000).length;
  const summary = {
    状态: "账户只读已连接",
    账户尾号: String(account.uid ?? "").slice(-4),
    范围: `Agentic 子账户 · 现货 ${symbol} · 最近最多 500 笔成交`,
    成交笔数: trades.length,
    订单数: sorted.length,
    说明: trades.length
      ? "成交次数包含分批撮合；仅作为行为核对证据，不能据此认定追涨、扛单或盈利能力。"
      : "此范围暂无成交记录，继续模拟练盘即可；不代表主账户没有成交。",
    观察: trades.length
      ? [
          `按订单编号合并后 ${sorted.length} 组；5 分钟内相邻订单 ${rapid} 次。缺少订单编号的成交单独计组，仍需核对动机。`,
        ]
      : [],
    更新时间: new Date().toISOString(),
  };
  const book = readBook();
  book.accounts ??= {};
  book.accounts[twinId] = summary;
  writeBook(book);
  if (trades.length) {
    twin.account_context_latest = {
      ...twin.account_context_latest,
      exposure: twin.account_context_latest?.exposure ?? null,
      concentration: twin.account_context_latest?.concentration ?? null,
      btc_allocation_pct: null,
      horizon_hint: null,
      position_summary: `${symbol} 读取 ${trades.length} 笔现货成交，待用户核对；不推断交易习惯`,
      captured_at: summary.更新时间,
    };
    upsertTwin(twin);
  }
  return summary;
}
