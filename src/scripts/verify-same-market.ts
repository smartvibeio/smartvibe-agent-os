import { openDb, DEFAULT_DB_PATH } from "../db/client.js";
import { getTwin } from "../db/twinsRepo.js";
import { modelTwinResponse } from "../domain/modelResponse.js";
import {
  sameMarketStimulus,
  TWIN_A_ID,
  TWIN_B_ID,
} from "../fixtures/demoData.js";

const db = openDb(DEFAULT_DB_PATH);
const twinA = getTwin(db, TWIN_A_ID);
const twinB = getTwin(db, TWIN_B_ID);

if (!twinA || !twinB) {
  console.error("Twins missing. Run npm run db:seed first.");
  process.exit(1);
}

const responseA = modelTwinResponse(twinA, sameMarketStimulus);
const responseB = modelTwinResponse(twinB, sameMarketStimulus);

console.log("=== Same Market, Different Minds ===");
console.log(sameMarketStimulus.summary);
console.log("");
console.log(`Trader A → ${responseA.decision_pattern}`);
console.log(`  ${responseA.reasoning}`);
console.log("");
console.log(`Trader B → ${responseB.decision_pattern}`);
console.log(`  ${responseB.reasoning}`);
console.log("");
console.log("Same market. Different minds.");

if (responseA.decision_pattern === responseB.decision_pattern) {
  console.error("FAIL: expected different decision patterns");
  process.exit(1);
}

console.log("PASS: twins produced different decision patterns");
db.close();
