import { query } from "../src/lib/db";
import { checkout } from "../src/domains/orders/service";
import type { User } from "../src/domains/users/auth";
const who = process.argv[2];
const [user] = await query<User>("SELECT * FROM users WHERE id=$1", [who]);
try {
  await checkout(
    user,
    [{ listingId: "pg-race", quantity: 1 }],
    crypto.randomUUID(),
    "race-" + who,
    "pix",
  );
  console.log("RESERVED");
} catch (e) {
  if ((e as Error).message.includes("Estoque insuficiente"))
    console.log("SOLD_OUT");
  else throw e;
}
process.exit(0);
