CREATE TABLE "ad_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" uuid NOT NULL,
	"day" text NOT NULL,
	"granted" integer NOT NULL,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_embeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reference_id" text NOT NULL,
	"snapshot" text NOT NULL,
	"shards_charged" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"embed" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_envoy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_credits" ADD CONSTRAINT "ad_credits_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_embeds" ADD CONSTRAINT "chat_embeds_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ad_credits_guild_day" ON "ad_credits" USING btree ("guild_id","day");--> statement-breakpoint
CREATE INDEX "chat_embeds_message_idx" ON "chat_embeds" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_scope_idx" ON "chat_messages" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_author_idx" ON "chat_messages" USING btree ("author_id");