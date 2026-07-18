# Static Hosting

This app ships as ready-to-serve static files. Publish the `public/` directory exactly as the site output.

## Publish Settings

| Host style | Setting |
|------------|---------|
| GitHub Pages | Publish the static site from the folder that contains `public/index.html`, or copy the contents of `public/` to the Pages publish root. |
| Cloudflare Pages | Use `public/` as the output directory. Use no build command. |
| Netlify-style static hosts | Use `public/` as the publish directory. Use no build command. |

Static host contract:

- HOST-01: Serve only static files.
- HOST-02: Use no server-side code, no server functions, no secrets, no app-user accounts, no environment variables, and no database service.
- HOST-03: Use no build command; `public/` already contains HTML, CSS, JavaScript, manifest, service worker, and icons.
- HOST-04: Keep `index.html` at the publish root for the deployed app path.
- HOST-05: Support both root domain and project subpath deployments.
- HOST-06: Use a hosted HTTPS install URL for iPhone Safari Add to Home Screen testing.
- HOST-07: Update by replacing static files on the same host path, then revisit or relaunch the app.
- HOST-08: Use Settings in the app to check whether the offline app shell is ready.

## Root Domain

For a root domain, the app URL is the site root, such as `https://example.com/`.

Expected file locations:

- `https://example.com/index.html`
- `https://example.com/manifest.webmanifest`
- `https://example.com/sw.js`
- `https://example.com/icons/icon-192.png`

The manifest, icon links, scripts, styles, and service worker use relative paths so the app can stay static.

## Project Subpath

For a project subpath, keep the app under one stable path, such as `https://example.com/food-body-log/`.

Expected file locations:

- `https://example.com/food-body-log/index.html`
- `https://example.com/food-body-log/manifest.webmanifest`
- `https://example.com/food-body-log/sw.js`
- `https://example.com/food-body-log/icons/apple-touch-icon.png`

Do not move the app between protocol, domain, or path during normal use. IndexedDB is scoped to the browser origin and app path behavior; changing `http` to `https`, changing domains, or moving from `/food-body-log/` to `/` can make existing local setup/status data unavailable from the new URL.

## Update Workflow

To update the installed shell:

1. Replace the static files at the same deployed path.
2. Open the hosted HTTPS install URL once while online.
3. Open Settings and run `Check install status`.
4. Confirm the offline app shell reaches `Ready`.
5. Relaunch from Home Screen and confirm local setup/status data is still present.

Personal data remains in browser-managed local storage for the same app location. Static shell updates should not move data to a remote service.
