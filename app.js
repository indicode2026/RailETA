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

let allStations = [];
let visibleStations = [];

function setError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function loadStationDirectory() {
  setError("");
  statusEl.textContent = "Loading Indian railway stations…";
  try {
    const res = await fetch(`${WORKER_BASE}/stations/directory`);
    const body = await res.json();
    if (!res.ok || !body?.success) throw new Error(body?.error || `Station directory failed (HTTP ${res.status})`);

    allStations = Object.entries(body.data || {})
      .map(([code, name]) => ({ code: String(code).toUpperCase(), name: String(name) }))
      .filter(s => s.code && s.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    visibleStations = allStations;
    renderStations(visibleStations);
    statusEl.textContent = `${allStations.length.toLocaleString()} railway stations available. Search by station name or code.`;
  } catch (e) {
    setError(e.message || "Could not load the railway station directory.");
    statusEl.textContent = "Station directory unavailable.";
  }
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
    el.innerHTML = `<div class="stationMain"><div class="num">${i + 1}</div><div><div class="name">${escapeHtml(s.name)}</div><div class="meta">${escapeHtml(s.code)} · Indian Railways station</div></div></div><div class="arrow">→</div>`;
    el.addEventListener("click", () => loadBoard(s));
    listEl.appendChild(el);
  });
}

function searchStations() {
  const q = searchInput.value.trim().toLowerCase();
  setError("");
  if (!q) {
    renderStations(allStations);
    statusEl.textContent = `${allStations.length.toLocaleString()} railway stations available.`;
    return;
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const filtered = allStations.filter(s => {
    const hay = `${s.code} ${s.name}`.toLowerCase();
    return tokens.every(t => hay.includes(t));
  });

  renderStations(filtered);
  statusEl.textContent = filtered.length
    ? `Search results for “${searchInput.value.trim()}”.`
    : "No matching railway station found.";
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
