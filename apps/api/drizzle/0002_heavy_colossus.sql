CREATE TABLE "squad_member_config" (
	"squad_id" uuid NOT NULL,
	"hero_id" text NOT NULL,
	"target_primary" text NOT NULL,
	"target_fallback" text NOT NULL,
	"ally_rule" text,
	"power_ranking" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_seats" (
	"squad_id" uuid NOT NULL,
	"row" text NOT NULL,
	"index" smallint NOT NULL,
	"hero_id" text NOT NULL,
	CONSTRAINT "squad_seats_index_in_row" CHECK (("squad_seats"."row" = 'front'  AND "squad_seats"."index" BETWEEN 0 AND 1)
       OR ("squad_seats"."row" = 'middle' AND "squad_seats"."index" BETWEEN 0 AND 2)
       OR ("squad_seats"."row" = 'back'   AND "squad_seats"."index" = 0))
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"zone" text,
	"slot_index" smallint,
	"name" text,
	"valid" boolean,
	"hold_streak" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "squads_kind_shape" CHECK (("squads"."kind" = 'defense' AND "squads"."zone" IS NOT NULL AND "squads"."slot_index" IS NULL)
       OR ("squads"."kind" = 'offense' AND "squads"."zone" IS NULL AND "squads"."slot_index" BETWEEN 0 AND 2)),
	CONSTRAINT "squads_hold_streak_non_negative" CHECK ("squads"."hold_streak" >= 0)
);
--> statement-breakpoint
ALTER TABLE "squad_member_config" ADD CONSTRAINT "squad_member_config_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_seats" ADD CONSTRAINT "squad_seats_squad_id_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squads" ADD CONSTRAINT "squads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "squad_member_config_unique" ON "squad_member_config" USING btree ("squad_id","hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_seats_position_unique" ON "squad_seats" USING btree ("squad_id","row","index");--> statement-breakpoint
CREATE UNIQUE INDEX "squad_seats_hero_unique" ON "squad_seats" USING btree ("squad_id","hero_id");--> statement-breakpoint
CREATE INDEX "squad_seats_hero_idx" ON "squad_seats" USING btree ("hero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "squads_defense_zone_unique" ON "squads" USING btree ("account_id","zone") WHERE "squads"."kind" = 'defense';--> statement-breakpoint
CREATE UNIQUE INDEX "squads_offense_slot_unique" ON "squads" USING btree ("account_id","slot_index") WHERE "squads"."kind" = 'offense';--> statement-breakpoint
CREATE INDEX "squads_account_idx" ON "squads" USING btree ("account_id");