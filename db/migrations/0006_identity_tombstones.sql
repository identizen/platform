CREATE TABLE "identity_tombstones" (
	"idz" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_tombstones_reason_check" CHECK ("identity_tombstones"."reason" in ('deleted','compromised'))
);
