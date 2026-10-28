-- Bill numbers become ONE running sequence for the life of the shop: never
-- reset at midnight, never repeated. Until now each business day counted from
-- #1 again, so the same number appeared on every day's first bill.
--
-- Three things change together:
--   1. Every existing bill is renumbered once, oldest first (business date,
--      then the number it had that day, which is its issue order).
--   2. bill_counters, one row per date, becomes a single row holding the last
--      number issued.
--   3. The unique rule moves from (business_date, bill_number) to bill_number.
--
-- One block, so it is all-or-nothing (scripts/migrate.ts runs each statement
-- on its own): a failure leaves the database exactly as it was.
DO $migrate$
DECLARE
  v_bills integer;
  v_max integer;
BEGIN
  -- First: the old rule would trip over renumbering, which moves numbers
  -- between days.
  DROP INDEX IF EXISTS bills_date_number_idx;

  -- bill_number is frozen by the bills_restrict_update trigger. Lift it for
  -- this one statement and put it straight back.
  ALTER TABLE bills DISABLE TRIGGER bills_restrict_update;

  UPDATE bills b
  SET bill_number = r.n
  FROM (
    SELECT id, row_number() OVER (ORDER BY business_date, bill_number)::integer AS n
    FROM bills
  ) r
  WHERE b.id = r.id AND b.bill_number IS DISTINCT FROM r.n;

  ALTER TABLE bills ENABLE TRIGGER bills_restrict_update;

  DROP TABLE bill_counters;
  CREATE TABLE bill_counters (
    id integer PRIMARY KEY DEFAULT 1,
    last_number integer NOT NULL DEFAULT 0,
    CONSTRAINT bill_counters_single_row CHECK (id = 1)
  );
  INSERT INTO bill_counters (id, last_number)
  SELECT 1, COALESCE(MAX(bill_number), 0) FROM bills;

  -- The numbers must now be exactly 1..N. Anything else means the renumbering
  -- did not do what it should, so stop rather than commit it.
  SELECT count(*), COALESCE(max(bill_number), 0) INTO v_bills, v_max FROM bills;
  IF v_bills <> v_max THEN
    RAISE EXCEPTION 'running_bill_number: % bills but the highest number is %', v_bills, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  CREATE UNIQUE INDEX bills_number_idx ON bills (bill_number);
END
$migrate$;
