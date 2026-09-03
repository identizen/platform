---
title: AI assistants and llms.txt
description: Machine-readable versions of these docs for Claude, ChatGPT, Cursor, Copilot and other coding assistants, following the llms.txt convention.
---

These docs ship in the [llms.txt](https://llmstxt.org/) format so a coding assistant can integrate Identizen without scraping HTML.

| URL                                | What it is                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`/llms.txt`](/llms.txt)           | A short index: what Identizen is, the exact steps to add it to a React + TypeScript app, and links to every page as Markdown. Paste this into a model's context first. |
| [`/llms-full.txt`](/llms-full.txt) | Every page of these docs concatenated as one Markdown file, for tools that accept a single large context.                                                              |
| `/<page>.md`                       | Any page as plain Markdown, for example [`/quickstart.md`](/quickstart.md) or [`/guides/react.md`](/guides/react.md).                                                  |

Both files are generated from the same sources as the pages you are reading, so they never drift from the docs.

## Prompt that works

> Read https://docs.identizen.com/llms.txt. Add "Continue with Identizen" login to this React + TypeScript app using the in-page flow with a public PKCE client. Register the site with the CLI, put the transaction helpers in `src/lib/identizen.ts`, render `<IdentizenButton>` on the login page, handle `/callback`, and verify the id_token in the API with `@identizen/sdk/server`. Then run `npx identizen dev` so I can test with the fake phone.

## What a model needs to know

- The site is a standard OpenID Connect relying party with PKCE (S256, required). The index at `https://index.identizen.com` is the OpenID Provider; `/.well-known/openid-configuration` is live.
- The id_token has `sub` (stable per site), `sid`, `acr`, `amr`, and `idz_device`. It never contains an email.
- `@identizen/react` renders the login in-page; `@identizen/sdk/server` verifies tokens and exchanges codes on the server; the `identizen` CLI registers sites and runs a fake phone.
- The user's phone must approve every login. `prompt=none` always fails with `interaction_required`.
- Nothing secret is stored on the index; a public client needs no secret at all.
