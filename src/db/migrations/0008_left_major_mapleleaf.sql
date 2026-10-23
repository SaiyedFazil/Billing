ALTER TYPE "public"."payment_method" ADD VALUE 'SPLIT';--> statement-breakpoint
CREATE TABLE "bill_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bill_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"tendered" numeric(10, 2),
	"change_due" numeric(10, 2),
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payments_not_split" CHECK ("bill_payments"."method" <> 'SPLIT'),
	CONSTRAINT "bill_payments_amount_non_negative" CHECK ("bill_payments"."amount" >= 0),
	CONSTRAINT "bill_payments_position_positive" CHECK ("bill_payments"."position" > 0),
	CONSTRAINT "bill_payments_tender_matches" CHECK (("bill_payments"."tendered" IS NULL AND "bill_payments"."change_due" IS NULL) OR ("bill_payments"."method" = 'CASH' AND "bill_payments"."tendered" >= "bill_payments"."amount" AND "bill_payments"."change_due" = "bill_payments"."tendered" - "bill_payments"."amount"))
);
--> statement-breakpoint
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payments_bill_method_idx" ON "bill_payments" USING btree ("bill_id","method");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payments_bill_position_idx" ON "bill_payments" USING btree ("bill_id","position");--> statement-breakpoint
CREATE INDEX "bill_payments_method_idx" ON "bill_payments" USING btree ("method");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_split_has_no_tender" CHECK ("bills"."payment_method" <> 'SPLIT' OR ("bills"."tendered" IS NULL AND "bills"."change_due" IS NULL));--> statement-breakpoint
ALTER TABLE "shop_settings" ADD CONSTRAINT "shop_settings_no_split_method" CHECK (NOT ('SPLIT' = ANY("shop_settings"."payment_methods")));