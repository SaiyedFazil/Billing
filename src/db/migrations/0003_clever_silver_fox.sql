CREATE TYPE "public"."stock_movement_type" AS ENUM('OPENING', 'RESTOCK', 'SALE', 'WASTAGE', 'CORRECTION');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"bill_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_bill_iff_sale" CHECK (("stock_movements"."bill_id" IS NOT NULL) = ("stock_movements"."type" = 'SALE')),
	CONSTRAINT "stock_movements_delta_non_zero" CHECK ("stock_movements"."quantity_delta" <> 0 OR "stock_movements"."type" = 'OPENING'),
	CONSTRAINT "stock_movements_after_non_negative" CHECK ("stock_movements"."quantity_after" >= 0),
	CONSTRAINT "stock_movements_note_length" CHECK ("stock_movements"."note" IS NULL OR char_length("stock_movements"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "track_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "stock_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "low_stock_threshold" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_item_created_idx" ON "stock_movements" USING btree ("item_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_bill_idx" ON "stock_movements" USING btree ("bill_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_stock_non_negative" CHECK ("items"."stock_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_low_stock_threshold_non_negative" CHECK ("items"."low_stock_threshold" >= 0);