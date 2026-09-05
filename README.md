# RailETA — Railway Passenger Station Edition

A no-login website for **Dynamic Forecast of Expected Time of Arrival (ETA) for Coaching Trains**.

## What this fixed edition does

- Finds nearby OpenStreetMap railway `station` and `halt` features.
- Excludes metro/subway/light-rail station types at the API query level.
- Applies an additional metro/tram/light-rail/monorail name/operator filter in the frontend.
- Removes duplicate OSM objects representing the same named station.
- Returns the 3 closest matching railway stations.
- Keeps the existing GPS → station → train-number → live RailRadar flow.
- Uses multiple public Overpass servers as automatic fallbacks, so a temporary outage of one server does not stop station lookup.

## Cloudflare Worker

The frontend is configured to use:

```text
https://raileta.bharatchandrasirala.workers.dev
```

The Worker needs this Cloudflare secret:

```text
RAILRADAR_API_KEY
```

Never put the RailRadar secret in `app.js` or GitHub.

## Files

- `index.html` — website
- `styles.css` — styling
- `app.js` — GPS, railway-station filtering, train API call and ETA
- `worker.js` — Cloudflare proxy for station discovery and RailRadar
- `wrangler.toml.example` — optional Wrangler configuration
- `README.md` — setup notes

## Deploy

### GitHub Pages frontend

Upload/commit all frontend files (`index.html`, `styles.css`, `app.js`) to the GitHub Pages repository.

### Cloudflare Worker

Upload/deploy `worker.js` to the existing `raileta` Worker. Keep the existing `RAILRADAR_API_KEY` secret.

Do not create another Worker unless necessary.

## Test station API directly

Replace the coordinates with any latitude/longitude:

```text
https://raileta.bharatchandrasirala.workers.dev/stations/nearby?lat=28.65&lon=77.12
```

A successful response is normal OpenStreetMap Overpass JSON with an `elements` array.

Opening only the Worker root URL is expected to show a JSON 404-style help message because `/` is not an application route.

## Test the website

1. Open the GitHub Pages website.
2. Click **Use My Location**.
3. Allow browser location access.
4. Select a real passenger railway station, not a metro station.
5. Enter a supported 5-digit train number.
6. RailETA requests live train data through the Cloudflare Worker.

## Important

The public Overpass services are external OpenStreetMap data services. RailETA uses fallback endpoints because public services can occasionally be busy or unavailable.

The ETA is a forecast based on the upstream live feed and is not an official railway guarantee.
