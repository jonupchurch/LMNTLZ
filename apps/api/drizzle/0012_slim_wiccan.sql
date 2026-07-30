CREATE TABLE "guild_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"guild_id" uuid NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guild_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"guild_id" uuid NOT NULL,
	"invited_by" uuid,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"guild_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "guild_successions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"former_master_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completes_at" timestamp with time zone NOT NULL,
	"lapsed_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"emblem_icon" integer DEFAULT 0 NOT NULL,
	"emblem_ink" integer DEFAULT 0 NOT NULL,
	"emblem_ground" integer DEFAULT 0 NOT NULL,
	"pitch" text DEFAULT '' NOT NULL,
	"motd" text,
	"motd_set_at" timestamp with time zone,
	"founded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone,
	CONSTRAINT "guilds_name_key_unique" UNIQUE("name_key")
);
--> statement-breakpoint
ALTER TABLE "guild_applications" ADD CONSTRAINT "guild_applications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_applications" ADD CONSTRAINT "guild_applications_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_invited_by_accounts_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_successions" ADD CONSTRAINT "guild_successions_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_successions" ADD CONSTRAINT "guild_successions_requested_by_accounts_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_successions" ADD CONSTRAINT "guild_successions_former_master_id_accounts_id_fk" FOREIGN KEY ("former_master_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_applications_account_state_idx" ON "guild_applications" USING btree ("account_id","state");--> statement-breakpoint
CREATE INDEX "guild_applications_guild_state_idx" ON "guild_applications" USING btree ("guild_id","state");--> statement-breakpoint
CREATE INDEX "guild_applications_expiry_idx" ON "guild_applications" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "guild_invites_account_state_idx" ON "guild_invites" USING btree ("account_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_invites_one_open" ON "guild_invites" USING btree ("guild_id","account_id") WHERE "guild_invites"."state" = 'open';--> statement-breakpoint
CREATE INDEX "guild_members_guild_idx" ON "guild_members" USING btree ("guild_id","role");--> statement-breakpoint
CREATE INDEX "guild_successions_state_completes_idx" ON "guild_successions" USING btree ("state","completes_at");--> statement-breakpoint
CREATE INDEX "guild_successions_guild_idx" ON "guild_successions" USING btree ("guild_id","state");--> statement-breakpoint
CREATE INDEX "guilds_founded_idx" ON "guilds" USING btree ("founded_at");