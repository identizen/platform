# Identizen — working rules

- Source of truth for the protocol is spec/PROTOCOL.md and packages/protocol. Never re-implement signing, canonicalization, or key derivation elsewhere; import it.
- Stack is fixed: TypeScript strict, npm workspaces, Turborepo. Index: Hono on Cloudflare Workers, Postgres (Neon via Hyperdrive) with Drizzle, Durable Objects for in-flight challenges only. Web app: React 19, Vite, Tailwind v4, shadcn/ui, TanStack Query + Router, React Hook Form + Zod, Lucide. Marketing: Astro + Tailwind v4 + React islands. Docs: Astro Starlight. Mobile: Expo/React Native + NativeWind. Ask before deviating.
- Design system lives in packages/ui: Inter, Tailwind v4 CSS-first @theme tokens, neutral surfaces + one accent, light/dark with system default and persistent toggle, WCAG 2.1 AA. shadcn components are restyled through tokens only, never per-component overrides. Every surface — marketing, docs, app, mobile — uses the same tokens.
- Frontend rules: feature folders src/features/<feature>/{routes,components,hooks,api,types}; components are primitive (shadcn), presentational (props in, JSX out, no fetching/router), or route/container. ESLint enforces: no default exports, no any, ≤250 lines per component file, no cross-feature imports except via a feature's index.ts. Server state only in TanStack Query hooks; no global stores.
- One milestone at a time, from planning/identizen-implementation-plan.md; TASKS.md is the checklist. One PR per task. Conventional commits.
- Gate: `npm run gate` (lint, typecheck, unit, e2e). Never merge red. Tag `v0.<milestone>.0` when a milestone's gate is green.
- Every task ships with its test. Every protocol change regenerates spec/vectors and updates PROTOCOL.md in the same PR.
- The index stores no secrets. If you find yourself persisting a private key, seed, or plaintext token, stop.
- Tasks tagged [cc+human] or [human]: do the scaffolding, write clear instructions in the PR for what the human must run, and do not mark the task done.
- Ask before: changing id_token claims, adding deps to packages/protocol, adding tables/columns, or touching anything under modules/ without a device to test on.
- DX is the product. If a quickstart step feels like it needs explanation, fix the step, not the docs.

## Tooling notes

- Package manager is **npm** (workspaces). The plan's `bun gate` is `npm run gate` here.
- Cloudflare: `wrangler` for the index Worker, Durable Objects, Hyperdrive, and static-asset Workers (marketing, docs, web). Neon: `neonctl` for database ops.
- Local Postgres for tests: `docker compose up -d postgres` or set `DATABASE_URL`.
- Never commit tokens. npm publishing uses `NPM_TOKEN` from the environment.
