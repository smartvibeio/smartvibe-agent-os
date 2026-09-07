import {
  calcBollinger,
  calcMacd,
  calcRsi,
  lastNumber,
  type Candle,
} from "./indicators.js";
import { 尝试调用币安Mcp工具 } from "./binanceMcp.js";
import { binanceFetch } from "./binanceHttp.js";

const BINANCE_KLINES_HOSTS = [
  "https://data-api.binance.vision/api/v3/klines",
  "https://api.binance.com/api/v3/klines",
];
const BINANCE_TICKER_HOSTS = [
  "https://data-api.binance.vision/api/v3/ticker/price",
  "https://api.binance.com/api/v3/ticker/price",
];

export type MarketPack = {
  交易对: string;
  市场: "现货" | "U本位合约";
  周期: string;
  根数: number;
  来源: string;
  更新时间: string;
  连接状态: string;
  指标序列: { macd: ReturnType<typeof calcMacd>; rsi: (number | null)[] };
  K线: Candle[];
  最新价: number;
  涨跌百分比: number;
  波动百分比: number;
  成交量变化约百分比: number | null;
  指标: {
    MACD: { DIF: number | null; DEA: number | null; 柱: number | null };
    RSI: number | null;
    布林带: {
      上轨: number | null;
      中轨: number | null;
      下轨: number | null;
    };
  };
  解读: string;
  要点: string[];
};

function toNum(v: string | number) {
  return typeof v === "number" ? v : Number(v);
}

export async function 拉取币安最新价(
  symbol: string,
  market: "现货" | "U本位合约" = "现货",
) {
  const 交易对 = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,20}$/.test(交易对)) throw new Error("交易标的不正确");
  let lastError: unknown;
  const hosts =
    market === "U本位合约"
      ? ["https://fapi.binance.com/fapi/v1/ticker/price"]
      : BINANCE_TICKER_HOSTS;
  for (const host of hosts) {
    try {
      const url = new URL(host);
      url.searchParams.set("symbol", 交易对);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const response = await binanceFetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      const body = (await response.json()) as { price?: string | number };
      const price = Number(body.price);
      if (!Number.isFinite(price) || price <= 0)
        throw new Error("最新价无效");
      return price;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "未知错误";
  throw new Error(`读取币安最新价失败：${detail}`);
}

async function fetchKlinesRaw(
  交易对: string,
  周期: string,
  根数: number,
  range?: { startTime: number; endTime: number },
  market: "现货" | "U本位合约" = "现货",
): Promise<{ raw: unknown[]; host: string }> {
  let lastErr: unknown;
  const hosts = market === "U本位合约"
    ? ["https://fapi.binance.com/fapi/v1/klines"]
    : BINANCE_KLINES_HOSTS;
  for (const host of hosts) {
    const url = new URL(host);
    url.searchParams.set("symbol", 交易对);
    url.searchParams.set("interval", 周期);
    url.searchParams.set("limit", String(根数));
    if (range) {
      url.searchParams.set("startTime", String(range.startTime));
      url.searchParams.set("endTime", String(range.endTime));
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await binanceFetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const raw = (await res.json()) as unknown[];
      return { raw, host };
    } catch (err) {
      lastErr = err;
    }
  }
  const detail =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "未知错误");
  throw new Error(`拉取币安行情失败：${detail}。请稍后重试或换交易对。`);
}

export async function 拉取币安K线(args: {
  交易对?: string;
  周期?: string;
  根数?: number;
  历史范围?: { startTime: number; endTime: number };
  市场?: "现货" | "U本位合约";
}): Promise<MarketPack> {
  const 交易对 = (args.交易对 ?? "BTCUSDT").toUpperCase();
  const 周期 = args.周期 ?? "1h";
  const 根数 = Math.min(Math.max(args.根数 ?? 120, 50), 500);

  let raw: unknown[];
  const 市场 = args.市场 ?? "现货";
  let 来源 = 市场 === "现货" ? "币安 Agent OS MCP · 现货行情" : "币安公开 API · U本位合约行情";
  let 连接状态 = 市场 === "现货" ? "官方 MCP 已连接" : "币安合约公开行情已连接";
  try {
    if (市场 === "U本位合约") throw new Error("合约行情使用币安公开接口");
    const result = await 尝试调用币安Mcp工具("spot.klines", {
      symbol: 交易对,
      interval: 周期,
      limit: 根数,
      ...args.历史范围,
    });
    if (
      !Array.isArray(result) ||
      result.length < 30 ||
      result.some(
        (r) =>
          !Array.isArray(r) ||
          r.length < 6 ||
          r.slice(0, 6).some((v: unknown) => !Number.isFinite(Number(v))),
      )
    )
      throw new Error("网页未收到有效官方 K线");
    raw = result;
    if (args.历史范围 && raw.some(row => {
      const time = Number((row as unknown[])[0]);
      return time < args.历史范围!.startTime || time > args.历史范围!.endTime;
    })) throw new Error("MCP 返回的历史范围不匹配");
  } catch {
    const fallback = await fetchKlinesRaw(交易对, 周期, 根数, args.历史范围, 市场);
    raw = fallback.raw;
    来源 = 市场 === "现货" ? "币安公开 API · 现货行情" : "币安公开 API · U本位合约行情";
    连接状态 = 市场 === "现货" ? "官方 MCP 暂不可用，已回退公开行情" : "币安合约公开行情已连接";
  }
  const K线: Candle[] = raw.map((row) => {
    const r = row as (string | number)[];
    return {
      time: Math.floor(toNum(r[0]!) / 1000),
      open: toNum(r[1]!),
      high: toNum(r[2]!),
      low: toNum(r[3]!),
      close: toNum(r[4]!),
      volume: toNum(r[5]!),
    };
  });

  if (K线.length < 30) {
    throw new Error("K线数据过少，无法计算指标。");
  }

  const closes = K线.map((c) => c.close);
  const first = K线[0]!.close;
  const last = K线[K线.length - 1]!.close;
  const 涨跌百分比 = ((last - first) / first) * 100;

  const ranges = K线.map((c) => ((c.high - c.low) / c.close) * 100);
  const 波动百分比 =
    ranges.reduce((a, b) => a + b, 0) / Math.max(ranges.length, 1);

  const half = Math.floor(K线.length / 2);
  const vol1 = K线.slice(0, half).reduce((a, c) => a + c.volume, 0) / half;
  const vol2 =
    K线.slice(half).reduce((a, c) => a + c.volume, 0) /
    Math.max(K线.length - half, 1);
  const 成交量变化约百分比 = vol1 > 0 ? ((vol2 - vol1) / vol1) * 100 : null;

  const macd = calcMacd(closes);
  const rsi = calcRsi(closes, 14);
  const bb = calcBollinger(closes, 20, 2);

  const DIF = lastNumber(macd.dif);
  const DEA = lastNumber(macd.dea);
  const 柱 = lastNumber(macd.hist);
  const RSI值 = lastNumber(rsi);
  const 上轨 = lastNumber(bb.upper);
  const 中轨 = lastNumber(bb.mid);
  const 下轨 = lastNumber(bb.lower);

  const 要点: string[] = [];
  const 波动标签 =
    波动百分比 >= 2.5
      ? "波动极端"
      : 波动百分比 >= 1.2
        ? "波动偏高"
        : "波动温和";

  要点.push(
    `${交易对} 近 ${根数} 根（${周期}）涨跌约 ${涨跌百分比.toFixed(2)}%，${波动标签}`,
  );
  if (成交量变化约百分比 != null) {
    要点.push(`成交量相对前半段变化约 ${成交量变化约百分比.toFixed(0)}%`);
  }
  if (RSI值 != null) {
    if (RSI值 >= 70)
      要点.push(`RSI≈${RSI值.toFixed(1)}，偏超买区，追涨需更谨慎`);
    else if (RSI值 <= 30)
      要点.push(`RSI≈${RSI值.toFixed(1)}，偏超卖区，抄底亦需规则`);
    else 要点.push(`RSI≈${RSI值.toFixed(1)}，中性区间`);
  }
  if (柱 != null && DIF != null) {
    要点.push(
      柱 >= 0
        ? `MACD 柱为正（动能偏多），DIF≈${DIF.toFixed(2)}`
        : `MACD 柱为负（动能偏空），DIF≈${DIF.toFixed(2)}`,
    );
  }
  if (last != null && 上轨 != null && 下轨 != null && 中轨 != null) {
    if (last >= 上轨) 要点.push("价格触及/站上布林上轨，常伴随延伸或回吐");
    else if (last <= 下轨)
      要点.push("价格触及/跌破布林下轨，常伴随恐慌或反弹博弈");
    else 要点.push("价格在布林带通道内运行");
  }

  const 解读 = `${要点[0]}。${要点.slice(1).join("。")}。以上为盘面事实描述，不是买卖建议。先想你会怎么开，再对照分身与私教点评。`;

  return {
    交易对,
    市场,
    周期,
    根数,
    来源,
    连接状态,
    更新时间: new Date().toISOString(),
    指标序列: { macd, rsi },
    K线,
    最新价: last,
    涨跌百分比: Number(涨跌百分比.toFixed(2)),
    波动百分比: Number(波动百分比.toFixed(2)),
    成交量变化约百分比:
      成交量变化约百分比 == null ? null : Number(成交量变化约百分比.toFixed(1)),
    指标: {
      MACD: { DIF, DEA, 柱 },
      RSI: RSI值,
      布林带: { 上轨, 中轨, 下轨 },
    },
    解读,
    要点,
  };
}
