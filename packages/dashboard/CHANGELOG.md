# @identizen/dashboard

## 0.3.0

### Minor Changes

- d54c84e: Settings gains "Delete my identity": a typed confirmation, a switch for a compromised recovery phrase, and sign-out once the index has removed everything.

## 0.2.0

### Minor Changes

- f065934: `AppShell` moves the navigation into a vertical left sidebar: brand mark and handle at the top, the pages in the middle, sign-out and theme toggle at the bottom. It is fixed at 240px from `lg` up with independently scrolling content; below `lg` a slim top bar's "Menu" button opens the same panel as a drawer (focus moves in, Escape closes, closes on navigation). New optional props: `extraNav` (a composing app's items, each with an optional `group` heading), `banner` (rendered above the content), and `onSignOut` (defaults to clearing the session and returning home). `NavItem.to` is now a plain string so a composing app can add its own routes.

### Patch Changes

- f065934: US English everywhere: error descriptions, OpenAPI descriptions, user-facing copy, README and doc comments now use US spellings (enroll, organization, license, canceled, behavior). Error codes, JSON fields and the SDK's `'cancelled'` session status are unchanged.
- Updated dependencies [f065934]
  - @identizen/sdk@0.3.1

## 0.1.0

### Minor Changes

- 4993d95: New package. The dashboard's feature folders (sign-in, devices, paired browsers, sessions, activity, handle, deep link, overview), shared components, index client and runtime configuration move out of app.identizen.com so an organization app can compose the same screens. The index URL now resolves at runtime: `window.__IDZ_CONFIG__.indexUrl`, then `VITE_IDENTIZEN_INDEX_URL`, then `<tenant>.app.<domain>` → `https://<tenant>.index.<domain>`, then the local dev index.

### Patch Changes

- Updated dependencies [59f9011]
  - @identizen/ui@0.1.0
