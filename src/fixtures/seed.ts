import { resetDb, DEFAULT_DB_PATH } from "../db/client.js";
import { createTwin, listTwins } from "../db/twinsRepo.js";
import { twinAFixture, twinBFixture } from "./demoData.js";

const db = resetDb(DEFAULT_DB_PATH);
createTwin(db, twinAFixture);
createTwin(db, twinBFixture);

const twins = listTwins(db);
console.log(`Seeded ${twins.length} twins into ${DEFAULT_DB_PATH}`);
for (const t of twins) {
  console.log(
    `- ${t.display_name} v${t.version} | momentum=${t.decision_tendencies.momentum_preference} patience=${t.decision_tendencies.patience} exposure=${t.account_context_latest?.btc_allocation_pct}%`,
  );
}
db.close();
