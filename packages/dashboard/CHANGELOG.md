# @identizen/dashboard

## 0.1.0

### Minor Changes

- 4993d95: New package. The dashboard's feature folders (sign-in, devices, paired browsers, sessions, activity, handle, deep link, overview), shared components, index client and runtime configuration move out of app.identizen.com so an organization app can compose the same screens. The index URL now resolves at runtime: `window.__IDZ_CONFIG__.indexUrl`, then `VITE_IDENTIZEN_INDEX_URL`, then `<tenant>.app.<domain>` → `https://<tenant>.index.<domain>`, then the local dev index.

### Patch Changes

- Updated dependencies [59f9011]
  - @identizen/ui@0.1.0
