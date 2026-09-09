CREATE TABLE "deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"client_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"last_status" integer,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "deliveries_kind_check" CHECK ("deliveries"."kind" in ('webhook','logout')),
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" in ('pending','delivered','failed'))
);
--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_client_id_sites_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."sites"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_due_idx" ON "deliveries" USING btree ("next_attempt_at") WHERE "deliveries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "deliveries_client_idx" ON "deliveries" USING btree ("client_id","created_at" DESC NULLS LAST);