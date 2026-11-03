import { query } from "../../lib/db";
// Never compare offers across editions, condition or certification.
export async function comparableOffers(
  editionId: string,
  condition: string,
  grading: string | null,
) {
  return query(
    "SELECT l.id,l.price,l.stock,l.seller_id,u.name seller_name FROM listings l JOIN users u ON u.id=l.seller_id WHERE edition_id=$1 AND condition=$2 AND grading IS NOT DISTINCT FROM $3 AND status='active' AND NOT u.suspended ORDER BY price",
    [editionId, condition, grading],
  );
}
