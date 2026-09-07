# @identizen/eslint-config

The ESLint rules every Identizen codebase runs under: `typescript-eslint` strict and stylistic
type-checked presets, no default exports (framework config files excepted), no `any`, features
import each other only through their `index.ts`, and component files stay under 250 lines.

```js
// eslint.config.mjs
import { identizenConfig } from '@identizen/eslint-config';

export default identizenConfig({
  tsconfigRootDir: import.meta.dirname,
  ignores: ['deploy/**'],
  defaultExportAllowed: ['apps/portal/src/routes/**'],
});
```
