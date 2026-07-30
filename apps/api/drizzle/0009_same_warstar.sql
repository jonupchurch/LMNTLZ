CREATE TABLE "shard_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"battle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"hero_id" text NOT NULL,
	"slot" text NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"allocations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"utility_effect" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runes_account_hero_slot_key" UNIQUE("account_id","hero_id","slot")
);
--> statement-breakpoint
ALTER TABLE "shard_ledger" ADD CONSTRAINT "shard_ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shard_ledger" ADD CONSTRAINT "shard_ledger_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runes" ADD CONSTRAINT "runes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shard_ledger_account_created_idx" ON "shard_ledger" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "runes_account_idx" ON "runes" USING btree ("account_id");