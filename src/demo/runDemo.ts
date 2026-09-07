import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resetDb, DEFAULT_DB_PATH } from "../db/client.js";
import { createTwin } from "../db/twinsRepo.js";
import { twinAFixture, twinBFixture } from "../fixtures/demoData.js";
import { runDemo, type DemoIO } from "./stateMachine.js";
import type { DecisionPattern } from "../domain/types.js";

function parseArgs(argv: string[]) {
  const auto = argv.includes("--auto");
  const scenarioIdx = argv.findIndex((a) => a === "--scenario");
  const scenario =
    scenarioIdx >= 0 ? argv[scenarioIdx + 1] : "rapid_pump";
  return { auto, scenario };
}

function createAutoIO(): DemoIO {
  return {
    print: (text) => console.log(text),
    choose: async () => 1,
  };
}

function createInteractiveIO(rl: readline.Interface): DemoIO {
  return {
    print: (text) => console.log(text),
    choose: async (prompt, optionCount) => {
      while (true) {
        const answer = await rl.question(`${prompt} [1-${optionCount}]: `);
        const n = Number.parseInt(answer.trim(), 10);
        if (Number.isFinite(n) && n >= 1 && n <= optionCount) return n;
        console.log(`Please enter a number between 1 and ${optionCount}.`);
      }
    },
  };
}

async function main() {
  const { auto, scenario } = parseArgs(process.argv.slice(2));
  const db = resetDb(DEFAULT_DB_PATH);
  createTwin(db, twinAFixture);
  createTwin(db, twinBFixture);

  const presetInterviewChoices: DecisionPattern[] | undefined = auto
    ? [
        "observe_wait",
        "hold",
        "observe_wait",
        "observe_wait",
        "observe_wait",
      ]
    : undefined;
  // Deliberately mismatch FOMO twin lean to show evolution evidence in auto demo
  const presetLoopChoice: DecisionPattern | undefined = auto
    ? "observe_wait"
    : undefined;

  let rl: readline.Interface | null = null;
  const io = auto
    ? createAutoIO()
    : createInteractiveIO((rl = readline.createInterface({ input, output })));

  console.log(
    auto
      ? "\nSmartVibe Demo — AUTO mode (fixtures)\n"
      : "\nSmartVibe Demo — INTERACTIVE mode\n",
  );

  const ctx = await runDemo({
    db,
    io,
    loopScenarioId: scenario,
    presetInterviewChoices,
    presetLoopChoice,
  });

  console.log(
    `\nDemo finished. States visited: ${ctx.history.join(" → ")}\n`,
  );

  rl?.close();
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
