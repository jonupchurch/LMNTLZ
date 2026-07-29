CREATE TABLE "player_ratings" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"rating" integer DEFAULT 1000 NOT NULL,
	"rated_battles" integer DEFAULT 0 NOT NULL,
	"gear_score" integer,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;