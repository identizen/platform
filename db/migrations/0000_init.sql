CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"idz" text,
	"device_id" text,
	"client_id" text,
	"org_id" text,
	"kind" text NOT NULL,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" text PRIMARY KEY NOT NULL,
	"idz" text NOT NULL,
	"device_pubkey" "bytea" NOT NULL,
	"ble_key" "bytea",
	"push_token" text,
	"push_platform" text,
	"attestation" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devices_push_platform_check" CHECK ("devices"."push_platform" in ('apns','fcm','web')),
	CONSTRAINT "devices_status_check" CHECK ("devices"."status" in ('active','disabled','revoked'))
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"idz" text PRIMARY KEY NOT NULL,
	"master_pubkey" "bytea" NOT NULL,
	"handle" text,
	"kind" text NOT NULL,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_handle_unique" UNIQUE("handle"),
	CONSTRAINT "identities_kind_check" CHECK ("identities"."kind" in ('personal','org'))
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pairings" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" text NOT NULL,
	"browser_pubkey" "bytea" NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairings_status_check" CHECK ("pairings"."status" in ('active','revoked'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"idz" text NOT NULL,
	"device_id" text NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_bindings" (
	"rp_id" text NOT NULL,
	"sub" text NOT NULL,
	"idz" text NOT NULL,
	"site_pubkey" "bytea" NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_bindings_rp_id_sub_pk" PRIMARY KEY("rp_id","sub")
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_secret_hash" text,
	"rp_id" text NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"backchannel_logout_uri" text,
	"webhook_url" text,
	"webhook_secret_hash" text,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_rp_id_unique" UNIQUE("rp_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"sub" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"assertion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "verifications_status_check" CHECK ("verifications"."status" in ('pending','approved','denied','timeout'))
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_idz_identities_idz_fk" FOREIGN KEY ("idz") REFERENCES "public"."identities"("idz") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairings" ADD CONSTRAINT "pairings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_idz_identities_idz_fk" FOREIGN KEY ("idz") REFERENCES "public"."identities"("idz") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_sites_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."sites"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_bindings" ADD CONSTRAINT "site_bindings_idz_identities_idz_fk" FOREIGN KEY ("idz") REFERENCES "public"."identities"("idz") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_client_id_sites_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."sites"("client_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_idz_at_idx" ON "audit_events" USING btree ("idz","at" DESC NULLS LAST);