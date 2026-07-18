# Food Body Log

Food Body Log is a local-first static web app for personal iPhone tracking. The current foundation is a dependency-free PWA shell that can be served from the `public/` folder and installed from Safari.

## Local Run

`public/` is the publish directory. It contains the ready-to-serve app shell: HTML, CSS, JavaScript modules, manifest, service worker, and icons.

Run the static shell locally:

```bash
python3 -m http.server 4173 --directory public
```

Then open `http://localhost:4173/` in a browser. For iPhone Home Screen install testing, use a hosted HTTPS URL that serves this same `public/` directory.

## Static Hosting

Publish the contents of `public/` as plain static files. There is no build command, backend, server function, private secret, app-user account, database service, analytics project, native iOS project, App Store submission, or Apple Developer Program enrollment in this app foundation.

Use [docs/static-hosting.md](docs/static-hosting.md) for GitHub Pages, Cloudflare Pages, Netlify-style static hosts, root-domain deployment, project-subpath deployment, and update checks.

Use [docs/iphone-uat.md](docs/iphone-uat.md) for final iPhone 13 Safari install, offline, and update/relaunch verification once a hosted HTTPS URL is available.
