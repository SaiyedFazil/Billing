-- Cash book spec §6 — expenses are cancelled, never deleted; a cancelled
-- expense is final; expense categories are retired, never deleted. Then the
-- starting category list, so the live shop gets it on db:migrate.
--
-- Hand-written because drizzle-kit does not generate triggers or data. Keep
-- this file and its _journal.json entry in sync; it must always run after
-- 0005, which creates the tables.

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_expense_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'expenses cannot be deleted; cancel the expense instead'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS expenses_no_delete ON expenses;

--> statement-breakpoint
CREATE TRIGGER expenses_no_delete
  BEFORE DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_delete();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION restrict_cancelled_expense_update() RETURNS trigger AS $$
BEGIN
  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'a cancelled expense cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS expenses_cancelled_final ON expenses;

--> statement-breakpoint
CREATE TRIGGER expenses_cancelled_final
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION restrict_cancelled_expense_update();

--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_expense_category_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'expense categories cannot be deleted; retire the category instead'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

--> statement-breakpoint
DROP TRIGGER IF EXISTS expense_categories_no_delete ON expense_categories;

--> statement-breakpoint
CREATE TRIGGER expense_categories_no_delete
  BEFORE DELETE ON expense_categories
  FOR EACH ROW EXECUTE FUNCTION prevent_expense_category_delete();

--> statement-breakpoint
-- Only into an empty table, so re-running never duplicates or resurrects a
-- category the owner has since renamed or retired.
INSERT INTO expense_categories (name)
SELECT name FROM (VALUES
  ('Raw materials'),
  ('Vegetables & dairy'),
  ('Gas'),
  ('Packaging'),
  ('Salary'),
  ('Rent'),
  ('Electricity'),
  ('Repairs & maintenance'),
  ('Other')
) AS seed(name)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories);
