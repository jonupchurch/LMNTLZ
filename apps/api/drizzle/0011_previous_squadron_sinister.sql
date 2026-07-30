CREATE TABLE "avatar_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"blob_key" text NOT NULL,
	"paid_shards" integer,
	"paid_cents" integer,
	"rejected_reason" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "custom_avatar_url" text;--> statement-breakpoint
ALTER TABLE "avatar_submissions" ADD CONSTRAINT "avatar_submissions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_submissions" ADD CONSTRAINT "avatar_submissions_decided_by_accounts_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avatar_submissions_state_submitted_idx" ON "avatar_submissions" USING btree ("state","submitted_at");--> statement-breakpoint
CREATE INDEX "avatar_submissions_account_idx" ON "avatar_submissions" USING btree ("account_id","submitted_at");