# RailETA — Free Setup

A GitHub-ready prototype for **Dynamic Forecast of Expected Time of Arrival (ETA) for Coaching Trains**.

## What this version does

1. Asks the user for browser location.
2. Finds up to 3 nearby railway stations using OpenStreetMap/Overpass data.
3. Lets the user select a station.
4. Asks for a train number.
5. Calls a small Cloudflare Worker proxy so the RailRadar secret is not exposed in frontend JavaScript.
6. Displays live train details from the RailRadar response: status, delay, current station, next station, speed, route, platforms, timestamps and exceptions/diversions.
7. Calculates a transparent first-pass ETA estimate using remaining distance, current/section speed and current delay. It is explicitly labelled as a forecast, not an official railway ETA.
8. Initializes Firebase Analytics with the RailETA Firebase web configuration supplied for this project. No login/signup is used.

## Files

- `index.html` — UI
- `styles.css` — modern responsive UI
- `app.js` — GPS, station search, train UI, ETA logic and Firebase Analytics
- `worker.js` — free proxy for RailRadar

## Step 1 — Firebase

No Authentication is required. Keep the Firebase project on a no-cost setup. The web configuration is already in `app.js`.

## Step 2 — RailRadar

Keep your RailRadar secret private. **Never paste it into `app.js` or a public GitHub repository.**

## Step 3 — Deploy the free proxy

The easiest zero-cost approach is Cloudflare Workers.

1. Create a free Cloudflare account.
2. Install Wrangler locally:
   `npm install -g wrangler`
3. Log in:
   `wrangler login`
4. In this folder, create `wrangler.toml`:

```toml
name = "raileta-proxy"
main = "worker.js"
compatibility_date = "2026-09-05"
```

5. Set the secret without putting it in Git:
   `wrangler secret put RAILRADAR_API_KEY`
6. Paste your RailRadar secret when Wrangler asks.
7. Deploy:
   `wrangler deploy`
8. Copy the Worker URL, for example:
   `https://raileta-proxy.<your-subdomain>.workers.dev`

## Step 4 — Connect the frontend

Open `app.js` and replace:

```js
const API_BASE_URL = localStorage.getItem('railetaApiBaseUrl') || 'YOUR_RAILRADAR_PROXY_URL';
```

with your Worker URL, for example:

```js
const API_BASE_URL = localStorage.getItem('railetaApiBaseUrl') || 'https://raileta-proxy.example.workers.dev';
```

Do **not** put the RailRadar secret there.

## Step 5 — Test locally

Because browser GPS works reliably on secure origins, use a local HTTPS development server or deploy to GitHub Pages for the final test.

Open the site, click **Use my location**, allow permission, select a nearby station, enter a train number and press **Track train**.

## Step 6 — GitHub Pages

Upload `index.html`, `styles.css`, and `app.js` to your repository. `worker.js` may live in the same repository, but its secret must only be stored in Cloudflare Worker secrets. Enable GitHub Pages from the repository's Pages settings.

## Important free-tier limitations

- RailRadar's free quota is limited; avoid aggressive polling.
- Overpass/OpenStreetMap public infrastructure has usage policies and is not an unlimited commercial API.
- Cloudflare's free Worker limits can change; verify current limits in your dashboard.
- Live data availability and accuracy depend on the upstream railway data provider.
- Browser location requires user permission and normally a secure context (HTTPS).

## Security

Firebase web config is designed to be present in browser code; security is enforced by Firebase rules/services, not by hiding the web config. The **RailRadar API secret is different** and must stay server-side.
