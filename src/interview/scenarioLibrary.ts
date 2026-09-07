import type { InterviewScenario } from "./types.js";
import { coachQuestionBank } from "./coachQuestionBank.js";

/**
 * Trading Interview Scenario Library (MVP).
 * Extensible: add scenarios without changing Twin builder logic.
 */
export const interviewScenarioLibrary: InterviewScenario[] = [
  {
    scenario_id: "iv_fomo_chase_pump",
    category: "fomo",
    title: "急涨追价",
    question:
      "比特币短时快速上涨约 20%，你当前没有仓位。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "快速拉升，你尚未持仓",
      metrics: {
        price_change_pct: 20,
        volatility_regime: "extreme",
        volume_change_pct: 120,
        open_interest_change_pct: 25,
        funding_rate: 0.0012,
        funding_elevated: true,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "chase",
        label: "直接追进去",
        decision_pattern: "chase_entry",
        dimension_impact: {
          fomo_tendency: 10,
          momentum_preference: 8,
          patience: -8,
          confirmation_need: -6,
          size_aggression: 6,
        },
      },
      {
        option_id: "small",
        label: "先小仓试探",
        decision_pattern: "enter_small",
        dimension_impact: {
          momentum_preference: 5,
          confirmation_need: 4,
          fomo_tendency: -4,
          size_aggression: -4,
        },
      },
      {
        option_id: "wait",
        label: "等回调或更多确认再动",
        decision_pattern: "observe_wait",
        dimension_impact: {
          patience: 10,
          confirmation_need: 8,
          fomo_tendency: -10,
          momentum_preference: -6,
        },
      },
    ],
  },
  {
    scenario_id: "iv_panic_drawdown",
    category: "panic_selling",
    title: "持仓暴跌",
    question:
      "你已有仓位，比特币单日下跌约 8%。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "持仓遭遇急跌",
      metrics: {
        price_change_pct: -8,
        volatility_regime: "extreme",
        volume_change_pct: 90,
        open_interest_change_pct: -10,
        funding_rate: -0.0003,
        funding_elevated: false,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "exit",
        label: "偏向砍仓离场",
        decision_pattern: "exit_bias",
        dimension_impact: {
          drawdown_response: -10,
          risk_tolerance: -8,
          holding_preference: -8,
          confirmation_need: 6,
          patience: -4,
        },
      },
      {
        option_id: "reduce",
        label: "先降低风险暴露",
        decision_pattern: "reduce_risk",
        dimension_impact: {
          drawdown_response: -6,
          risk_tolerance: -6,
          exposure_comfort: -6,
          patience: 4,
          fomo_tendency: -4,
        },
      },
      {
        option_id: "hold",
        label: "扛住，继续持有",
        decision_pattern: "hold",
        dimension_impact: {
          drawdown_response: 10,
          holding_preference: 10,
          patience: 6,
          risk_tolerance: 4,
          size_aggression: -4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_confirmation_false_break",
    category: "confirmation_bias",
    title: "假突破犹豫",
    question:
      "价格刚突破区间后又跌回区间内（疑似假突破）。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "突破失败，价格回到原区间",
      metrics: {
        price_change_pct: 1.2,
        volatility_regime: "high",
        volume_change_pct: 40,
        open_interest_change_pct: 12,
        funding_rate: 0.0004,
        funding_elevated: true,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "lean_in",
        label: "当真突破，继续跟进",
        decision_pattern: "chase_entry",
        dimension_impact: {
          confirmation_need: -10,
          momentum_preference: 8,
          fomo_tendency: 6,
          patience: -6,
        },
      },
      {
        option_id: "wait_reaccept",
        label: "等价格重新站稳再决定",
        decision_pattern: "observe_wait",
        dimension_impact: {
          confirmation_need: 10,
          patience: 8,
          momentum_preference: -6,
          fomo_tendency: -4,
        },
      },
      {
        option_id: "trim",
        label: "先把投机加仓减一点",
        decision_pattern: "trim",
        dimension_impact: {
          confirmation_need: 6,
          size_aggression: -6,
          risk_tolerance: -4,
          exposure_comfort: -4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_patience_chop",
    category: "patience",
    title: "横盘磨人",
    question:
      "比特币窄幅震荡两周，成交量变淡。你最终还想有仓位。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "长期横盘，缺少方向",
      metrics: {
        price_change_pct: 0.8,
        volatility_regime: "low",
        volume_change_pct: -25,
        open_interest_change_pct: 2,
        funding_rate: 0.0001,
        funding_elevated: false,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "force_entry",
        label: "强行进场，怕错过下一波",
        decision_pattern: "enter_small",
        dimension_impact: {
          patience: -10,
          confirmation_need: -6,
          fomo_tendency: 6,
          momentum_preference: 4,
        },
      },
      {
        option_id: "wait_trigger",
        label: "等明确突破并站稳再动",
        decision_pattern: "observe_wait",
        dimension_impact: {
          patience: 10,
          confirmation_need: 8,
          fomo_tendency: -6,
          momentum_preference: -4,
        },
      },
      {
        option_id: "scale_plan",
        label: "按计划小仓分批，忽略噪音",
        decision_pattern: "hold",
        dimension_impact: {
          patience: 6,
          holding_preference: 6,
          size_aggression: -4,
          confirmation_need: 4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_risk_size_opportunity",
    category: "risk_tolerance",
    title: "看好时的仓位",
    question:
      "出现你喜欢的结构，你可以小仓、正常仓或加码。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "盘整后结构较清晰，关键是仓位大小",
      metrics: {
        price_change_pct: 3.5,
        volatility_regime: "medium",
        volume_change_pct: 35,
        open_interest_change_pct: 8,
        funding_rate: 0.0002,
        funding_elevated: false,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "press",
        label: "明显加码、提高风险",
        decision_pattern: "chase_entry",
        dimension_impact: {
          risk_tolerance: 10,
          size_aggression: 10,
          exposure_comfort: 8,
          confirmation_need: -4,
        },
      },
      {
        option_id: "normal",
        label: "用平时计划仓位",
        decision_pattern: "enter_small",
        dimension_impact: {
          risk_tolerance: 4,
          size_aggression: 4,
          confirmation_need: 4,
        },
      },
      {
        option_id: "conservative",
        label: "保守：半仓或先跳过",
        decision_pattern: "observe_wait",
        dimension_impact: {
          risk_tolerance: -8,
          size_aggression: -8,
          exposure_comfort: -6,
          confirmation_need: 6,
          patience: 4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_revenge_after_loss",
    category: "fomo",
    title: "亏损后报复单",
    question:
      "刚止损或被动亏损后，市场很快又给了一个「看起来能回本」的机会。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "亏损后出现反弹诱惑",
      metrics: {
        price_change_pct: 4.5,
        volatility_regime: "high",
        volume_change_pct: 55,
        open_interest_change_pct: 10,
        funding_rate: 0.0005,
        funding_elevated: true,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "revenge",
        label: "立刻再开，想尽快扳回",
        decision_pattern: "chase_entry",
        dimension_impact: {
          fomo_tendency: 10,
          patience: -10,
          size_aggression: 8,
          confirmation_need: -8,
          risk_tolerance: 6,
        },
      },
      {
        option_id: "cool_down",
        label: "强制冷静一段时间再交易",
        decision_pattern: "observe_wait",
        dimension_impact: {
          patience: 10,
          fomo_tendency: -8,
          confirmation_need: 6,
          size_aggression: -6,
        },
      },
      {
        option_id: "half_rules",
        label: "只按原计划半仓试，且必须有止损",
        decision_pattern: "enter_small",
        dimension_impact: {
          patience: 4,
          confirmation_need: 4,
          size_aggression: -4,
          fomo_tendency: -4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_stop_loss_hit",
    category: "panic_selling",
    title: "接近止损时",
    question:
      "价格靠近你预设的止损位，但社交舆论都说「再等等会回来」。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "价格逼近止损，舆论劝扛",
      metrics: {
        price_change_pct: -5.5,
        volatility_regime: "high",
        volume_change_pct: 70,
        open_interest_change_pct: -8,
        funding_rate: -0.0002,
        funding_elevated: false,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "honor_stop",
        label: "执行止损，离场复盘",
        decision_pattern: "exit_bias",
        dimension_impact: {
          confirmation_need: 6,
          drawdown_response: -4,
          patience: 4,
          fomo_tendency: -6,
        },
      },
      {
        option_id: "move_stop",
        label: "把止损再挪远一点",
        decision_pattern: "hold",
        dimension_impact: {
          drawdown_response: 8,
          holding_preference: 8,
          risk_tolerance: 6,
          confirmation_need: -6,
        },
      },
      {
        option_id: "add_down",
        label: "下跌中加仓摊平",
        decision_pattern: "chase_entry",
        dimension_impact: {
          size_aggression: 10,
          risk_tolerance: 8,
          drawdown_response: 6,
          confirmation_need: -8,
          fomo_tendency: 4,
        },
      },
    ],
  },
  {
    scenario_id: "iv_funding_high_chase",
    category: "confirmation_bias",
    title: "费率飙升时",
    question:
      "单边大涨，资金费率明显偏高，朋友圈都在晒盈利。按你平时习惯，更可能怎么做？",
    market_context: {
      symbol: "BTCUSDT",
      summary: "情绪高潮，资金费率偏高",
      metrics: {
        price_change_pct: 9,
        volatility_regime: "extreme",
        volume_change_pct: 100,
        open_interest_change_pct: 22,
        funding_rate: 0.0015,
        funding_elevated: true,
      },
      source: "interview_scenario",
    },
    options: [
      {
        option_id: "join_fomo",
        label: "跟着气氛追多",
        decision_pattern: "chase_entry",
        dimension_impact: {
          fomo_tendency: 10,
          momentum_preference: 8,
          confirmation_need: -8,
          patience: -8,
        },
      },
      {
        option_id: "fade_or_wait",
        label: "警惕拥挤，先观望或降风险",
        decision_pattern: "reduce_risk",
        dimension_impact: {
          confirmation_need: 8,
          patience: 6,
          fomo_tendency: -8,
          risk_tolerance: -4,
        },
      },
      {
        option_id: "tiny_late",
        label: "只开极小仓位参与，并设紧止损",
        decision_pattern: "enter_small",
        dimension_impact: {
          size_aggression: -6,
          confirmation_need: 4,
          fomo_tendency: 2,
          momentum_preference: 4,
        },
      },
    ],
  },
];

/** 旧演示用 3 题（兼容） */
export const CORE_THREE_SCENARIO_IDS = [
  "iv_fomo_chase_pump",
  "iv_panic_drawdown",
  "iv_confirmation_false_break",
] as const;

/** 交易陪练建档题库（更深，不只 3 题） */
export const COACH_PROFILE_SCENARIO_IDS = [
  "iv_fomo_chase_pump",
  "iv_panic_drawdown",
  "iv_confirmation_false_break",
  "iv_patience_chop",
  "iv_risk_size_opportunity",
  "iv_revenge_after_loss",
  "iv_stop_loss_hit",
  "iv_funding_high_chase",
] as const;

/** MVP set covering all five behavioral categories */
export const MVP_INTERVIEW_SCENARIO_IDS = COACH_PROFILE_SCENARIO_IDS;

export function getScenarioById(id: string): InterviewScenario | undefined {
  return [...interviewScenarioLibrary, ...coachQuestionBank].find((s) => s.scenario_id === id);
}

export function getInterviewSet(
  ids: readonly string[] = MVP_INTERVIEW_SCENARIO_IDS,
): InterviewScenario[] {
  return ids.map((id) => {
    const s = getScenarioById(id);
    if (!s) throw new Error(`Unknown interview scenario: ${id}`);
    return s;
  });
}

export function resolveOption(
  scenario: InterviewScenario,
  optionIdOrPattern: string,
) {
  return (
    scenario.options.find((o) => o.option_id === optionIdOrPattern) ??
    scenario.options.find((o) => o.decision_pattern === optionIdOrPattern)
  );
}
