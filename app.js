const WORKER_BASE = "https://raileta.bharatchandrasirala.workers.dev";

const locationBtn = document.getElementById("locationBtn");
const refreshBtn = document.getElementById("refreshBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const listEl = document.getElementById("stationList");
const summaryEl = document.getElementById("summary");
const detailEl = document.getElementById("stationDetail");

let lastLocation = null;

function setError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function getStations(lat, lon) {
  const url = `${WORKER_BASE}/stations/nearby?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok || !body?.success) {
    const msg = body?.error || `Worker request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }
  return body;
}

function renderStations(data) {
  listEl.innerHTML = "";
  const stations = data.stations || [];
  if (!stations.length) {
    setError("No verified railway station with train timetable data was found within 200 km of this location.");
    resultsEl.hidden = false;
    return;
  }
  setError("");
  summaryEl.textContent = `Showing the nearest verified Indian railway stations. The first two are within 50 km when available; the third is the nearest additional station within 200 km.`;

  stations.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "station";
    const range = s.distanceKm <= 50 ? "Within 50 km" : "Within 200 km";
    el.innerHTML = `<div class="stationMain"><div class="num">${i+1}</div><div><div class="name">${escapeHtml(s.name)}</div><div class="meta">${escapeHtml(s.code)} · ${s.distanceKm} km · ${range}</div></div></div><div class="arrow">→</div>`;
    el.addEventListener("click", () => loadBoard(s));
    listEl.appendChild(el);
  });
  resultsEl.hidden = false;
}

async function loadBoard(station) {
  detailEl.hidden = false;
  detailEl.innerHTML = `<h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">Loading train timetable…</p>`;
  try {
    const boardRes = await fetch(`${WORKER_BASE}/train-station-board?code=${encodeURIComponent(station.code)}`);
    if (!boardRes.ok) throw new Error("Board route is unavailable");
    const body = await boardRes.json();
    renderBoard(station, body);
  } catch {
    // The current worker intentionally keeps discovery stable even if a board call
    // is unavailable. The station itself has already been validated against RailRadar.
    detailEl.innerHTML = `<h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">Verified railway station · ${station.distanceKm} km away</p><p>Use the station to continue to live train information.</p>`;
  }
}

function renderBoard(station, body) {
  const trains = body?.data?.trains || [];
  let html = `<h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">${station.distanceKm} km away</p>`;
  html += trains.slice(0,12).map(x => {
    const t=x.train||{}, stop=x.stop||{};
    return `<div class="train"><b>${escapeHtml(t.number||"")} · ${escapeHtml(t.name||"Train")}</b><span>Arrival ${escapeHtml(stop.arrival||"—")} · Departure ${escapeHtml(stop.departure||"—")}</span></div>`;
  }).join("");
  detailEl.innerHTML = html || `${html}<p class="meta">No timetable rows returned right now.</p>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function locate() {
  setError("");
  statusEl.textContent = "Requesting browser location…";
  if (!navigator.geolocation) {
    setError("This browser does not provide geolocation.");
    return;
  }
  navigator.geolocation.getCurrentPosition(async pos => {
    lastLocation = {lat: pos.coords.latitude, lon: pos.coords.longitude};
    statusEl.textContent = "Location received. Searching verified railway stations…";
    try {
      const data = await getStations(lastLocation.lat, lastLocation.lon);
      renderStations(data);
      statusEl.textContent = `Location: ${lastLocation.lat.toFixed(4)}, ${lastLocation.lon.toFixed(4)}`;
    } catch (e) {
      setError(e.message);
      statusEl.textContent = "Could not complete the railway-station search.";
      resultsEl.hidden = true;
    }
  }, err => {
    const messages = {
      1: "Location permission was denied. Allow location access and try again.",
      2: "Your location could not be determined.",
      3: "Location request timed out. Try again."
    };
    setError(messages[err.code] || "Could not get your location.");
    statusEl.textContent = "Location unavailable.";
  }, {enableHighAccuracy:true, timeout:15000, maximumAge:60000});
}

locationBtn.addEventListener("click", locate);
refreshBtn.addEventListener("click", () => { if (lastLocation) locate(); });
