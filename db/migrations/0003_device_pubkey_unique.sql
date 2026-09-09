-- Duplicate rows for one device key can only come from concurrent enrollment (F04, 2026-09-08
-- review). The row the phone used last keeps the key; every other duplicate becomes a revoked
-- tombstone whose key nobody holds (the md5 of its id), so the unique index below holds without
-- deleting rows that other tables reference. If any duplicate was revoked, the survivor is
-- revoked too: the revocation was for the key, not for one row.
UPDATE "devices" d SET "status" = 'revoked'
WHERE d."status" <> 'revoked' AND EXISTS (
  SELECT 1 FROM "devices" x
  WHERE x."device_pubkey" = d."device_pubkey" AND x."id" <> d."id" AND x."status" = 'revoked'
);--> statement-breakpoint
CREATE TEMP TABLE "devices_dedupe" AS
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (
      PARTITION BY "device_pubkey" ORDER BY "last_seen_at" DESC NULLS LAST, "created_at" ASC
    ) AS rn
    FROM "devices"
  ) r WHERE rn > 1;--> statement-breakpoint
UPDATE "sessions" SET "revoked_at" = now()
WHERE "revoked_at" IS NULL AND "device_id" IN (SELECT "id" FROM "devices_dedupe");--> statement-breakpoint
UPDATE "pairings" SET "status" = 'revoked'
WHERE "status" = 'active' AND "device_id" IN (SELECT "id" FROM "devices_dedupe");--> statement-breakpoint
UPDATE "devices" SET "status" = 'revoked', "device_pubkey" = decode(md5("id"), 'hex')
WHERE "id" IN (SELECT "id" FROM "devices_dedupe");--> statement-breakpoint
DROP TABLE "devices_dedupe";--> statement-breakpoint
CREATE UNIQUE INDEX "devices_device_pubkey_uidx" ON "devices" USING btree ("device_pubkey");
