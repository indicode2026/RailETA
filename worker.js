const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const RAILRADAR_BASE = "https://api.railradar.in/v1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const p1 = aLat * Math.PI / 180;
  const p2 = bLat * Math.PI / 180;
  const dp = (bLat - aLat) * Math.PI / 180;
  const dl = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function normalizeName(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/junction|jn\.?|railway|rail\s*station|station|halt|terminal/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isRealRailwayStation(tags = {}) {
  const railway = String(tags.railway || "").toLowerCase();
  const stationType = String(tags.station || "").toLowerCase();
  const transit = String(tags["public_transport"] || "").toLowerCase();
  const name = String(tags.name || tags["name:en"] || "").toLowerCase();

  if (!(["station", "halt"].includes(railway))) return false;
  if (["subway", "light_rail", "tram"].includes(stationType)) return false;
  if (transit === "stop_position" && railway !== "station") return false;
  if (/\b(metro|subway|underground|light\s*rail|tram)\b/i.test(name)) return false;
  return true;
}

function candidateFromElement(el, userLat, userLon) {
  const tags = el.tags || {};
  if (!isRealRailwayStation(tags)) return null;
  const lat = Number(el.lat ?? el.center?.lat);
  const lon = Number(el.lon ?? el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = tags.name || tags["name:en"] || tags["name:hi"];
  if (!name) return null;
  return {
    name: String(name),
    lat,
    lon,
    codeHint: String(tags["railway:ref"] || tags.ref || tags["ref:station"] || "").toUpperCase(),
    distanceKm: haversineKm(userLat, userLon, lat, lon)
  };
}

async function fetchOverpass(lat, lon) {
  const query = `[out:json][timeout:45];node["railway"~"^(station|halt)$"](around:200000,${lat},${lon});out tags;`;
  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8", "Accept": "application/json" },
        body: query
      });
      if (!response.ok) {
        lastError = new Error(`Overpass HTTP ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("All railway-station data providers are unavailable");
}

async function railRadar(path, env) {
  const key = env.RAILRADAR_API_KEY;
  if (!key) throw Object.assign(new Error("RAILRADAR_API_KEY is missing in Cloudflare Worker Secrets"), { status: 500 });
  const response = await fetch(`${RAILRADAR_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { success: false, error: text || "Invalid RailRadar response" }; }
  if (!response.ok) {
    const message = body?.error?.message || body?.error || `RailRadar HTTP ${response.status}`;
    throw Object.assign(new Error(String(message)), { status: response.status, body });
  }
  return body;
}

function stationHit(body) {
  const data = body?.data;
  const list = Array.isArray(data) ? data :
    Array.isArray(data?.stations) ? data.stations :
    Array.isArray(data?.results) ? data.results : [];
  const x = list[0];
  if (!x) return null;
  if (typeof x === "string") return { code: x.toUpperCase(), name: x };
  const code = x.code || x.stationCode || x.station_code;
  const name = x.name || x.stationName || x.station_name;
  return code ? { code: String(code).toUpperCase(), name: String(name || code) } : null;
}

async function resolveStation(candidate, env) {
  // A trustworthy OSM station code is the cheapest and most accurate path.
  if (/^[A-Z0-9]{1,10}$/.test(candidate.codeHint)) {
    try {
      const body = await railRadar(`/stations/${candidate.codeHint}/trains`, env);
      if (body?.success !== false && Array.isArray(body?.data?.trains)) {
        return { code: candidate.codeHint, name: body?.data?.station?.name || candidate.name };
      }
    } catch (_) {}
  }

  // RailRadar's official station autocomplete endpoint handles name variants.
  const q = encodeURIComponent(candidate.name);
  try {
    const body = await railRadar(`/lookup/search/stations?q=${q}&limit=5`, env);
    const hits = body?.data;
    const list = Array.isArray(hits) ? hits :
      Array.isArray(hits?.stations) ? hits.stations :
      Array.isArray(hits?.results) ? hits.results : [];
    const target = normalizeName(candidate.name);
    const ordered = list.map(x => typeof x === "string" ? { code: x, name: x } : x).filter(Boolean);
    ordered.sort((a, b) => {
      const an = normalizeName(a.name || a.stationName || a.station_name || "");
      const bn = normalizeName(b.name || b.stationName || b.station_name || "");
      return Number(bn === target) - Number(an === target) || Number(bn.includes(target)) - Number(an.includes(target));
    });
    const hit = ordered[0];
    if (!hit) return null;
    const code = hit.code || hit.stationCode || hit.station_code;
    if (!code) return null;
    return { code: String(code).toUpperCase(), name: String(hit.name || hit.stationName || hit.station_name || candidate.name) };
  } catch (_) {
    return null;
  }
}

async function hasTrainService(code, env) {
  try {
    const body = await railRadar(`/stations/${encodeURIComponent(code)}/trains`, env);
    return body?.success !== false && Array.isArray(body?.data?.trains) && body.data.trains.length > 0;
  } catch (_) {
    return false;
  }
}

async function findNearby(lat, lon, env) {
  const osm = await fetchOverpass(lat, lon);
  const unique = new Map();
  for (const element of (osm.elements || [])) {
    const candidate = candidateFromElement(element, lat, lon);
    if (!candidate || candidate.distanceKm > 200) continue;
    const key = `${normalizeName(candidate.name)}|${candidate.lat.toFixed(4)}|${candidate.lon.toFixed(4)}`;
    if (!unique.has(key)) unique.set(key, candidate);
  }

  const candidates = [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  const within50 = [];
  const within200 = [];
  const usedCodes = new Set();

  // Only inspect the closest candidates. This prevents a single request from
  // burning the RailRadar quota while still giving enough room to find valid stations.
  for (const candidate of candidates.slice(0, 18)) {
    if (within50.length >= 2 && within200.length >= 1) break;
    const resolved = await resolveStation(candidate, env);
    if (!resolved || usedCodes.has(resolved.code)) continue;
    if (!(await hasTrainService(resolved.code, env))) continue;

    const station = {
      name: resolved.name,
      code: resolved.code,
      lat: candidate.lat,
      lon: candidate.lon,
      distanceKm: Number(candidate.distanceKm.toFixed(1)),
      range: candidate.distanceKm <= 50 ? "within_50km" : "within_200km"
    };
    usedCodes.add(resolved.code);
    if (candidate.distanceKm <= 50 && within50.length < 2) within50.push(station);
    else if (candidate.distanceKm > 50 && within200.length < 1) within200.push(station);
  }

  within50.sort((a, b) => a.distanceKm - b.distanceKm);
  within200.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    success: true,
    location: { lat, lon },
    stations: [...within50, ...within200],
    rules: {
      firstTwo: "nearest verified railway stations within 50 km",
      third: "nearest additional verified railway station between 50 km and 200 km",
      metroExcluded: true
    },
    message: "Distances are geographic straight-line distances."
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ success: true, service: "RailETA Worker", status: "ok", version: "final-1" });
    }

    if (url.pathname === "/stations/nearby" || url.pathname === "/api/stations/nearby") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return json({ success: false, error: "Valid lat and lon are required" }, 400);
      }
      try {
        return json(await findNearby(lat, lon, env));
      } catch (error) {
        return json({ success: false, error: error?.message || "Could not retrieve nearby railway stations" }, error?.status >= 400 && error.status < 600 ? error.status : 502);
      }
    }

    if (url.pathname === "/train-station-board") {
      const code = String(url.searchParams.get("code") || "").toUpperCase();
      if (!/^[A-Z0-9]{1,10}$/.test(code)) return json({ success: false, error: "Valid station code required" }, 400);
      try { return json(await railRadar(`/stations/${code}/trains`, env)); }
      catch (error) { return json({ success: false, error: error.message }, error.status || 502); }
    }

    const live = url.pathname.match(/^\/train\/(\d{5})\/live$/);
    if (live) {
      try { return json(await railRadar(`/trains/${live[1]}/live`, env)); }
      catch (error) { return json({ success: false, error: error.message }, error.status || 502); }
    }

    return json({ success: false, error: "Route not found", routes: ["/health", "/stations/nearby?lat=...&lon=...", "/train-station-board?code=NDLS", "/train/12919/live"] }, 404);
  }
};
