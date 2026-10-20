CREATE TYPE "public"."expense_mode" AS ENUM('CASH', 'UPI', 'CARD', 'BANK_TRANSFER');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_length" CHECK (char_length("expense_categories"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_date" date NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"mode" "expense_mode" NOT NULL,
	"category_id" uuid NOT NULL,
	"paid_to" text,
	"note" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"idempotency_key" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_cancellation_complete" CHECK (("expenses"."cancelled_at" IS NULL) = ("expenses"."cancelled_by" IS NULL)
        AND ("expenses"."cancelled_at" IS NULL) = ("expenses"."cancel_reason" IS NULL)),
	CONSTRAINT "expenses_paid_to_length" CHECK ("expenses"."paid_to" IS NULL OR char_length("expenses"."paid_to") BETWEEN 1 AND 80),
	CONSTRAINT "expenses_note_length" CHECK ("expenses"."note" IS NULL OR char_length("expenses"."note") BETWEEN 1 AND 200),
	CONSTRAINT "expenses_cancel_reason_length" CHECK ("expenses"."cancel_reason" IS NULL OR char_length("expenses"."cancel_reason") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_lower_idx" ON "expense_categories" USING btree (lower("name")) WHERE "expense_categories"."is_active";--> statement-breakpoint
CREATE INDEX "expenses_expense_date_idx" ON "expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_idempotency_key_idx" ON "expenses" USING btree ("idempotency_key");