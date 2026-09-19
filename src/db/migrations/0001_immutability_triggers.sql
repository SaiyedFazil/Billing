-- Spec §6.10 — Principle 3: the database itself refuses to rewrite history.
--
-- Hand-written because drizzle-kit does not generate triggers. Keep this file
-- and its _journal.json entry in sync; regenerating migrations will not touch
-- it, but it must always run after 0000.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bill_item_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bill_items are immutable: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS bill_items_immutable ON bill_items;

--> statement-breakpoint
CREATE TRIGGER bill_items_immutable
  BEFORE UPDATE OR DELETE ON bill_items
  FOR EACH ROW EXECUTE FUNCTION prevent_bill_item_mutation();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bill_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bills cannot be deleted; void them instead'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS bills_no_delete ON bills;

--> statement-breakpoint
CREATE TRIGGER bills_no_delete
  BEFORE DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION prevent_bill_delete();

--> statement-breakpoint
-- Only the void columns may change. Everything else is frozen at insert.
CREATE OR REPLACE FUNCTION restrict_bill_update() RETURNS trigger AS $$
BEGIN
  IF (NEW.id, NEW.bill_number, NEW.business_date, NEW.subtotal,
      NEW.discount, NEW.total, NEW.payment_method,
      NEW.tendered, NEW.change_due, NEW.idempotency_key,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.bill_number, OLD.business_date, OLD.subtotal,
      OLD.discount, OLD.total, OLD.payment_method,
      OLD.tendered, OLD.change_due, OLD.idempotency_key,
      OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'only status, voided_at, voided_by and void_reason may be updated on bills'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS bills_restrict_update ON bills;

--> statement-breakpoint
CREATE TRIGGER bills_restrict_update
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION restrict_bill_update();
