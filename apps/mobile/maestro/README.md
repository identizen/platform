# Maestro flows (M8.6, `[cc+human]`)

Runs on macOS with Xcode and an iOS Simulator. Not runnable on Windows.

```bash
# 1. Index + database + sample site (from the repo root)
docker compose up -d postgres && npm run migrate -w @identizen/db
npm run dev:e2e -w @identizen/index -- --port 8787        # http://localhost:8787
npm run dev -w @identizen/e2e-site -- --port 3000          # sample relying party

# 2. The app on the simulator (development build; Expo Go cannot register push tokens but can poll)
cd apps/mobile
npx expo prebuild --platform ios
npx expo run:ios
#   In the app: Create your identity -> write the words -> verify -> Settings -> Index = http://localhost:8787
#   -> Home -> Register this phone. Face ID: Simulator menu Features > Face ID > Enrolled.

# 3. Start a login on the sample site and hand the deep link to the flow
#    Open http://localhost:3000, click "Continue with Identizen", copy the "Open in Identizen" link
#    (http://localhost:8787/l/ch_...). On the simulator the app link host is app.identizen.com, so
#    use the custom scheme form:
export CHALLENGE_URL="identizen://l/ch_XXXXXXXXXXXXXXXXXXXXXXXXXX"
maestro test maestro/login-deeplink.yaml
```

Expected: the approve screen shows the site name and the same 2-digit code as the browser; after
Approve the browser lands on the site dashboard (the flow does not observe the browser — check it
by eye or with the Playwright e2e in `e2e/`).

CI: once a macOS runner is available, run the same steps with `maestro test --format junit`.
