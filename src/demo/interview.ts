/**
 * Demo-facing adapters.
 * Trading Interview source of truth: src/interview/scenarioLibrary.ts
 */
import type { DecisionPattern, MarketContext } from "../domain/types.js";
import {
  CORE_THREE_SCENARIO_IDS,
  getInterviewSet,
  interviewScenarioLibrary,
  MVP_INTERVIEW_SCENARIO_IDS,
} from "../interview/scenarioLibrary.js";
import type { InterviewScenario } from "../interview/types.js";

export type { InterviewScenario };
export {
  interviewScenarioLibrary,
  CORE_THREE_SCENARIO_IDS,
  MVP_INTERVIEW_SCENARIO_IDS,
  getInterviewSet,
};

/** @deprecated use InterviewScenario from scenario library */
export interface InterviewOption {
  id: DecisionPattern;
  label: string;
  option_id?: string;
}

/** @deprecated use InterviewScenario */
export interface InterviewTurn {
  id: string;
  title: string;
  prompt: string;
  market_context: MarketContext;
  options: InterviewOption[];
  category?: string;
}

function toTurn(s: InterviewScenario): InterviewTurn {
  return {
    id: s.scenario_id,
    title: s.title ?? s.scenario_id,
    prompt: s.question,
    market_context: s.market_context,
    category: s.category,
    options: s.options.map((o) => ({
      id: o.decision_pattern,
      label: o.label,
      option_id: o.option_id,
    })),
  };
}

/** Default demo interview = full MVP set (5 categories) */
export const tradingInterviewTurns: InterviewTurn[] = getInterviewSet(
  MVP_INTERVIEW_SCENARIO_IDS,
).map(toTurn);

/** Stable original 3 fixtures */
export const coreThreeInterviewTurns: InterviewTurn[] = getInterviewSet(
  CORE_THREE_SCENARIO_IDS,
).map(toTurn);

export interface DemoMarketScenario {
  scenario_id: string;
  title: string;
  market_context: MarketContext;
  options: InterviewOption[];
}

export const demoLoopScenarios: DemoMarketScenario[] = [
  {
    scenario_id: "rapid_pump",
    title: "Rapid Pump / FOMO",
    market_context: {
      symbol: "BTCUSDT",
      summary: "BTC +12% in <2h; volume and social heat spike",
      metrics: {
        price_change_pct: 12,
        volatility_regime: "extreme",
        volume_change_pct: 95,
        open_interest_change_pct: 18,
        funding_rate: 0.0011,
        funding_elevated: true,
      },
      source: "demo_fixture",
    },
    options: [
      { id: "chase_entry", label: "Chase the move" },
      { id: "enter_small", label: "Enter small" },
      { id: "observe_wait", label: "Wait for confirmation" },
      { id: "reduce_risk", label: "Reduce risk if already exposed" },
    ],
  },
  {
    scenario_id: "sharp_drop",
    title: "Sharp Drop / Panic",
    market_context: {
      symbol: "BTCUSDT",
      summary: "BTC -9%; liquidity stress; funding flips negative",
      metrics: {
        price_change_pct: -9,
        volatility_regime: "extreme",
        volume_change_pct: 110,
        open_interest_change_pct: -12,
        funding_rate: -0.0004,
        funding_elevated: false,
      },
      source: "demo_fixture",
    },
    options: [
      { id: "exit_bias", label: "Exit / cut exposure" },
      { id: "reduce_risk", label: "Reduce risk" },
      { id: "hold", label: "Hold through the drop" },
      { id: "enter_small", label: "Buy the dip (small)" },
    ],
  },
  {
    scenario_id: "false_breakout",
    title: "False Breakout",
    market_context: {
      symbol: "BTCUSDT",
      summary: "Breakout fails reclaim; price back in range; OI elevated then stalls",
      metrics: {
        price_change_pct: 1.5,
        volatility_regime: "high",
        volume_change_pct: 55,
        open_interest_change_pct: 14,
        funding_rate: 0.0005,
        funding_elevated: true,
      },
      source: "demo_fixture",
    },
    options: [
      { id: "chase_entry", label: "Treat breakout as real" },
      { id: "observe_wait", label: "Wait for re-acceptance" },
      { id: "trim", label: "Trim breakout add-on" },
      { id: "reduce_risk", label: "Step aside / reduce risk" },
    ],
  },
];
