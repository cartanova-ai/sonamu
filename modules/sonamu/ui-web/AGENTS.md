# modules/sonamu/ui-web

Static UI-web build for Sonamu UI.

## Validation

- `mise exec -- pnpm --filter ui-web build`
- `mise exec -- pnpm --filter ui-web dev` for behavior verification. Start a Sonamu dev
  server on `http://localhost:10280` first: Vite reads the Sonamu UI access token from its
  `/sonamu-ui/` HTML, and without it every UI API request returns 401 until you reload.
