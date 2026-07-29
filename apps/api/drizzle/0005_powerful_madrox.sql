CREATE TABLE "battle_records" (
	"battle_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"concluded_at" timestamp with time zone NOT NULL,
	"attacker_id" uuid,
	"defender_id" uuid,
	"defender_is_bot" boolean NOT NULL,
	"zone" text NOT NULL,
	"winner" text NOT NULL,
	"reason" text NOT NULL,
	"turn_count" integer NOT NULL,
	"attacker_squad" jsonb NOT NULL,
	"defender_squad" jsonb NOT NULL,
	"attacker_league" text,
	"defender_league" text,
	"attacker_rating" integer,
	"defender_rating" integer,
	"engine_version" text NOT NULL,
	"content_version" text NOT NULL,
	"build_sha" text,
	"replay_blob_url" text,
	"replay_deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "replay_holds" (
	"battle_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "replay_holds_battle_id_report_id_pk" PRIMARY KEY("battle_id","report_id")
);
--> statement-breakpoint
ALTER TABLE "battle_records" ADD CONSTRAINT "battle_records_attacker_id_accounts_id_fk" FOREIGN KEY ("attacker_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_records" ADD CONSTRAINT "battle_records_defender_id_accounts_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_holds" ADD CONSTRAINT "replay_holds_battle_id_battle_records_battle_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battle_records"("battle_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_records_attacker_idx" ON "battle_records" USING btree ("attacker_id","concluded_at");--> statement-breakpoint
CREATE INDEX "battle_records_defender_idx" ON "battle_records" USING btree ("defender_id","concluded_at");--> statement-breakpoint
CREATE INDEX "battle_records_cleanup_idx" ON "battle_records" USING btree ("concluded_at") WHERE "battle_records"."replay_blob_url" is not null and "battle_records"."replay_deleted_at" is null;