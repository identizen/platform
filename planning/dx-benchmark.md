# DX benchmark (M6.6, `[cc+human]`)

Target: from a fresh `create-next-app` to a logged-in dashboard in **under 5 minutes**, via `identizen init` + `identizen dev`, without reading a concepts page.

## Procedure (human runs, records the wall clock)

```bash
# 0. Prereqs: an index reachable from this machine (local: `npm run dev -w @identizen/index`, or a hosted index URL)
# 1. t=0
npx create-next-app@latest idz-bench --ts --app --no-tailwind --no-eslint --src-dir=false --import-alias "@/*" --use-npm
cd idz-bench
# 2.
npx identizen init --index http://localhost:8787           # registers the site, writes .env.local, scaffolds app/api/auth/*
npm install
# 3. add the button to app/page.tsx:
#    <a href="/api/auth/login">Continue with Identizen</a>
# 4. two terminals:
npx identizen dev --index http://localhost:8787            # fake phone at http://localhost:4400 (auto-approve)
npm run dev
# 5. open http://localhost:3000, click Continue with Identizen, scan by pasting the deep link into the fake phone UI
#    (or let the paired flow push). t=stop when the callback lands.
```

## Results

| Date | Who | Index | Time to first login | Steps that needed explaining | Notes |
| ---- | --- | ----- | ------------------- | ---------------------------- | ----- |
|      |     |       |                     |                              |       |

If a step needed explaining, fix the step (CLI output, template, defaults), not the docs.
