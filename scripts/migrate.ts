import { database } from "../src/lib/db";
await database();
console.log("Migração PostgreSQL concluída.");
process.exit(0);
