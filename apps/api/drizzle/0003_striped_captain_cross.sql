CREATE TABLE "player_streaks" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"attack_streak" integer DEFAULT 0 NOT NULL,
	"best_attack_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_streaks" ADD CONSTRAINT "player_streaks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;