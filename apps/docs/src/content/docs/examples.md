---
title: Examples
description: JT Merlin Bank, a public demo of a complete Identizen integration, with its source and developer pages.
---

## JT Merlin Bank (demo)

**[jtmerlin.com](https://jtmerlin.com)** is a fictional bank that shows an end-to-end integration against the hosted index:

- **Login** with `<IdentizenButton>` from `@identizen/react`: OIDC authorization code with PKCE from the browser (public client), the match code and QR, Web Bluetooth on Chromium, and browser pairing so later logins push straight to the phone.
- **Transaction approval** with `<IdentizenStepUp>`: every wire and any ACH transfer of $1,000 or more pushes the exact transaction text to the phone, which shows it above the match code and signs it.
- **Honesty built in.** A banner on every page says the bank, its accounts, and its transfers are fictional. Nothing moves money.

Its developer pages render the site's own source files, so they cannot drift from what runs:

| Page                                                       | What it shows                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [How it works](https://jtmerlin.com/docs)                  | The three parties (browser, index, phone) and what is real in the demo             |
| [Quickstart](https://jtmerlin.com/docs/quickstart)         | `npx identizen init`, the fake phone, and a Next.js login in five commands         |
| [Register your site](https://jtmerlin.com/docs/register)   | `npx identizen register-site` and the equivalent `POST /sites` call                |
| [The login button](https://jtmerlin.com/docs/login)        | The React component, the callback, and the PKCE helper, verbatim                   |
| [Approve a transaction](https://jtmerlin.com/docs/step-up) | The step-up panel and the server-side Verification API call a real bank would make |

Source: [`apps/demo-bank`](https://github.com/identizen/platform/tree/main/apps/demo-bank) in the platform repository. It is a React 19 + Vite single-page app on the shared design system, deployed as a Cloudflare Worker with static assets.

### What the demo does not do

It has no server, so it trusts the approved state the SDK reports. A real bank confirms through the [Verification API](/reference/verification-api/) with its client secret, which returns the phone's signed assertion over the reason. The step-up page shows that call.

## The playground

[identizen.com/playground](https://identizen.com/playground) runs a login against the hosted index with a virtual phone in the page, for trying the flow without installing anything.
