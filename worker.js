/**
 * RailETA Cloudflare Worker
 *
 * Secret required in Cloudflare:
 *   RAILRADAR_API_KEY
 *
 * Frontend calls:
 *   GET /stations/nearby?lat=...&lon=...
 *   GET /train/12919/live
 */

const ALLOWED_ORIGIN = "*";
const API_BASE = "https://api.railradar.in/v1";

// Public Overpass instances. We try them in order so a temporary outage or
// overloaded instance does not break the whole RailETA station finder.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

async function fetchNearbyStations(query) {
  const errors = [];

  for (const endpoint of OVERPASS_URLS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      const upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Accept": "application/json",
          "User-Agent": "RailETA/1.0 (railway ETA hackathon project)"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });

      clearTimeout(timer);
      const body = await upstream.text();

      if (upstream.ok) {
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
            ...corsHeaders()
          }
        });
      }

      errors.push(`${new URL(endpoint).hostname}: HTTP ${upstream.status}`);
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return json({
    success: false,
    error: "Nearby railway station service is temporarily unavailable.",
    detail: errors.join(" | ")
  }, 502);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ success: false, error: "Method not allowed" }, 405);
    }

    const stationPath = url.pathname.replace(/\/$/, "");
    if (stationPath === "/stations/nearby") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return json({ success: false, error: "Valid lat and lon query parameters are required." }, 400);
      }

      // Only mapped passenger railway stations and halts.
      // Metro/subway/light-rail station objects are excluded at source.
      const query = `
[out:json][timeout:20];
(
  node["railway"~"^(station|halt)$"]["station"!="subway"]["station"!="light_rail"](around:50000,${lat},${lon});
  way["railway"~"^(station|halt)$"]["station"!="subway"]["station"!="light_rail"](around:50000,${lat},${lon});
  relation["railway"~"^(station|halt)$"]["station"!="subway"]["station"!="light_rail"](around:50000,${lat},${lon});
);
out center tags;
`;

      return fetchNearbyStations(query);
    }

    const match = url.pathname.match(/^\/train\/(\d{5})\/live\/?$/);
    if (!match) {
      return json({
        success: false,
        error: "Use GET /stations/nearby?lat=...&lon=... or /train/{5-digit-number}/live"
      }, 404);
    }

    if (!env.RAILRADAR_API_KEY) {
      return json({
        success: false,
        error: "RAILRADAR_API_KEY secret is not configured in Cloudflare."
      }, 500);
    }

    const trainNumber = match[1];
    const target = `${API_BASE}/trains/${trainNumber}/live${url.search}`;

    try {
      const upstream = await fetch(target, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${env.RAILRADAR_API_KEY}`,
          "Accept": "application/json"
        }
      });

      const body = await upstream.text();

      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          ...corsHeaders()
        }
      });
    } catch (error) {
      return json({
        success: false,
        error: "Could not reach RailRadar.",
        detail: error instanceof Error ? error.message : String(error)
      }, 502);
    }
  }
};
