# @identizen/ui

## 0.1.1

### Patch Changes

- e819b31: `@identizen/ui/ask-ai` exports the "ask an AI about Identizen" prompt and assistant targets (ChatGPT, Perplexity, Claude) that the marketing and docs sites render as floating buttons.

## 0.1.0

### Minor Changes

- 59f9011: The index, the schema package and the design system are published so a host can embed the
  index instead of forking it. `createApp(options)` gains `resolveEnv` (per-request bindings, for
  multi-tenant hosts), `extend` (extra routers) and `hooks` (challenge start, assertion,
  enrollment, session creation, token claims). `TENANT_KEY` namespaces Durable Object names and
  rate-limit buckets. `migrateDb` accepts several migration folders and orders them by journal
  time. Audit kinds accept host-registered values. Without options nothing changes.
