CREATE TABLE "username_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"previous_username" text NOT NULL,
	"new_username" text NOT NULL,
	"forced" boolean DEFAULT false NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "username_changes" ADD CONSTRAINT "username_changes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "username_changes_account_changed_idx" ON "username_changes" USING btree ("account_id","changed_at");