# RailETA — Railway Passenger Station Edition

A no-login website for **Dynamic Forecast of Expected Time of Arrival (ETA) for Coaching Trains**.

## What is fixed in this edition

The nearby-station finder is now explicitly focused on **passenger railway stations / halts**, not metro.

It:

- searches OpenStreetMap railway `station` and `halt` features
- excludes records containing Metro, Subway, Tram, Light Rail, Monorail, Rapid Transit, etc.
- excludes common metro-style operator/network/station tags
- removes duplicate OSM objects for the same named station
- returns the 3 closest matching railway stations
- keeps the existing GPS → station → train-number → live RailRadar flow

## Your Cloudflare Worker is already configured

`app.js` is preconfigured with the production Worker URL:

```text
https://raileta.bharatchandrasirala.workers.dev
```

Do not put the RailRadar secret in `app.js`.

Your Cloudflare Worker should have this secret:

```text
RAILRADAR_API_KEY
```

## Files

- `index.html` — website
- `styles.css` — styling
- `app.js` — GPS, strict railway-station discovery, train API call and ETA
- `worker.js` — Cloudflare proxy for RailRadar
- `wrangler.toml.example` — optional Wrangler configuration
- `README.md` — setup notes

## Deploy

1. Replace the existing GitHub repository files with these files.
2. Commit the changes.
3. Cloudflare Workers & Pages should deploy the connected repository.
4. Confirm the Worker has `RAILRADAR_API_KEY` under Variables and Secrets.
5. Keep the production `workers.dev` URL enabled.

## Test

Open the GitHub Pages website, allow location, select a railway station, then enter a supported 5-digit train number such as:

```text
12919
```

The live response can show train name/number, delay, current position, speed, next halt, route, scheduled/actual times, platform and diversion information when supplied by RailRadar.

## Important GPS note

The browser supplies the user's location. On a desktop computer, location can sometimes be approximate. If the coordinates shown by the app are wrong, enable Windows Location Services and allow Chrome location access.

## ETA note

RailETA's ETA is a forecast based on the upstream live data and is not an official railway guarantee.

## Security

Never commit `RAILRADAR_API_KEY` to GitHub or paste it into frontend JavaScript.
