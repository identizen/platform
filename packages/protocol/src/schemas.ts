/**
 * Wire types and Zod schemas (PROTOCOL.md sections 3, 4, 6.4).
 */
import { z } from 'zod';

const B64URL = /^[A-Za-z0-9_-]+$/;
const ULID = '[0-9A-HJKMNP-TV-Z]{26}';
const HOST = /^[a-z0-9.-]+$/;

export const ACR_LOGIN = 'idz:login';
export const ACR_MFA = 'idz:mfa';
export const CHALLENGE_TTL_SECONDS = 60;
export const REASON_MAX_LENGTH = 140;
export const RP_NAME_MAX_LENGTH = 64;
/** Accepted clock skew when validating `iat`/`exp`. */
export const CLOCK_SKEW_SECONDS = 5;

export const AcrSchema = z.enum([ACR_LOGIN, ACR_MFA]);
export type Acr = z.infer<typeof AcrSchema>;

export const AmrSchema = z.enum(['face', 'fingerprint', 'pin', 'hwk', 'user', 'swk']);
export type Amr = z.infer<typeof AmrSchema>;

export const ChallengeIdSchema = z.string().regex(new RegExp(`^ch_${ULID}$`));
export const DeviceIdSchema = z.string().regex(new RegExp(`^dev_${ULID}$`));
export const PairingIdSchema = z.string().regex(new RegExp(`^pr_${ULID}$`));
export const VerificationIdSchema = z.string().regex(new RegExp(`^vf_${ULID}$`));

export const RpIdSchema = z.string().min(1).max(253).regex(HOST);
export const Base64UrlSchema = z.string().regex(B64URL);
/** 32 raw bytes -> 43 base64url chars. */
export const Nonce32Schema = z.string().length(43).regex(B64URL);
/** 32-byte Ed25519 public key -> 43 base64url chars. */
export const PublicKeySchema = z.string().length(43).regex(B64URL);
/** 64-byte Ed25519 signature -> 86 base64url chars. */
export const SignatureSchema = z.string().length(86).regex(B64URL);
/** `base64url(SHA-256(x))[0:32]` */
export const KeyIdSchema = z.string().length(32).regex(B64URL);
export const HandleSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/);

export const ChallengeSchema = z
  .object({
    type: z.literal('challenge'),
    id: ChallengeIdSchema,
    rp_id: RpIdSchema,
    rp_name: z.string().min(1).max(RP_NAME_MAX_LENGTH),
    nonce: Nonce32Schema,
    code: z.string().regex(/^[0-9]{2}$/),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().nonnegative(),
    index: z.string().url(),
    acr: AcrSchema,
    reason: z.string().min(1).max(REASON_MAX_LENGTH).nullable(),
  })
  .strict()
  .refine((c) => c.exp - c.iat === CHALLENGE_TTL_SECONDS, {
    message: `exp - iat must be ${CHALLENGE_TTL_SECONDS}`,
    path: ['exp'],
  });
export type Challenge = z.infer<typeof ChallengeSchema>;

export const SignedChallengeSchema = z
  .object({ payload: ChallengeSchema, sig: SignatureSchema })
  .strict();
export type SignedChallenge = z.infer<typeof SignedChallengeSchema>;

export const AssertionSchema = z
  .object({
    type: z.literal('assertion'),
    challenge_id: ChallengeIdSchema,
    nonce: Nonce32Schema,
    rp_id: RpIdSchema,
    sub: KeyIdSchema,
    site_pubkey: PublicKeySchema,
    device_id: DeviceIdSchema,
    iat: z.number().int().nonnegative(),
    amr: z.array(AmrSchema).min(1),
    acr: AcrSchema,
    reason_hash: z.string().length(43).regex(B64URL).nullable(),
  })
  .strict();
export type Assertion = z.infer<typeof AssertionSchema>;

export const SignedAssertionSchema = z
  .object({ payload: AssertionSchema, site_sig: SignatureSchema, device_sig: SignatureSchema })
  .strict();
export type SignedAssertion = z.infer<typeof SignedAssertionSchema>;

export const PairingSchema = z
  .object({
    type: z.literal('pairing'),
    pairing_id: PairingIdSchema,
    device_id: DeviceIdSchema,
    /** Raw uncompressed P-256 public key (65 bytes) as base64url. */
    browser_pubkey: Base64UrlSchema,
    issued_at: z.number().int().nonnegative(),
  })
  .strict();
export type Pairing = z.infer<typeof PairingSchema>;

export const SignedPairingSchema = z
  .object({ payload: PairingSchema, sig: SignatureSchema })
  .strict();
export type SignedPairing = z.infer<typeof SignedPairingSchema>;

/** Body of `POST /devices` (unsigned): registers the install and, on first sight, the identity. */
export const DeviceRegistrationSchema = z
  .object({
    device_pubkey: PublicKeySchema,
    master_pubkey: PublicKeySchema,
    /** Proof the device holds the master key: Ed25519 (type "identity") over { device_pubkey }. */
    master_sig: SignatureSchema,
    handle: HandleSchema.optional(),
    kind: z.enum(['personal', 'org']).default('personal'),
    ble_key: Base64UrlSchema.optional(),
    push_token: z.string().max(4096).optional(),
    push_platform: z.enum(['apns', 'fcm', 'web']).optional(),
    attestation: z.record(z.string(), z.unknown()).optional(),
    label: z.string().max(64).optional(),
  })
  .strict();
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;

/** Body of `POST /identities` (signed with Idz-Signature): set or clear the handle. */
export const HandleUpdateSchema = z.object({ handle: HandleSchema.nullable() }).strict();
export type HandleUpdate = z.infer<typeof HandleUpdateSchema>;
