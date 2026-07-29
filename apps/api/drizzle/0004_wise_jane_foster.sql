CREATE TABLE "battle_actions" (
	"battle_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"actor_instance_id" text NOT NULL,
	"power_id" text NOT NULL,
	"target_instance_id" text,
	"draw_index_before" bigint NOT NULL,
	"draws_consumed" bigint NOT NULL,
	"resolved_packet" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "battle_actions_battle_id_sequence_pk" PRIMARY KEY("battle_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attacker_id" uuid,
	"defender_id" uuid,
	"defender_is_bot" boolean DEFAULT false NOT NULL,
	"zone" text NOT NULL,
	"seed" text NOT NULL,
	"engine_version" text NOT NULL,
	"content_version" text NOT NULL,
	"build_sha" text,
	"turn_count" integer,
	"attacker_squad" jsonb NOT NULL,
	"defender_snapshot" jsonb NOT NULL,
	"league_at_battle" text,
	"rating_at_battle" integer,
	"winner" text,
	"reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"concluded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "abandoned_battles" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_actions" ADD CONSTRAINT "battle_actions_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_attacker_id_accounts_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_defender_id_accounts_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battles_attacker_started_idx" ON "battles" USING btree ("attacker_id","started_at");--> statement-breakpoint
CREATE INDEX "battles_defender_started_idx" ON "battles" USING btree ("defender_id","started_at");--> statement-breakpoint
CREATE INDEX "battles_in_flight_idx" ON "battles" USING btree ("attacker_id") WHERE "battles"."concluded_at" is null;