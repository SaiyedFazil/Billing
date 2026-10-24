-- Split payment spec §6.3–6.4 — payment lines are immutable, and every bill's
-- lines must add up to it. Then one line for every bill that predates them.
--
-- Hand-written because drizzle-kit does not generate triggers or data. Keep
-- this file and its _journal.json entry in sync; it must always run after
-- 0008, which adds SPLIT and creates the table.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_bill_payment_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bill_payments are immutable: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
-- The rules a CHECK cannot express, because they span a bill and its lines:
--   1. the lines' amounts add up to bills.total;
--   2. a SPLIT bill has at least two lines, each more than ₹0;
--   3. any other bill has exactly one line, with the bill's method, cash
--      given and change.
CREATE OR REPLACE FUNCTION assert_bill_payments_balance(p_bill_id uuid) RETURNS void AS $$
DECLARE
  v_bill record;
  v_line record;
  v_count integer;
  v_sum numeric;
BEGIN
  SELECT payment_method, total, tendered, change_due INTO v_bill
  FROM bills WHERE id = p_bill_id;
  -- The bill is gone (only a test teardown can do that): nothing to check.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*), coalesce(sum(amount), 0) INTO v_count, v_sum
  FROM bill_payments WHERE bill_id = p_bill_id;

  IF v_sum <> v_bill.total THEN
    RAISE EXCEPTION 'bill_payments_balance: the payments of bill % add up to %, not its total %',
      p_bill_id, v_sum, v_bill.total
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_bill.payment_method = 'SPLIT' THEN
    IF v_count < 2 THEN
      RAISE EXCEPTION 'bill_payments_balance: split bill % has % payment line(s), not at least two',
        p_bill_id, v_count
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM bill_payments WHERE bill_id = p_bill_id AND amount <= 0
    ) THEN
      RAISE EXCEPTION 'bill_payments_balance: split bill % has a payment of 0.00',
        p_bill_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'bill_payments_balance: bill % has % payment lines, not exactly one',
        p_bill_id, v_count
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT method, tendered, change_due INTO v_line
    FROM bill_payments WHERE bill_id = p_bill_id;
    IF v_line.method IS DISTINCT FROM v_bill.payment_method
       OR v_line.tendered IS DISTINCT FROM v_bill.tendered
       OR v_line.change_due IS DISTINCT FROM v_bill.change_due
    THEN
      RAISE EXCEPTION 'bill_payments_balance: the payment line of bill % does not match its method, cash given and change',
        p_bill_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_bill_payments_on_bill() RETURNS trigger AS $$
BEGIN
  PERFORM assert_bill_payments_balance(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION check_bill_payments_on_line() RETURNS trigger AS $$
BEGIN
  PERFORM assert_bill_payments_balance(NEW.bill_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
-- One block, so it is all-or-nothing: no bill can be saved between the
-- backfill and the triggers, and a bill that does not fit (say, a UPI bill
-- carrying cash given) fails the whole migration rather than being skipped.
--
-- The balance triggers are DEFERRABLE INITIALLY DEFERRED, so they run at
-- COMMIT, after the bill and all its lines are in. They fire on INSERT only:
-- voiding a bill, or a teardown deleting one, never trips them.
DO $migrate$
BEGIN
  INSERT INTO bill_payments (bill_id, method, amount, tendered, change_due, position, created_at)
  SELECT id, payment_method, total, tendered, change_due, 1, created_at
  FROM bills b
  WHERE NOT EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id = b.id);

  DROP TRIGGER IF EXISTS bill_payments_immutable ON bill_payments;
  CREATE TRIGGER bill_payments_immutable
    BEFORE UPDATE OR DELETE ON bill_payments
    FOR EACH ROW EXECUTE FUNCTION prevent_bill_payment_mutation();

  DROP TRIGGER IF EXISTS bills_payments_balance ON bills;
  CREATE CONSTRAINT TRIGGER bills_payments_balance
    AFTER INSERT ON bills
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_bill_payments_on_bill();

  DROP TRIGGER IF EXISTS bill_payments_balance ON bill_payments;
  CREATE CONSTRAINT TRIGGER bill_payments_balance
    AFTER INSERT ON bill_payments
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_bill_payments_on_line();
END
$migrate$;
