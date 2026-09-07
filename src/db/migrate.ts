import { openDb, migrate, DEFAULT_DB_PATH } from "./client.js";

const db = openDb(DEFAULT_DB_PATH);
migrate(db);
console.log(`Migrated schema at ${DEFAULT_DB_PATH}`);
db.close();
