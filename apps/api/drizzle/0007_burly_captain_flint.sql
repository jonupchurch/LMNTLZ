ALTER TABLE "accounts" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "bot_band" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "starter_exited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "starter_exit_reason" text;--> statement-breakpoint
CREATE INDEX "accounts_bot_band_idx" ON "accounts" USING btree ("bot_band") WHERE "accounts"."is_bot";