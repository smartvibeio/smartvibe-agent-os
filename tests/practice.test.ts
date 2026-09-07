import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { calcMacd, calcRsi } from "../src/agent/indicators.js";
import { 创建交易分身, 列出冷启动情景 } from "../src/agent/coreTools.js";
import { tradingSymbolCandidates } from "../src/agent/symbol.js";
import {
  applyQuote,
  loadPracticeMarket,
  submitPracticeOrder,
  reviewPracticeOrder,
  rememberPracticeOrder,
  practiceState,
  marketSchema,
  syncPracticeQuote,
} from "../src/agent/practice.js";
vi.mock("../src/agent/binancePublic.js", () => ({
  拉取币安最新价: vi.fn(async () => 101),
  拉取币安K线: vi.fn(async (args: { 市场?: "现货" | "U本位合约" }) => ({
    交易对: "BTCUSDT",
    市场: args.市场 ?? "现货",
    周期: "1h",
    根数: 120,
    来源: "币安 Agent OS MCP",
    更新时间: new Date().toISOString(),
    最新价: 100,
    涨跌百分比: 2,
    波动百分比: 1,
    成交量变化约百分比: 0,
    指标: { RSI: 50 },
    K线: [],
  })),
}));
let dir: string, twinId: string, oldDir: string | undefined;
beforeEach(() => {
  oldDir = process.env.SMARTVIBE_DATA_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "smartvibe-practice-"));
  process.env.SMARTVIBE_DATA_DIR = dir;
  const scenarios = 列出冷启动情景().情景列表;
  twinId = 创建交易分身({
    答案: scenarios.map((s) => ({
      情景编号: s.情景编号,
      选项编号: s.选项[0]!.选项编号,
    })),
  }).分身编号;
});
afterEach(() => {
  if (oldDir) process.env.SMARTVIBE_DATA_DIR = oldDir;
  else delete process.env.SMARTVIBE_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});
async function input(市场: "现货" | "U本位合约" = "现货") {
  const m = await loadPracticeMarket({ 市场 });
  return {
    分身编号: twinId,
    请求编号: randomUUID(),
    行情编号: m.行情编号,
    方向: "做多",
    订单类型: "限价",
    仓位比例: 10,
    限价: 90,
    止损: 80,
    理由: "测试订单",
  };
}
describe("真实行情模拟账本", () => {
  it("支持任意币安交易对简称和5分钟周期", () => {
    expect(marketSchema.parse({ 交易对: "ake", 周期: "5m" })).toMatchObject({
      交易对: "AKEUSDT",
      市场: "现货",
      周期: "5m",
    });
    expect(marketSchema.parse({ 交易对: "edge", 市场: "U本位合约" })).toMatchObject({
      交易对: "EDGEUSDT",
      市场: "U本位合约",
    });
    expect(marketSchema.parse({ 交易对: "edge", 市场: "现货" })).toMatchObject({
      交易对: "EDGEUSDT",
      市场: "现货",
    });
    expect(marketSchema.parse({ 交易对: "eth", 市场: "U本位合约" })).toMatchObject({
      交易对: "ETHUSDT",
      市场: "U本位合约",
    });
    expect(marketSchema.parse({ 交易对: "btc", 市场: "现货" })).toMatchObject({
      交易对: "BTCUSDT",
      市场: "现货",
    });
    expect(marketSchema.parse({ 交易对: "ETHBTC", 市场: "现货" })).toMatchObject({
      交易对: "ETHBTCUSDT",
      市场: "现货",
    });
    expect(tradingSymbolCandidates("WBTC")).toEqual(["WBTCUSDT", "WBTC"]);
    expect(tradingSymbolCandidates("BETH")).toEqual(["BETHUSDT", "BETH"]);
    expect(tradingSymbolCandidates("1000PEPE")).toEqual(["1000PEPEUSDT", "1000PEPE"]);
    expect(tradingSymbolCandidates("ETHBTC")).toEqual(["ETHBTCUSDT", "ETHBTC"]);
    expect(tradingSymbolCandidates("BTCUSDC")).toEqual(["BTCUSDC"]);
  });
  it("提交前能用官方最新价生成新的行情快照", async () => {
    const market = await loadPracticeMarket({});
    const latest = await syncPracticeQuote(twinId, market.行情编号);
    expect(latest.行情编号).not.toBe(market.行情编号);
    expect(latest.最新价).toBe(101);
  });
  it("限价等待后按观测报价成交；跳过止损价时按实际报价结算", async () => {
    const o = submitPracticeOrder(await input());
    expect(o.状态).toBe("待成交");
    applyQuote(o, 95);
    expect(o.状态).toBe("待成交");
    applyQuote(o, 89);
    expect(o.成交价).toBe(89);
    expect(o.成交时间).toBeTruthy();
    expect(o.状态).toBe("持仓中");
    applyQuote(o, 75);
    expect(o.状态).toBe("已平仓");
    expect(o.平仓价).toBe(75);
    expect(o.结束时间).toBeTruthy();
    expect(o.盈亏).toBeCloseTo((75 - 89) * o.数量);
  });
  it("相同提交不重复占用资金；同一笔单不重复演化记忆", async () => {
    const p = await input();
    const first = submitPracticeOrder(p),
      again = submitPracticeOrder(p);
    expect(again.编号).toBe(first.编号);
    expect(practiceState(twinId).订单).toHaveLength(1);
    reviewPracticeOrder(twinId, first.编号);
    rememberPracticeOrder(twinId, first.编号);
    const state = rememberPracticeOrder(twinId, first.编号);
    expect(state.已复盘).toBe(1);
    expect(state.分身.版本).toBe(1);
    expect(state.订单[0]!.行情.涨跌百分比).toBe(2);
  });
  it("错误止损、跨分身访问和无行情提交会被拒绝", async () => {
    const p = await input();
    expect(() => submitPracticeOrder({ ...p, 止损: 95 })).toThrow("止损");
    expect(() => submitPracticeOrder({ ...p, 行情编号: randomUUID() })).toThrow(
      "行情",
    );
    const o = submitPracticeOrder(p);
    expect(() => reviewPracticeOrder("unknown", o.编号)).toThrow();
  });
  it("做空盈亏方向正确，未触价不提前止盈", async () => {
    const p = await input("U本位合约");
    const o = submitPracticeOrder({
      ...p,
      方向: "做空",
      订单类型: "市价",
      止损: 110,
      止盈: 80,
    });
    applyQuote(o, 90);
    expect(o.状态).toBe("持仓中");
    expect(o.盈亏).toBeCloseTo(10 * o.数量);
    applyQuote(o, 79);
    expect(o.状态).toBe("已平仓");
    expect(o.结束原因).toBe("模拟止盈触发");
  });
  it("现货不允许直接做空，开仓量按具体标的数量计算", async () => {
    const spot = await input();
    expect(() => submitPracticeOrder({ ...spot, 方向: "做空" })).toThrow("现货练习不支持直接做空");
    const order = submitPracticeOrder({
      ...spot,
      请求编号: randomUUID(),
      订单类型: "市价",
      开仓数量: 2.5,
    });
    expect(order.数量).toBe(2.5);
    expect(order.成交时间).toBeTruthy();
    expect(order.本金).toBe(250);
    expect(order.杠杆倍数).toBe(1);
  });
  it("合约杠杆按保证金占用资金，并按名义数量计算盈亏和手续费", async () => {
    const contract = await input("U本位合约");
    const order = submitPracticeOrder({
      ...contract,
      请求编号: randomUUID(),
      订单类型: "市价",
      杠杆倍数: 5,
      开仓数量: 2,
      限价: undefined,
      止损: 90,
    });
    expect(order.杠杆倍数).toBe(5);
    expect(order.数量).toBe(2);
    expect(order.本金).toBe(40);
    expect(order.手续费).toBeCloseTo(0.1);
    applyQuote(order, 110);
    expect(order.盈亏).toBeCloseTo(20);
  });
  it("横盘 RSI 为 50，MACD 等待足够 DIF 数据后才生成 DEA", () => {
    expect(calcRsi(Array(40).fill(100))[39]).toBe(50);
    const macd = calcMacd(Array.from({ length: 40 }, (_, i) => 100 + i));
    expect(macd.dea.slice(0, 33).every((x) => x === null)).toBe(true);
    expect(macd.dea[33]).not.toBeNull();
  });
});
