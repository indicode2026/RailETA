# RailETA

Railway station search and train timetable web app for Indian Railways.

## User flow

1. No browser location permission is requested.
2. The app loads the Indian railway station directory through the Cloudflare Worker.
3. The user searches by station name, city, or station code.
4. The user selects a station.
5. The app loads that station's scheduled trains.

## Cloudflare Worker

Required secret:

`RAILRADAR_API_KEY`

Routes:

- `/health`
- `/stations/directory`
- `/train-station-board?code=NDLS`
- `/train/12919/live`
