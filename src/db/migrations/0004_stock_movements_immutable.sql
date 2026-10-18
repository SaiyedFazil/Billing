-- Stock spec §6.2 — stock history is append-only, like bill_items.
--
-- Hand-written because drizzle-kit does not generate triggers. Keep this file
-- and its _journal.json entry in sync; it must always run after 0003, which
-- creates the table.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_stock_movement_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements are immutable: % is not permitted; record a CORRECTION instead', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS stock_movements_immutable ON stock_movements;

--> statement-breakpoint
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_stock_movement_mutation();
