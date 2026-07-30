CREATE TABLE "payment_events" (
	"provider_event_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"account_id" uuid,
	"sku" text NOT NULL,
	"amount" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reverses" text,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"days_granted" integer NOT NULL,
	"provider_event_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_grants" ADD CONSTRAINT "entitlement_grants_provider_event_id_payment_events_provider_event_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."payment_events"("provider_event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_events_occurred_idx" ON "payment_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "payment_events_account_idx" ON "payment_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "entitlement_grants_account_idx" ON "entitlement_grants" USING btree ("account_id","starts_at");