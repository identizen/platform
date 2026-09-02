# Dependency audit (M10.3)

`npm run audit` (`npm audit --omit=dev --audit-level=critical`) is part of `npm run gate`; `npm run sbom` writes a CycloneDX SBOM (`sbom.cdx.json`, uploaded as a CI artifact).

## Outstanding advisories on 2026-09-02 (high, not critical)

`npm audit --omit=dev` still reports high-severity advisories that require major upgrades and are therefore left for a human decision:

| Package                                                                                  | Path                                   | Fix                                                                                       |
| ---------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `astro` (<= 7.0.9), `@astrojs/cloudflare`                                                | apps/marketing, apps/docs              | Astro 7+ / Starlight 0.37+ (the plan pins Astro 5; Starlight 0.36 is the last on Astro 5) |
| `sharp` (< 0.35, libvips CVEs)                                                           | Astro image pipeline (build-time only) | bump with the Astro upgrade                                                               |
| `postcss` (<= 8.5.22), `esbuild` (0.27.3–0.28.0), `undici` (7.0–7.28), `ws` (8.0–8.20.1) | transitive via astro / wrangler / next | upstream releases                                                                         |
| `drizzle-orm` (< 0.45.2)                                                                 | db                                     | bumped to ^0.45.2 in this milestone                                                       |

None of these run in the deployed index Worker's request path (the index bundle is protocol + db + hono + jose + zod + qrcode-generator); they affect build tooling and the static-site adapters. Re-run `npm audit` after the Astro major upgrade and lower the gate to `--audit-level=high`.
