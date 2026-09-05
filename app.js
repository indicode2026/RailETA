const WORKER_BASE = "https://raileta.bharatchandrasirala.workers.dev";

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const listEl = document.getElementById("stationList");
const summaryEl = document.getElementById("summary");
const detailEl = document.getElementById("stationDetail");

const FALLBACK_STATIONS = [{"code": "NDLS", "name": "New Delhi", "city": "Delhi"}, {"code": "NZM", "name": "Hazrat Nizamuddin", "city": "Delhi"}, {"code": "DLI", "name": "Old Delhi Junction", "city": "Delhi"}, {"code": "DEE", "name": "Delhi Sarai Rohilla", "city": "Delhi"}, {"code": "ANVT", "name": "Anand Vihar Terminal", "city": "Delhi"}, {"code": "AGC", "name": "Agra Cantt", "city": "Agra"}, {"code": "CNB", "name": "Kanpur Central", "city": "Kanpur"}, {"code": "LKO", "name": "Lucknow", "city": "Lucknow"}, {"code": "HWH", "name": "Howrah Junction", "city": "Kolkata"}, {"code": "SDAH", "name": "Sealdah", "city": "Kolkata"}, {"code": "BCT", "name": "Mumbai Central", "city": "Mumbai"}, {"code": "CSMT", "name": "Chhatrapati Shivaji Maharaj Terminus", "city": "Mumbai"}, {"code": "MMCT", "name": "Mumbai Central", "city": "Mumbai"}, {"code": "PUNE", "name": "Pune Junction", "city": "Pune"}, {"code": "ADI", "name": "Ahmedabad Junction", "city": "Ahmedabad"}, {"code": "JP", "name": "Jaipur Junction", "city": "Jaipur"}, {"code": "BPL", "name": "Bhopal Junction", "city": "Bhopal"}, {"code": "INDB", "name": "Indore Junction", "city": "Indore"}, {"code": "JBP", "name": "Jabalpur Junction", "city": "Jabalpur"}, {"code": "NGP", "name": "Nagpur Junction", "city": "Nagpur"}, {"code": "HYB", "name": "Hyderabad Deccan", "city": "Hyderabad"}, {"code": "SC", "name": "Secunderabad Junction", "city": "Hyderabad"}, {"code": "MAS", "name": "Chennai Central", "city": "Chennai"}, {"code": "SBC", "name": "KSR Bengaluru City Junction", "city": "Bengaluru"}, {"code": "YPR", "name": "Yesvantpur Junction", "city": "Bengaluru"}, {"code": "VSKP", "name": "Visakhapatnam", "city": "Visakhapatnam"}, {"code": "BBS", "name": "Bhubaneswar", "city": "Bhubaneswar"}, {"code": "PURI", "name": "Puri", "city": "Puri"}, {"code": "GKP", "name": "Gorakhpur Junction", "city": "Gorakhpur"}, {"code": "PNBE", "name": "Patna Junction", "city": "Patna"}];

let allStations = FALLBACK_STATIONS.slice();
let visibleStations = allStations.slice();

function setError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function normalizeStationList(data) {
  const raw =
    Array.isArray(data) ? data :
    Array.isArray(data?.stations) ? data.stations :
    Array.isArray(data?.results) ? data.results :
    data && typeof data === "object" ? Object.entries(data).map(([code, value]) => {
      if (value && typeof value === "object") return { code, ...value };
      return { code, name: value };
    }) : [];

  return raw.map(x => {
    if (typeof x === "string") return { code: "", name: x };
    const code = x?.code || x?.stationCode || x?.station_code || x?.station_code_name || "";
    const name = x?.name || x?.stationName || x?.station_name || x?.label || "";
    const city = x?.city || x?.cityName || "";
    return { code: String(code).toUpperCase(), name: String(name), city: String(city) };
  }).filter(s => s.name || s.code);
}

async function loadStationDirectory() {
  setError("");
  // Never leave the user with a blank screen while the remote directory loads.
  allStations = FALLBACK_STATIONS.slice();
  renderStations(allStations);
  statusEl.textContent = `${allStations.length} popular railway stations shown. Loading the full directory…`;

  try {
    const res = await fetch(`${WORKER_BASE}/stations/directory`, { cache: "no-store" });
    const body = await res.json();
    if (!res.ok || !body?.success) throw new Error(body?.error?.message || body?.error || `Station directory failed (HTTP ${res.status})`);

    const remote = normalizeStationList(body.data).map(s => ({
      ...s,
      name: s.name || s.code
    }));

    const merged = new Map();
    [...FALLBACK_STATIONS, ...remote].forEach(s => {
      const key = s.code || `${s.name}|${s.city}`;
      if (!merged.has(key)) merged.set(key, s);
    });

    allStations = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
    renderStations(allStations);
    statusEl.textContent = `${allStations.length.toLocaleString()} railway stations available. Search by station name, city, or code.`;
  } catch (e) {
    // Keep the fallback stations visible; search can still work for common stations.
    allStations = FALLBACK_STATIONS.slice();
    renderStations(allStations);
    statusEl.textContent = `Showing ${allStations.length} popular railway stations. Search also works through the live station directory.`;
  }
}

async function searchRemoteStations(q) {
  const res = await fetch(`${WORKER_BASE}/stations/search?q=${encodeURIComponent(q)}&limit=50`, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message || body?.error || `Station search failed (HTTP ${res.status})`);
  }
  return normalizeStationList(body.data).map(s => ({ ...s, name: s.name || s.code }));
}

function renderStations(stations) {
  listEl.innerHTML = "";
  visibleStations = stations;
  resultsEl.hidden = false;

  if (!stations.length) {
    summaryEl.textContent = "No railway station matched your search.";
    listEl.innerHTML = `<div class="empty">Try a station name, city name, or station code such as <b>NDLS</b>.</div>`;
    return;
  }

  const limited = stations.slice(0, 100);
  summaryEl.textContent = stations.length > 100
    ? `Found ${stations.length.toLocaleString()} stations. Showing the first 100 — refine your search for a shorter list.`
    : `${stations.length.toLocaleString()} railway station${stations.length === 1 ? "" : "s"} found.`;

  limited.forEach((s, i) => {
    const el = document.createElement("button");
    el.className = "station";
    el.type = "button";
    el.innerHTML = `<div class="stationMain"><div class="num">${i + 1}</div><div><div class="name">${escapeHtml(s.name)}</div><div class="meta">${escapeHtml(s.code)}${s.city ? ` · ${escapeHtml(s.city)}` : ""} · Indian Railways station</div></div></div><div class="arrow">→</div>`;
    el.addEventListener("click", () => loadBoard(s));
    listEl.appendChild(el);
  });
}

async function searchStations() {
  const q = searchInput.value.trim();
  setError("");

  if (!q) {
    renderStations(allStations);
    statusEl.textContent = `${allStations.length.toLocaleString()} railway stations available.`;
    return;
  }

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  const local = allStations.filter(s => {
    const hay = `${s.code} ${s.name} ${s.city || ""}`.toLowerCase();
    return tokens.every(t => hay.includes(t));
  });

  if (local.length) {
    renderStations(local);
    statusEl.textContent = `Search results for “${q}”.`;
    return;
  }

  try {
    const remote = await searchRemoteStations(q);
    renderStations(remote);
    statusEl.textContent = remote.length
      ? `Search results for “${q}”.`
      : "No matching railway station found.";
  } catch (e) {
    // If the live API is temporarily unavailable, search the built-in station list.
    const fallback = FALLBACK_STATIONS.filter(s => {
      const hay = `${s.code} ${s.name} ${s.city}`.toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
    renderStations(fallback);
    statusEl.textContent = fallback.length
      ? `Showing built-in results for “${q}”.`
      : "No matching railway station found.";
    if (!fallback.length) setError("Live station search is temporarily unavailable.");
  }
}

async function loadBoard(station) {
  detailEl.hidden = false;
  detailEl.innerHTML = `<h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">Loading trains at this station…</p>`;
  detailEl.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const boardRes = await fetch(`${WORKER_BASE}/train-station-board?code=${encodeURIComponent(station.code)}`);
    const body = await boardRes.json();
    if (!boardRes.ok || !body?.success) throw new Error(body?.error || `Board request failed (HTTP ${boardRes.status})`);
    renderBoard(station, body);
  } catch (e) {
    detailEl.innerHTML = `<h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">Railway station selected.</p><p class="boardError">Train timetable could not be loaded right now. ${escapeHtml(e.message || "Please try again.")}</p>`;
  }
}

function renderBoard(station, body) {
  const trains = body?.data?.trains || [];
  let html = `<div class="detailHead"><div><h3>${escapeHtml(station.name)} (${escapeHtml(station.code)})</h3><p class="meta">Scheduled trains at this station</p></div><button class="secondary small" type="button" onclick="document.getElementById('stationDetail').hidden=true">Close</button></div>`;
  html += trains.slice(0, 20).map(x => {
    const t = x.train || {}, stop = x.stop || {};
    return `<div class="train"><b>${escapeHtml(t.number || "")} · ${escapeHtml(t.name || "Train")}</b><span>Arrival ${escapeHtml(stop.arrival || "—")} · Departure ${escapeHtml(stop.departure || "—")}${stop.platform ? ` · Platform ${escapeHtml(stop.platform)}` : ""}</span></div>`;
  }).join("");
  detailEl.innerHTML = html + (trains.length ? "" : `<p class="meta empty">No timetable rows returned right now.</p>`);
}

searchBtn.addEventListener("click", searchStations);
searchInput.addEventListener("input", searchStations);
searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") searchStations();
  if (e.key === "Escape") {
    searchInput.value = "";
    searchStations();
  }
});
clearBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchStations();
  searchInput.focus();
});

loadStationDirectory();
