/**
 * Web session bridge — orchestration only.
 * Reuses fixtures, interview library, modelTwinResponse, applyDecisionLoop, states.
 * Does NOT reimplement Evolve / scoring / schema logic.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { openDb, migrate, type AppDatabase } from "../db/client.js";
import { createTwin, getTwin, updateTwin } from "../db/twinsRepo.js";
import { listMemoriesForTwin } from "../db/memoriesRepo.js";
import { computeDifference } from "../domain/evolve.js";
import { modelTwinResponse } from "../domain/modelResponse.js";
import type {
  DecisionMemory,
  DecisionPattern,
  TradingTwinProfile,
  TwinResponse,
} from "../domain/types.js";
import {
  sameMarketStimulus,
  twinAFixture,
  twinBFixture,
  TWIN_A_ID,
  TWIN_B_ID,
} from "../fixtures/demoData.js";
import { createTwinFromInterviewAnswers } from "../interview/createTwinFromInterview.js";
import {
  CORE_THREE_SCENARIO_IDS,
  getInterviewSet,
  resolveOption,
} from "../interview/scenarioLibrary.js";
import type { InterviewAnswer, InterviewScenario } from "../interview/types.js";
import { applyDecisionLoop } from "../services/decisionLoop.js";
import { demoLoopScenarios } from "../demo/interview.js";
import {
  advance,
  createDemoContext,
  DEMO_FLOW,
  nextState,
  type DemoContext,
  type DemoState,
} from "./states.js";

export type DemoMode = "fixtures";

export interface SessionPublicView {
  session_id: string;
  demo_mode: DemoMode;
  state: DemoState;
  history: DemoState[];
  dashboard: {
    product_name: string;
    tagline: string;
    twin_name: string | null;
    twin_status: string | null;
    twin_version: number | null;
    memory_count: number;
  };
  same_market: {
    stimulus: typeof sameMarketStimulus;
    trader_a: {
      name: string;
      hints: string[];
      response: TwinResponse | null;
    };
    trader_b: {
      name: string;
      hints: string[];
      response: TwinResponse | null;
    };
  } | null;
  interview: {
    scenarios: InterviewScenario[];
    answers: InterviewAnswer[];
    current_index: number;
    complete: boolean;
  };
  loop: {
    scenarios: typeof demoLoopScenarios;
    active_scenario_id: string | null;
    market_context: DemoContext["marketContext"];
    twin_response: TwinResponse | null;
    user_choice: DecisionPattern | null;
    difference: ReturnType<typeof computeDifference> | null;
  };
  user_twin: TradingTwinProfile | null;
  last_memory: DecisionMemory | null;
  memories: DecisionMemory[];
  evolution: {
    before: DecisionMemory["twin_snapshot_before"] | null;
    after: DecisionMemory["twin_snapshot_after"] | null;
  };
  closing_lines: string[];
  ui_labels: {
    pattern_display: Record<string, string>;
  };
}

interface SessionRecord {
  id: string;
  dbPath: string;
  db: AppDatabase;
  ctx: DemoContext;
  interviewAnswers: InterviewAnswer[];
  interviewIndex: number;
  interviewComplete: boolean;
  pendingLoopScenarioId: string;
}

const PATTERN_DISPLAY: Record<string, string> = {
  chase_entry: "consider exposure",
  enter_small: "enter carefully",
  hold: "hold / observe",
  observe_wait: "wait / observe",
  trim: "increase caution",
  reduce_risk: "reduce risk",
  exit_bias: "increase caution",
};

const globalStore = globalThis as unknown as {
  __smartvibeSessions?: Map<string, SessionRecord>;
};

function sessions(): Map<string, SessionRecord> {
  if (!globalStore.__smartvibeSessions) {
    globalStore.__smartvibeSessions = new Map();
  }
  return globalStore.__smartvibeSessions;
}

function dbFileFor(sessionId: string): string {
  return path.resolve(process.cwd(), "data", `web-session-${sessionId}.db`);
}

/** Alias required by product language — wraps modelTwinResponse */
export function simulateTwinResponse(
  twin: TradingTwinProfile,
  market: Parameters<typeof modelTwinResponse>[1],
  account?: Parameters<typeof modelTwinResponse>[2],
): TwinResponse {
  return modelTwinResponse(twin, market, account);
}

export function createWebSession(opts?: {
  loopScenarioId?: string;
}): SessionPublicView {
  const id = randomUUID();
  const dbPath = dbFileFor(id);
  const db = openDb(dbPath);
  migrate(db);
  createTwin(db, structuredClone(twinAFixture));
  createTwin(db, structuredClone(twinBFixture));

  let ctx = createDemoContext();
  ctx = advance(ctx, "STATE_SAME_MARKET_COMPARE");

  const twinA = getTwin(db, TWIN_A_ID)!;
  const twinB = getTwin(db, TWIN_B_ID)!;
  const responseA = simulateTwinResponse(twinA, sameMarketStimulus);
  const responseB = simulateTwinResponse(twinB, sameMarketStimulus);
  ctx = {
    ...ctx,
    twinA,
    twinB,
    twinAResponse: responseA,
    twinBResponse: responseB,
    history: ["STATE_SAME_MARKET_COMPARE"],
  };

  const record: SessionRecord = {
    id,
    dbPath,
    db,
    ctx,
    interviewAnswers: [],
    interviewIndex: 0,
    interviewComplete: false,
    pendingLoopScenarioId: opts?.loopScenarioId ?? "rapid_pump",
  };
  sessions().set(id, record);
  return toView(record);
}

export function getWebSession(sessionId: string): SessionPublicView | null {
  const record = sessions().get(sessionId);
  return record ? toView(record) : null;
}

export type WebAction =
  | { type: "continue_from_same_market" }
  | { type: "submit_interview_option"; option_id: string }
  | { type: "select_loop_scenario"; scenario_id: string }
  | { type: "continue_to_twin_response" }
  | { type: "submit_user_choice"; choice: DecisionPattern }
  | { type: "continue_after_reflection" };

export function applyWebAction(
  sessionId: string,
  action: WebAction,
): SessionPublicView {
  const record = sessions().get(sessionId);
  if (!record) throw new Error("Session not found. Start a new demo.");

  switch (action.type) {
    case "continue_from_same_market":
      beginInterview(record);
      break;
    case "submit_interview_option":
      submitInterview(record, action.option_id);
      break;
    case "select_loop_scenario":
      selectScenario(record, action.scenario_id);
      break;
    case "continue_to_twin_response":
      runTwinResponse(record);
      break;
    case "submit_user_choice":
      submitChoice(record, action.choice);
      break;
    case "continue_after_reflection":
      persistEvolveAndEvidence(record);
      break;
    default:
      throw new Error("Unknown action");
  }

  return toView(record);
}

function beginInterview(record: SessionRecord): void {
  if (record.ctx.state !== "STATE_SAME_MARKET_COMPARE") {
    throw new Error("Invalid state for continue_from_same_market");
  }
  record.ctx = advance(record.ctx, "STATE_INITIALIZE_TWIN");
  record.interviewAnswers = [];
  record.interviewIndex = 0;
  record.interviewComplete = false;
}

function submitInterview(record: SessionRecord, optionId: string): void {
  if (record.ctx.state !== "STATE_INITIALIZE_TWIN") {
    throw new Error("Invalid state for interview answer");
  }
  const set = getInterviewSet(CORE_THREE_SCENARIO_IDS);
  const scenario = set[record.interviewIndex];
  if (!scenario) throw new Error("Interview already complete");

  const option = resolveOption(scenario, optionId);
  if (!option) throw new Error(`Invalid option: ${optionId}`);

  record.interviewAnswers.push({
    scenario_id: scenario.scenario_id,
    option_id: option.option_id,
  });
  record.interviewIndex += 1;

  if (record.interviewIndex >= set.length) {
    const twin = createTwinFromInterviewAnswers({
      display_name: "Momentum Explorer",
      scenarios: set,
      answers: record.interviewAnswers,
      account: {
        exposure: "medium",
        concentration: "medium",
        btc_allocation_pct: 30,
        position_summary: "Demo portfolio — medium BTC allocation",
        horizon_hint: "swing",
        captured_at: new Date().toISOString(),
      },
    });
    createTwin(record.db, twin);
    record.ctx = {
      ...record.ctx,
      userTwin: twin,
      interviewChoices: record.interviewAnswers.map((a) => {
        const s = set.find((x) => x.scenario_id === a.scenario_id)!;
        return resolveOption(s, a.option_id)!.decision_pattern;
      }),
    };
    record.interviewComplete = true;
    // Move to market context with default scenario
    selectScenario(record, record.pendingLoopScenarioId);
  }
}

function selectScenario(record: SessionRecord, scenarioId: string): void {
  const scenario =
    demoLoopScenarios.find((s) => s.scenario_id === scenarioId) ??
    demoLoopScenarios[0];
  record.pendingLoopScenarioId = scenario.scenario_id;

  if (
    record.ctx.state === "STATE_INITIALIZE_TWIN" ||
    record.ctx.state === "STATE_MARKET_CONTEXT"
  ) {
    if (record.ctx.state === "STATE_INITIALIZE_TWIN") {
      record.ctx = advance(record.ctx, "STATE_MARKET_CONTEXT");
    }
    record.ctx = {
      ...record.ctx,
      activeScenario: scenario,
      marketContext: scenario.market_context,
      twinResponse: null,
      userChoice: null,
      lastMemory: null,
    };
  } else {
    throw new Error("Invalid state for select_loop_scenario");
  }
}

function runTwinResponse(record: SessionRecord): void {
  if (record.ctx.state !== "STATE_MARKET_CONTEXT") {
    throw new Error("Invalid state for twin response");
  }
  if (!record.ctx.userTwin || !record.ctx.marketContext) {
    throw new Error("Twin/market missing");
  }
  const response = simulateTwinResponse(
    record.ctx.userTwin,
    record.ctx.marketContext,
  );
  record.ctx = advance(record.ctx, "STATE_TWIN_RESPONSE");
  record.ctx = {
    ...record.ctx,
    twinResponse: response,
  };
  record.ctx = advance(record.ctx, "STATE_USER_CHOICE");
}

function submitChoice(record: SessionRecord, choice: DecisionPattern): void {
  if (record.ctx.state !== "STATE_USER_CHOICE") {
    throw new Error("Invalid state for user choice");
  }
  if (!record.ctx.twinResponse) throw new Error("Missing twin response");

  record.ctx = {
    ...record.ctx,
    userChoice: choice,
  };
  record.ctx = advance(record.ctx, "STATE_REFLECTION");
}

function persistEvolveAndEvidence(record: SessionRecord): void {
  if (record.ctx.state !== "STATE_REFLECTION") {
    throw new Error("Invalid state for persist");
  }
  const { userTwin, marketContext, twinResponse, userChoice, activeScenario } =
    record.ctx;
  if (!userTwin || !marketContext || !twinResponse || !userChoice || !activeScenario) {
    throw new Error("Incomplete context");
  }

  record.ctx = advance(record.ctx, "STATE_MEMORY_WRITE");
  const { profile, memory } = applyDecisionLoop(
    record.db,
    userTwin,
    {
      scenario_id: activeScenario.scenario_id,
      market_context: marketContext,
      account_context: userTwin.account_context_latest,
      twin_response: twinResponse,
      user_reality: {
        actual_choice: userChoice,
        source: "demo",
      },
    },
    { demo_tag: "phase3_web_demo" },
  );

  let nextTwin = profile;
  if (nextTwin.status === "cold_start") {
    nextTwin = { ...nextTwin, status: "active" };
    updateTwin(record.db, nextTwin);
  }

  record.ctx = advance(record.ctx, "STATE_TWIN_UPDATE");
  record.ctx = {
    ...record.ctx,
    userTwin: nextTwin,
    lastMemory: memory,
  };
  record.ctx = advance(record.ctx, "STATE_EVOLUTION_EVIDENCE");
  record.ctx = advance(record.ctx, "STATE_DEMO_END");
}

function toView(record: SessionRecord): SessionPublicView {
  const { ctx } = record;
  const twin = ctx.userTwin
    ? getTwin(record.db, ctx.userTwin.id) ?? ctx.userTwin
    : null;
  const memories = twin ? listMemoriesForTwin(record.db, twin.id) : [];
  const interviewSet = getInterviewSet(CORE_THREE_SCENARIO_IDS);

  const difference =
    ctx.twinResponse && ctx.userChoice
      ? computeDifference(ctx.twinResponse.decision_pattern, ctx.userChoice)
      : null;

  return {
    session_id: record.id,
    demo_mode: "fixtures",
    state: ctx.state,
    history: ctx.history,
    dashboard: {
      product_name: "SmartVibe AI Trading Doppelgänger",
      tagline: "Your AI twin learns how you respond to the market.",
      twin_name: twin?.display_name ?? null,
      twin_status: twin
        ? twin.status === "cold_start"
          ? "Cold Start"
          : twin.memory_count > 0
            ? "Learning"
            : "Ready"
        : null,
      twin_version: twin?.version ?? null,
      memory_count: twin?.memory_count ?? 0,
    },
    same_market: {
      stimulus: sameMarketStimulus,
      trader_a: {
        name: ctx.twinA?.display_name ?? "Trader A",
        hints: ["High exposure", "Short-term", "Low drawdown tolerance"],
        response: ctx.twinAResponse,
      },
      trader_b: {
        name: ctx.twinB?.display_name ?? "Trader B",
        hints: ["Low exposure", "Long-term holder"],
        response: ctx.twinBResponse,
      },
    },
    interview: {
      scenarios: interviewSet,
      answers: record.interviewAnswers,
      current_index: record.interviewIndex,
      complete: record.interviewComplete,
    },
    loop: {
      scenarios: demoLoopScenarios,
      active_scenario_id: ctx.activeScenario?.scenario_id ?? null,
      market_context: ctx.marketContext,
      twin_response: ctx.twinResponse,
      user_choice: ctx.userChoice,
      difference,
    },
    user_twin: twin,
    last_memory: ctx.lastMemory,
    memories,
    evolution: {
      before: ctx.lastMemory?.twin_snapshot_before ?? null,
      after: ctx.lastMemory?.twin_snapshot_after ?? null,
    },
    closing_lines: [
      "SmartVibe creates a personal decision twin that learns how you respond to the market.",
      "Your AI twin does not predict the market.",
      "It learns how you respond to the market.",
    ],
    ui_labels: { pattern_display: PATTERN_DISPLAY },
  };
}

export function listDemoFlow(): DemoState[] {
  return [...DEMO_FLOW];
}

export function peekNextState(state: DemoState): DemoState | null {
  return nextState(state);
}
