# RailETA — Corrected Railway Version

RailETA is a no-login web app for **Dynamic Forecast of Expected Time of Arrival (ETA) for Coaching Trains**.

## Important correction

This version searches **Indian railway stations only**.

The nearby-station query uses OpenStreetMap/Overpass with:

- `railway=station`
- `railway=halt`

Metro/subway objects are excluded.

## Flow

1. User opens RailETA.
2. Browser asks for location permission.
3. The app finds up to 3 nearby railway stations.
4. User selects one railway station.
5. User enters a 5-digit train number.
6. Cloudflare Worker calls RailRadar using the secret API key.
7. RailETA displays live train information.
8. ETA is forecast toward the selected station using route distance, live speed, current delay and schedule when those fields are available.

## Files

- `index.html` — website UI
- `styles.css` — complete styling
- `app.js` — GPS, railway-station search, train API call, ETA logic
- `worker.js` — Cloudflare proxy for RailRadar
- `wrangler.toml.example` — optional Wrangler configuration
- `README.md` — setup instructions

## 1. Cloudflare Worker

Your Worker can remain connected to the GitHub repository.

Replace the Worker code with the `worker.js` in this package.

Deploy it.

Then in Cloudflare:

**Worker → Settings → Variables and Secrets → Add Secret**

Create:

```text
Name: RAILRADAR_API_KEY
Value: YOUR_NEW_RAILRADAR_SECRET_KEY
```

The secret must NOT be committed to GitHub.

## 2. Worker URL

Enable the Worker `workers.dev` domain in Cloudflare.

Copy the URL, for example:

```text
https://raileta.<your-account>.workers.dev
```

Open `app.js` and replace:

```js
const RAILRADAR_PROXY_URL = "https://YOUR-WORKER-URL.workers.dev";
```

with your actual Worker URL.

Do NOT put the RailRadar API key in `app.js`.

## 3. GitHub

Upload/replace these files in your RailETA repository:

```text
index.html
app.js
styles.css
worker.js
README.md
wrangler.toml.example
```

GitHub Pages can serve `index.html` directly.

## 4. Firebase

Firebase Authentication is intentionally not used.

The supplied RailETA Firebase web configuration is initialized for the project and Analytics is enabled when supported. No login/signup is required.

You do not need to create Firebase Authentication users for this version.

## 5. GPS

The browser asks for location permission.

For a deployed HTTPS GitHub Pages site, browser geolocation can work after the user presses **Use My Location** and allows permission.

The coordinates are used by the browser to search for nearby railway stations.

## 6. Free services used

- GitHub Pages for static website hosting
- Cloudflare Worker for the API proxy
- OpenStreetMap/Overpass for nearby railway station discovery
- RailRadar free API plan for live train data
- Firebase web configuration / Analytics

Free-tier limits and availability can change.

## 7. Testing

Use a real 5-digit train number supported by your RailRadar account, for example:

```text
12919
```

The API response should contain live fields such as:

- train number/name
- status
- delay
- current location
- current speed
- next halt
- route
- scheduled/actual times
- platform
- diversion information

## 8. ETA disclaimer

The ETA shown by RailETA is a forecast, not an official railway guarantee.

When live speed and route-distance information are available, the forecast uses them together with the scheduled arrival and current delay. If the selected station is not in the train's route, the app clearly says so.

## 9. If you see an API error

Check these in order:

1. Worker is deployed.
2. `RAILRADAR_API_KEY` secret exists.
3. Secret is the current RailRadar key.
4. `RAILRADAR_PROXY_URL` in `app.js` is the correct Worker URL.
5. The train number is 5 digits.
6. Your RailRadar quota is not exhausted.

Never paste your RailRadar secret key into GitHub or into this chat.
