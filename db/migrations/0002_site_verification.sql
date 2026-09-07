ALTER TABLE "sites" DROP CONSTRAINT "sites_rp_id_unique";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "verification_token" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "verification_method" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sites_rp_id_idx" ON "sites" USING btree ("rp_id");--> statement-breakpoint
-- Sites registered before domain verification existed were registered by the operator; keep them working.
UPDATE "sites" SET "verified_at" = now(), "verification_method" = 'grandfathered' WHERE "verified_at" IS NULL;
