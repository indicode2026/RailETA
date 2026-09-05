# RailETA — GitHub + Cloudflare final package

This package is intentionally flat so it can be uploaded directly to the root of the `indicode2026/RailETA` GitHub repository.

## Website
- `index.html`
- `app.js`
- `styles.css`

GitHub Pages can serve the repository root directly.

## Cloudflare Worker
- `worker.js`
- `wrangler.toml`

Cloudflare Workers Git deployment should use:
- Root directory: `/`
- Build command: leave empty / none
- Deploy command: `npx wrangler deploy`
- Main entry: `worker.js`

## Required Cloudflare secret
Create a Worker secret named exactly:

`RAILRADAR_API_KEY`

Do not put the API key in GitHub or frontend JavaScript.

## API routes
- `GET /health`
- `GET /stations/nearby?lat=28.6139&lon=77.2090`
- `GET /train-station-board?code=NDLS`
- `GET /train/12919/live`

## Station selection rule
1. Read the user's browser location.
2. Discover Indian railway stations within 200 km using OpenStreetMap/Overpass.
3. Exclude stations tagged as subway, light rail, or tram and obvious metro/subway names.
4. Verify candidates against RailRadar station timetable data.
5. Return the nearest two verified railway stations inside 50 km, when two exist.
6. Return the nearest additional verified railway station beyond 50 km and up to 200 km, when one exists.

Distances are straight-line geographic distances, not road/driving distances.

## Important
If fewer than two qualifying railway stations exist inside 50 km, the API does not invent stations. It returns the qualifying stations it can verify, plus the nearest additional station within 200 km when available.
