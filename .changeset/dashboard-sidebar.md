---
'@identizen/dashboard': minor
---

`AppShell` moves the navigation into a vertical left sidebar: brand mark and handle at the top, the pages in the middle, sign-out and theme toggle at the bottom. It is fixed at 240px from `lg` up with independently scrolling content; below `lg` a slim top bar's "Menu" button opens the same panel as a drawer (focus moves in, Escape closes, closes on navigation). New optional props: `extraNav` (a composing app's items, each with an optional `group` heading), `banner` (rendered above the content), and `onSignOut` (defaults to clearing the session and returning home). `NavItem.to` is now a plain string so a composing app can add its own routes.
