import type {
  DecisionMemory,
  DecisionPattern,
  MarketContext,
  TradingTwinProfile,
  TwinResponse,
} from "../domain/types.js";
import type { DemoMarketScenario, InterviewTurn } from "./interview.js";

export type DemoState =
  | "STATE_BOOT"
  | "STATE_SAME_MARKET_COMPARE"
  | "STATE_INITIALIZE_TWIN"
  | "STATE_MARKET_CONTEXT"
  | "STATE_TWIN_RESPONSE"
  | "STATE_USER_CHOICE"
  | "STATE_REFLECTION"
  | "STATE_MEMORY_WRITE"
  | "STATE_TWIN_UPDATE"
  | "STATE_EVOLUTION_EVIDENCE"
  | "STATE_DEMO_END";

export const DEMO_FLOW: DemoState[] = [
  "STATE_SAME_MARKET_COMPARE",
  "STATE_INITIALIZE_TWIN",
  "STATE_MARKET_CONTEXT",
  "STATE_TWIN_RESPONSE",
  "STATE_USER_CHOICE",
  "STATE_REFLECTION",
  "STATE_MEMORY_WRITE",
  "STATE_TWIN_UPDATE",
  "STATE_EVOLUTION_EVIDENCE",
  "STATE_DEMO_END",
];

export interface DemoContext {
  state: DemoState;
  logs: string[];
  twinA: TradingTwinProfile | null;
  twinB: TradingTwinProfile | null;
  twinAResponse: TwinResponse | null;
  twinBResponse: TwinResponse | null;
  userTwin: TradingTwinProfile | null;
  interviewTurns: InterviewTurn[];
  interviewChoices: DecisionPattern[];
  activeScenario: DemoMarketScenario | null;
  marketContext: MarketContext | null;
  twinResponse: TwinResponse | null;
  userChoice: DecisionPattern | null;
  lastMemory: DecisionMemory | null;
  history: DemoState[];
}

export function createDemoContext(): DemoContext {
  return {
    state: "STATE_BOOT",
    logs: [],
    twinA: null,
    twinB: null,
    twinAResponse: null,
    twinBResponse: null,
    userTwin: null,
    interviewTurns: [],
    interviewChoices: [],
    activeScenario: null,
    marketContext: null,
    twinResponse: null,
    userChoice: null,
    lastMemory: null,
    history: [],
  };
}

export function nextState(current: DemoState): DemoState | null {
  if (current === "STATE_BOOT") return "STATE_SAME_MARKET_COMPARE";
  const idx = DEMO_FLOW.indexOf(current);
  if (idx < 0 || idx >= DEMO_FLOW.length - 1) return null;
  return DEMO_FLOW[idx + 1];
}

export function advance(ctx: DemoContext, to: DemoState): DemoContext {
  return {
    ...ctx,
    state: to,
    history: [...ctx.history, to],
  };
}
