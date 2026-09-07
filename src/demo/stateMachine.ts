import type { AppDatabase } from "../db/client.js";
import { createTwin, getTwin, updateTwin } from "../db/twinsRepo.js";
import { listMemoriesForTwin } from "../db/memoriesRepo.js";
import { modelTwinResponse } from "../domain/modelResponse.js";
import { computeDifference } from "../domain/evolve.js";
import type { DecisionPattern } from "../domain/types.js";
import { applyDecisionLoop } from "../services/decisionLoop.js";
import {
  sameMarketStimulus,
  twinAFixture,
  twinBFixture,
  TWIN_A_ID,
  TWIN_B_ID,
} from "../fixtures/demoData.js";
import { createTwinFromInterviewAnswers } from "./createTwinFromInterview.js";
import {
  formatClosing,
  formatDecisionMemory,
  formatEvolutionEvidence,
  formatOptions,
  formatReflection,
  formatSameMarketDifferentMinds,
  formatTwinResponse,
  formatTwinSnapshot,
  section,
} from "./display.js";
import {
  demoLoopScenarios,
  tradingInterviewTurns,
  type DemoMarketScenario,
} from "./interview.js";
import {
  MVP_INTERVIEW_SCENARIO_IDS,
  getInterviewSet,
  resolveOption,
} from "../interview/scenarioLibrary.js";
import type { InterviewAnswer } from "../interview/types.js";
import {
  advance,
  createDemoContext,
  nextState,
  type DemoContext,
  type DemoState,
} from "./states.js";

export interface DemoIO {
  print: (text: string) => void;
  /** Return 1-based option index, or pattern id string */
  choose: (prompt: string, optionCount: number) => Promise<number>;
}

export interface RunDemoOptions {
  db: AppDatabase;
  io: DemoIO;
  /** Which loop scenario after interview */
  loopScenarioId?: string;
  /** Preset interview choices (auto mode) */
  presetInterviewChoices?: DecisionPattern[];
  /** Preset user choice for the live loop (auto mode) */
  presetLoopChoice?: DecisionPattern;
}

export async function runDemo(opts: RunDemoOptions): Promise<DemoContext> {
  let ctx = createDemoContext();
  const { db, io } = opts;

  // Ensure A/B fixtures exist
  if (!getTwin(db, TWIN_A_ID)) createTwin(db, twinAFixture);
  if (!getTwin(db, TWIN_B_ID)) createTwin(db, twinBFixture);

  while (ctx.state !== "STATE_DEMO_END") {
    const upcoming = nextState(ctx.state);
    if (!upcoming) break;
    ctx = advance(ctx, upcoming);
    ctx = await executeState(ctx, opts);
  }

  io.print(formatClosing());
  return ctx;
}

async function executeState(
  ctx: DemoContext,
  opts: RunDemoOptions,
): Promise<DemoContext> {
  switch (ctx.state) {
    case "STATE_SAME_MARKET_COMPARE":
      return stateSameMarket(ctx, opts);
    case "STATE_INITIALIZE_TWIN":
      return stateInitializeTwin(ctx, opts);
    case "STATE_MARKET_CONTEXT":
      return stateMarketContext(ctx, opts);
    case "STATE_TWIN_RESPONSE":
      return stateTwinResponse(ctx, opts);
    case "STATE_USER_CHOICE":
      return stateUserChoice(ctx, opts);
    case "STATE_REFLECTION":
      return stateReflection(ctx, opts);
    case "STATE_MEMORY_WRITE":
    case "STATE_TWIN_UPDATE":
      return statePersistAndEvolve(ctx, opts);
    case "STATE_EVOLUTION_EVIDENCE":
      return stateEvolutionEvidence(ctx, opts);
    default:
      return ctx;
  }
}

function stateSameMarket(ctx: DemoContext, opts: RunDemoOptions): DemoContext {
  const twinA = getTwin(opts.db, TWIN_A_ID)!;
  const twinB = getTwin(opts.db, TWIN_B_ID)!;
  const responseA = modelTwinResponse(twinA, sameMarketStimulus);
  const responseB = modelTwinResponse(twinB, sameMarketStimulus);

  const text = formatSameMarketDifferentMinds({
    marketSummary: sameMarketStimulus.summary,
    traderA: {
      name: twinA.display_name,
      profileHints: [
        "High exposure",
        "Short-term",
        "Low drawdown tolerance",
      ],
      response: responseA,
    },
    traderB: {
      name: twinB.display_name,
      profileHints: ["Low exposure", "Long-term holder"],
      response: responseB,
    },
  });
  opts.io.print(text);

  return {
    ...ctx,
    twinA,
    twinB,
    twinAResponse: responseA,
    twinBResponse: responseB,
    logs: [...ctx.logs, text],
  };
}

async function stateInitializeTwin(
  ctx: DemoContext,
  opts: RunDemoOptions,
): Promise<DemoContext> {
  opts.io.print(
    section("Initialize Your Trading Twin") +
      "\nThis is a Trading Interview (cold start), not a personality test.\n" +
      "Your twin will keep evolving from Decision Memory after this.\n",
  );

  const choices: DecisionPattern[] = [];
  const answers: InterviewAnswer[] = [];
  const interviewSet = getInterviewSet(MVP_INTERVIEW_SCENARIO_IDS);

  for (let i = 0; i < interviewSet.length; i++) {
    const scenario = interviewSet[i];
    const turn = tradingInterviewTurns[i];
    opts.io.print(
      `\n${turn.title}  [${scenario.category}]\n${turn.prompt}\n${formatOptions(turn.options)}\n`,
    );

    let choice: DecisionPattern;
    if (opts.presetInterviewChoices?.[i]) {
      choice = opts.presetInterviewChoices[i];
      opts.io.print(`(auto) Selected: ${choice}\n`);
    } else {
      const idx = await opts.io.choose("Select option", turn.options.length);
      choice = turn.options[idx - 1]?.id ?? turn.options[0].id;
    }
    const option = resolveOption(scenario, choice);
    if (!option) {
      throw new Error(`Invalid interview choice ${choice} for ${scenario.scenario_id}`);
    }
    choices.push(choice);
    answers.push({
      scenario_id: scenario.scenario_id,
      option_id: option.option_id,
    });
  }

  const userTwin = createTwinFromInterviewAnswers({
    display_name: "Your Trading Twin",
    scenarios: interviewSet,
    answers,
    account: {
      exposure: "medium",
      concentration: "medium",
      btc_allocation_pct: 30,
      position_summary: "Demo portfolio — medium BTC allocation",
      horizon_hint: "swing",
      captured_at: new Date().toISOString(),
    },
  });
  createTwin(opts.db, userTwin);

  const snap = formatTwinSnapshot(userTwin);
  opts.io.print(snap);
  opts.io.print(
    "\nCold start complete. Twin v0 is a starting point — Decision Memory is the long-term asset.\n",
  );

  return {
    ...ctx,
    userTwin,
    interviewTurns: tradingInterviewTurns,
    interviewChoices: choices,
    logs: [...ctx.logs, snap],
  };
}

function stateMarketContext(
  ctx: DemoContext,
  opts: RunDemoOptions,
): DemoContext {
  const scenario =
    demoLoopScenarios.find((s) => s.scenario_id === opts.loopScenarioId) ??
    demoLoopScenarios[0];

  const text = [
    section(`Market Context — ${scenario.title}`),
    scenario.market_context.summary,
    `Symbol: ${scenario.market_context.symbol}`,
    `Δprice: ${scenario.market_context.metrics.price_change_pct}%`,
    `Volume Δ: ${scenario.market_context.metrics.volume_change_pct}%`,
    `OI Δ: ${scenario.market_context.metrics.open_interest_change_pct}%`,
    `Funding: ${scenario.market_context.metrics.funding_rate} (elevated=${scenario.market_context.metrics.funding_elevated})`,
    `Volatility: ${scenario.market_context.metrics.volatility_regime}`,
    "",
    "Stimulus source: demo fixture (no live exchange in Phase 2).",
  ].join("\n");
  opts.io.print(text);

  return {
    ...ctx,
    activeScenario: scenario,
    marketContext: scenario.market_context,
    logs: [...ctx.logs, text],
  };
}

function stateTwinResponse(
  ctx: DemoContext,
  opts: RunDemoOptions,
): DemoContext {
  if (!ctx.userTwin || !ctx.marketContext) {
    throw new Error("Twin/market missing before STATE_TWIN_RESPONSE");
  }
  const response = modelTwinResponse(ctx.userTwin, ctx.marketContext);
  const text = formatTwinResponse(response);
  opts.io.print(text);
  return {
    ...ctx,
    twinResponse: response,
    logs: [...ctx.logs, text],
  };
}

async function stateUserChoice(
  ctx: DemoContext,
  opts: RunDemoOptions,
): Promise<DemoContext> {
  const scenario = ctx.activeScenario as DemoMarketScenario;
  opts.io.print(
    section("Your Real Choice") +
      "\nWhat would you actually lean toward?\n" +
      formatOptions(scenario.options) +
      "\n",
  );

  let choice: DecisionPattern;
  if (opts.presetLoopChoice) {
    choice = opts.presetLoopChoice;
    opts.io.print(`(auto) Selected: ${choice}\n`);
  } else {
    const idx = await opts.io.choose("Select option", scenario.options.length);
    choice = scenario.options[idx - 1]?.id ?? scenario.options[0].id;
  }

  return { ...ctx, userChoice: choice };
}

function stateReflection(ctx: DemoContext, opts: RunDemoOptions): DemoContext {
  if (!ctx.twinResponse || !ctx.userChoice) {
    throw new Error("Missing response/choice for reflection");
  }
  const diff = computeDifference(
    ctx.twinResponse.decision_pattern,
    ctx.userChoice,
  );
  const text = formatReflection({
    modeled: ctx.twinResponse.decision_pattern,
    actual: ctx.userChoice,
    aligned: diff.aligned,
    gapType: diff.gap_type,
    summary: diff.summary,
  });
  opts.io.print(text);
  return { ...ctx, logs: [...ctx.logs, text] };
}

function statePersistAndEvolve(
  ctx: DemoContext,
  opts: RunDemoOptions,
): DemoContext {
  // MEMORY_WRITE and TWIN_UPDATE share one atomic apply; skip duplicate work.
  if (ctx.state === "STATE_TWIN_UPDATE" && ctx.lastMemory && ctx.userTwin) {
    opts.io.print(
      section("Twin Update") +
        `\nPersisted Decision Memory and updated twin → v${ctx.userTwin.version}.\n`,
    );
    return ctx;
  }
  if (
    !ctx.userTwin ||
    !ctx.marketContext ||
    !ctx.twinResponse ||
    !ctx.userChoice ||
    !ctx.activeScenario
  ) {
    throw new Error("Incomplete context for memory/evolve");
  }

  const { profile, memory } = applyDecisionLoop(
    opts.db,
    ctx.userTwin,
    {
      scenario_id: ctx.activeScenario.scenario_id,
      market_context: ctx.marketContext,
      account_context: ctx.userTwin.account_context_latest,
      twin_response: ctx.twinResponse,
      user_reality: {
        actual_choice: ctx.userChoice,
        source: "demo",
      },
    },
    { demo_tag: "phase2_live_loop" },
  );

  const memText = formatDecisionMemory(memory);
  opts.io.print(memText);

  return {
    ...ctx,
    userTwin: profile,
    lastMemory: memory,
    logs: [...ctx.logs, memText],
  };
}

function stateEvolutionEvidence(
  ctx: DemoContext,
  opts: RunDemoOptions,
): DemoContext {
  if (!ctx.lastMemory || !ctx.userTwin) {
    throw new Error("Missing memory for evolution evidence");
  }
  const text = formatEvolutionEvidence({
    before: ctx.lastMemory.twin_snapshot_before,
    after: ctx.lastMemory.twin_snapshot_after,
  });
  opts.io.print(text);

  const snap = formatTwinSnapshot(ctx.userTwin);
  opts.io.print(snap);

  const history = listMemoriesForTwin(opts.db, ctx.userTwin.id);
  opts.io.print(
    section("Decision Memory Timeline") +
      `\n${history.length} memor${history.length === 1 ? "y" : "ies"} stored for this twin.\n` +
      history
        .map(
          (m, i) =>
            `  #${i + 1} ${m.scenario_id} · twin=${m.twin_response.decision_pattern} · you=${m.user_reality.actual_choice} · aligned=${m.learning.difference.aligned}`,
        )
        .join("\n"),
  );

  // Keep twin status active after first real loop
  if (ctx.userTwin.status === "cold_start") {
    const activated = { ...ctx.userTwin, status: "active" as const };
    updateTwin(opts.db, activated);
    return {
      ...ctx,
      userTwin: activated,
      logs: [...ctx.logs, text, snap],
    };
  }

  return { ...ctx, logs: [...ctx.logs, text, snap] };
}

/** Exported for unit tests: advance through states without I/O side effects beyond provided io */
export type { DemoState };
