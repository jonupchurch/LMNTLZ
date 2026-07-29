CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"banned_until" timestamp with time zone,
	"ban_scope" text
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"replaced_by" uuid,
	"issued_pair" text,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_tokens" ADD CONSTRAINT "renewal_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_key_unique" ON "accounts" USING btree ("username_key");--> statement-breakpoint
CREATE INDEX "accounts_banned_until_idx" ON "accounts" USING btree ("banned_until");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_provider_subject_unique" ON "identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "identities_account_id_idx" ON "identities" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_tokens_token_hash_unique" ON "renewal_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "renewal_tokens_family_id_idx" ON "renewal_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "renewal_tokens_account_id_idx" ON "renewal_tokens" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "renewal_tokens_expires_at_idx" ON "renewal_tokens" USING btree ("expires_at");