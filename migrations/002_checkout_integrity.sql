ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE suborders ADD COLUMN IF NOT EXISTS shipping_refunded integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS orders_expiry ON orders(status,expires_at);
CREATE INDEX IF NOT EXISTS physical_campaign_state ON physical_cards(campaign_id,state);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS suborder_id text REFERENCES suborders(id);
