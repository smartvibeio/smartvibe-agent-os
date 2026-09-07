import type { DecisionPattern, MarketContext } from "../domain/types.js";

export function 决策倾向中文(pattern: DecisionPattern | string): string {
  const map: Record<string, string> = {
    chase_entry: "按旧习惯更可能追入",
    enter_small: "按旧习惯更可能小仓试探",
    hold: "按旧习惯更可能持有观望",
    observe_wait: "按旧习惯更可能等待确认",
    trim: "按旧习惯更可能先减一点仓",
    reduce_risk: "按旧习惯更可能降低风险暴露",
    exit_bias: "按旧习惯更可能偏向离场保护",
  };
  return map[pattern] ?? String(pattern);
}

export function 决策动作中文(pattern: DecisionPattern | string): string {
  const map: Record<string, string> = {
    open_position: "模拟开仓（动机待核对）",
    chase_entry: "追入/加仓冲动",
    enter_small: "小仓试探",
    hold: "持有观望",
    observe_wait: "等待确认",
    trim: "减仓谨慎",
    reduce_risk: "降低风险",
    exit_bias: "离场保护",
  };
  return map[pattern] ?? String(pattern);
}

export function 波动中文(v: string | null | undefined): string {
  const map: Record<string, string> = {
    low: "低",
    medium: "中",
    high: "高",
    extreme: "极端",
  };
  return v ? (map[v] ?? v) : "未知";
}

export function 行情中文摘要(market: MarketContext): string {
  const m = market.metrics;
  const parts = [
    `${market.symbol}`,
    `涨跌约 ${m.price_change_pct}%`,
    `波动${波动中文(m.volatility_regime)}`,
  ];
  if (m.open_interest_change_pct != null) {
    parts.push(`持仓量变化约 ${m.open_interest_change_pct}%`);
  }
  if (m.funding_elevated) parts.push("资金费率偏高");
  return parts.join("，");
}

/** 用户意图 → 决策倾向（开仓前提醒用） */
export function 解析用户意图(intent: string): DecisionPattern {
  const t = intent.trim().toLowerCase();
  if (/(追|冲|马上开|市价多|市价空|all.?in)/.test(t)) return "chase_entry";
  if (/(小仓|试探|轻仓)/.test(t)) return "enter_small";
  if (/(等|观望|确认|再看看)/.test(t)) return "observe_wait";
  if (/(减仓|降风险|降暴露)/.test(t)) return "reduce_risk";
  if (/(平|砍|离场)/.test(t)) return "exit_bias";
  if (/(持有|拿着)/.test(t)) return "hold";
  if (/(trim|减一点)/.test(t)) return "trim";
  return "enter_small";
}
