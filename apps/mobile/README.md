# apps/mobile

Expo (React Native) client — the CareConnect product, all 18 screens (§16).

Scaffolded in Phase 6 (accessibility), with the 3 screens that phase actually needed to be real —
login, dashboard, settings — wired to the live API, not sample data. The remaining 15 land
alongside the phases that give them something to show. See the root
[`README.md`](../../README.md#getting-started) for how to run it.

## Layout

```
apps/mobile/
  App.tsx                   screen router (login / dashboard / settings) + AccessibilityProvider
  metro.config.js           pnpm monorepo resolution (symlinks, .js->.ts retry) — see comments in file
  src/
    api/client.ts            thin fetch wrapper over apps/api, typed with @careconnect/contracts
    accessibility/           AccessibilityProvider — reads @careconnect/tokens, driven by
                              User.accessibilityMode
    screens/                 LoginScreen, DashboardScreen, SettingsScreen
    components/ConfirmDialog.tsx   custom confirmation modal, sized from the accessibility tokens
                                    (not the native Alert, which can't be resized to the scale)
```

## Notes for the next screen

- Read tokens from `useAccessibility()`, never hardcode a font size, color, or touch-target size —
  that's the whole point of Build Plan §3.5.
- Route API calls through `src/api/client.ts`, typed against `@careconnect/contracts`, the same
  contract `apps/api`'s routes validate requests against.
- Important/irreversible actions get a `ConfirmDialog`, not a bare button (§12).
