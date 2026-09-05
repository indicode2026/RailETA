import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";

/*
  Firebase web configuration supplied for the RailETA project.
  Firebase Auth is intentionally NOT used: this website has no login/signup.
*/
const firebaseConfig = {
  apiKey: "AIzaSyDDyMvsTfuJuSlTQ4ImufwP6xeI73SqiE4",
  authDomain: "raileta-c9460.firebaseapp.com",
  projectId: "raileta-c9460",
  storageBucket: "raileta-c9460.firebasestorage.app",
  messagingSenderId: "875992250345",
  appId: "1:875992250345:web:0ae897e3c4553bbaae7d78",
  measurementId: "G-BSTZYH0BBZ"
};

const app = initializeApp(firebaseConfig);
analyticsSupported().then(ok => { if (ok) getAnalytics(app); }).catch(() => {});

/*
  IMPORTANT:
  Put ONLY your Cloudflare Worker URL here.
  Never put the RailRadar secret key in this file.
*/
const RAILRADAR_PROXY_URL = "https://raileta.bharatchandrasirala.workers.dev";

const els = {
  locationStep: document.getElementById("locationStep"),
  stationsStep: document.getElementById("stationsStep"),
  trainStep: document.getElementById("trainStep"),
  loadingStep: document.getElementById("loadingStep"),
  errorBox: document.getElementById("errorBox"),
  resultStep: document.getElementById("resultStep"),
  locateBtn: document.getElementById("locateBtn"),
  refreshStationsBtn: document.getElementById("refreshStationsBtn"),
  changeStationBtn: document.getElementById("changeStationBtn"),
  locationStatus: document.getElementById("locationStatus"),
  locationSummary: document.getElementById("locationSummary"),
  stationList: document.getElementById("stationList"),
  selectedStationName: document.getElementById("selectedStationName"),
  selectedStationCode: document.getElementById("selectedStationCode"),
  trainForm: document.getElementById("trainForm"),
  trainInput: document.getElementById("trainInput"),
  trainName: document.getElementById("trainName"),
  trainMeta: document.getElementById("trainMeta"),
  etaValue: document.getElementById("etaValue"),
  etaNote: document.getElementById("etaNote"),
  currentLocation: document.getElementById("currentLocation"),
  nextStation: document.getElementById("nextStation"),
  currentSpeed: document.getElementById("currentSpeed"),
  currentDelay: document.getElementById("currentDelay"),
  targetStation: document.getElementById("targetStation"),
  scheduledArrival: document.getElementById("scheduledArrival"),
  route: document.getElementById("route"),
  lastUpdated: document.getElementById("lastUpdated"),
  sourceLabel: document.getElementById("sourceLabel"),
  diversionBox: document.getElementById("diversionBox"),
  refreshTrainBtn: document.getElementById("refreshTrainBtn")
};

let userCoords = null;
let selectedStation = null;
let currentTrainNumber = null;
let lastTrainPayload = null;

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function setError(message) {
  els.errorBox.textContent = message;
  show(els.errorBox);
}

function clearError() {
  hide(els.errorBox);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const r = 6371;
  const dLat = (lat2-lat1) * Math.PI / 180;
  const dLon = (lon2-lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/*
  Railway-only Overpass query.
  railway=station / railway=halt are included.
  Metro/subway objects are explicitly excluded.
*/
async function findNearbyRailwayStations(lat, lon) {
  /*
    Search only real railway station/halt features from OpenStreetMap.
    We deliberately reject metro/subway/tram/light-rail style records and
    common metro operators/names. This keeps the result focused on places
    where passenger railway trains stop.
  */
  const query = `
[out:json][timeout:30];
(
  node["railway"~"^(station|halt)$"](around:50000,${lat},${lon});
  way["railway"~"^(station|halt)$"](around:50000,${lat},${lon});
  relation["railway"~"^(station|halt)$"](around:50000,${lat},${lon});
);
out center tags;
`;

  const response = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });

  if (!response.ok) throw new Error("Could not retrieve nearby railway stations.");

  const data = await response.json();

  const metroPattern =
    /\b(metro|subway|underground|tram|light[\s-]?rail|monorail|rapid transit|rapid metro)\b/i;

  const stations = data.elements.map(item => {
    const tags = item.tags || {};
    const itemLat = item.lat ?? item.center?.lat;
    const itemLon = item.lon ?? item.center?.lon;

    const name = tags.name || tags["name:en"] || tags.short_name || "";
    const operator = tags.operator || tags.network || "";
    const railway = tags.railway || "";
    const stationType = tags.station || "";
    const publicTransport = tags.public_transport || "";

    const metroLike =
      metroPattern.test(name) ||
      metroPattern.test(operator) ||
      metroPattern.test(stationType) ||
      metroPattern.test(publicTransport) ||
      /^(subway|tram|light_rail|monorail)$/i.test(railway);

    /*
      Prefer actual named railway stations over unnamed halts.
      This does NOT change the distance calculation; it only breaks ties
      between similarly close candidates.
    */
    const stationPriority = railway.toLowerCase() === "station" ? 0 : 1;

    return {
      id: item.id,
      name: name || "Railway Station",
      code: tags["railway:ref"] || tags.ref || tags["uic_ref"] || "",
      lat: itemLat,
      lon: itemLon,
      railwayType: railway,
      stationPriority,
      distance: haversineKm(lat, lon, itemLat, itemLon),
      metroLike
    };
  })
  .filter(s =>
    Number.isFinite(s.lat) &&
    Number.isFinite(s.lon) &&
    s.name &&
    !s.metroLike
  )
  .sort((a, b) => {
    const distanceDiff = a.distance - b.distance;
    if (Math.abs(distanceDiff) > 0.05) return distanceDiff;
    return a.stationPriority - b.stationPriority;
  });

  /*
    Deduplicate nearby OSM objects representing the same physical station.
    A 300 m radius is used so multiple mapped station objects do not occupy
    all three result slots.
  */
  const unique = [];

  for (const station of stations) {
    const duplicate = unique.some(existing =>
      haversineKm(existing.lat, existing.lon, station.lat, station.lon) < 0.30 &&
      existing.name.toLowerCase() === station.name.toLowerCase()
    );

    if (!duplicate) {
      unique.push(station);
    }

    if (unique.length === 3) break;
  }

  return unique;
}

function renderStations(stations) {
  els.stationList.innerHTML = "";

  if (!stations.length) {
    els.stationList.innerHTML = `
      <div class="empty-card">
        <strong>No railway stations found nearby.</strong>
        <p>Try refreshing your location or moving the search area.</p>
      </div>`;
    return;
  }

  stations.forEach((station, index) => {
    const button = document.createElement("button");
    button.className = "station-card";
    button.type = "button";
    button.innerHTML = `
      <div class="station-number">${index + 1}</div>
      <div class="station-main">
        <strong>${escapeHtml(station.name)}</strong>
        <span>${station.code ? escapeHtml(station.code) : "Passenger railway station"} · ${station.distance.toFixed(1)} km away</span>
      </div>
      <div class="arrow">→</div>
    `;
    button.addEventListener("click", () => selectStation(station));
    els.stationList.appendChild(button);
  });
}

async function locateAndLoadStations() {
  clearError();
  if (!navigator.geolocation) {
    setError("This browser does not support location access.");
    return;
  }

  els.locateBtn.disabled = true;
  els.locateBtn.innerHTML = `<span class="mini-spinner"></span> Finding stations…`;
  els.locationStatus.textContent = "Requesting your browser location…";

  navigator.geolocation.getCurrentPosition(async position => {
    userCoords = {
      lat: position.coords.latitude,
      lon: position.coords.longitude
    };

    els.locationStatus.textContent = "Location received. Searching railway stations…";

    try {
      const stations = await findNearbyRailwayStations(userCoords.lat, userCoords.lon);
      els.locationSummary.textContent =
        `Found ${stations.length} nearby passenger railway station${stations.length === 1 ? "" : "s"} around ${userCoords.lat.toFixed(3)}, ${userCoords.lon.toFixed(3)}.`;
      renderStations(stations);
      show(els.stationsStep);
      els.stationsStep.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setError(error.message || "Unable to find nearby railway stations.");
    } finally {
      els.locateBtn.disabled = false;
      els.locateBtn.innerHTML = `<span>📍</span> Use My Location`;
    }
  }, error => {
    els.locateBtn.disabled = false;
    els.locateBtn.innerHTML = `<span>📍</span> Use My Location`;
    const messages = {
      1: "Location permission was denied. Allow location access in your browser and try again.",
      2: "Your location could not be determined. Please try again.",
      3: "Location request timed out. Please try again."
    };
    setError(messages[error.code] || "Unable to access your location.");
    els.locationStatus.textContent = "Location access is required for nearby-station detection.";
  }, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000
  });
}

function selectStation(station) {
  selectedStation = station;
  els.selectedStationName.textContent = station.name;
  els.selectedStationCode.textContent = station.code || "Passenger railway station";
  hide(els.stationsStep);
  show(els.trainStep);
  clearError();
  els.trainInput.focus();
  els.trainStep.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function getStationName(routeItem) {
  return routeItem?.stationName || routeItem?.name || routeItem?.stationCode || "Unknown";
}

function getTargetRouteIndex(route) {
  if (!selectedStation || !Array.isArray(route)) return -1;
  const targetCode = String(selectedStation.code || "").toUpperCase();
  if (!targetCode) return -1;

  return route.findIndex(item =>
    String(item.stationCode || "").toUpperCase() === targetCode
  );
}

function calculateEta(data) {
  const route = Array.isArray(data.route) ? data.route : [];
  const targetIndex = getTargetRouteIndex(route);

  if (targetIndex < 0) {
    return {
      text: "—",
      note: "Selected station is not present in this train's route.",
      confidence: "unknown"
    };
  }

  const target = route[targetIndex];
  const current = data.currentLocation || {};
  const currentCode = String(current.stationCode || "").toUpperCase();
  const currentIndex = route.findIndex(item =>
    String(item.stationCode || "").toUpperCase() === currentCode
  );

  if (currentIndex >= 0 && targetIndex < currentIndex) {
    return {
      text: "Passed",
      note: "This train has already passed the selected station.",
      confidence: "passed"
    };
  }

  /*
    Dynamic forecast:
    - Start with the target's scheduled arrival + current delay.
    - If live route distance/speed is available, use remaining distance
      from the current position to the target to make the estimate responsive
      to current speed.
  */
  let forecast = target.actualArrival ? new Date(target.actualArrival) : null;

  if (!forecast || Number.isNaN(forecast.getTime())) {
    const scheduled = target.scheduledArrival || target.scheduledDeparture;
    if (!scheduled) {
      return { text: "Unavailable", note: "No arrival time is available from the live feed.", confidence: "unknown" };
    }

    forecast = new Date(scheduled);
    const delay = Number(data.delayMinutes);
    if (Number.isFinite(delay)) forecast = new Date(forecast.getTime() + delay * 60000);
  }

  if (currentIndex >= 0 && targetIndex > currentIndex) {
    const currentItem = route[currentIndex];
    const currentDistance = Number(currentItem.distance);
    const targetDistance = Number(target.distance);
    const speed = Number(current.speedKmh) || Number(currentItem.speedToNextStationKmph);

    if (Number.isFinite(currentDistance) && Number.isFinite(targetDistance) && speed > 10) {
      let remainingKm = targetDistance - currentDistance;

      const progress = Number(current.segmentProgress);
      if (Number.isFinite(progress) && currentIndex + 1 < route.length) {
        const nextDistance = Number(route[currentIndex + 1].distance);
        if (Number.isFinite(nextDistance) && nextDistance > currentDistance && progress >= 0 && progress <= 1) {
          const travelledInSegment = (nextDistance - currentDistance) * progress;
          remainingKm = Math.max(0, targetDistance - (currentDistance + travelledInSegment));
        }
      }

      const liveMinutes = (remainingKm / speed) * 60;
      const scheduleBase = target.scheduledArrival || target.scheduledDeparture;
      if (scheduleBase) {
        const scheduledTime = new Date(scheduleBase);
        const delay = Number(data.delayMinutes) || 0;
        const liveBased = new Date(Date.now() + liveMinutes * 60000 + delay * 60000);
        const scheduledBased = new Date(scheduledTime.getTime() + delay * 60000);

        // Blend schedule and live speed instead of replacing the railway schedule entirely.
        forecast = new Date((liveBased.getTime() * 0.65) + (scheduledBased.getTime() * 0.35));
      }
    }
  }

  const diff = Math.round((forecast.getTime() - Date.now()) / 60000);

  return {
    text: formatTime(forecast.toISOString()),
    note: diff >= 0
      ? `Estimated in about ${diff} min · based on live speed, route distance and current delay`
      : "Estimated arrival time has already elapsed; refresh for the newest live position.",
    confidence: "live"
  };
}

function renderRoute(route, currentLocation) {
  if (!Array.isArray(route) || !route.length) {
    els.route.innerHTML = `<div class="empty-card">Route data is not available.</div>`;
    return;
  }

  const currentSeq = Number(currentLocation?.sequence);
  const targetCode = String(selectedStation?.code || "").toUpperCase();

  els.route.innerHTML = route.map(item => {
    const seq = Number(item.sequence);
    const code = String(item.stationCode || "").toUpperCase();
    const passed = Number.isFinite(currentSeq) && Number.isFinite(seq) && seq < currentSeq;
    const current = Number.isFinite(currentSeq) && Number.isFinite(seq) && seq === currentSeq;
    const target = targetCode && code === targetCode;

    let cls = "route-stop";
    if (passed) cls += " passed";
    if (current) cls += " current";
    if (target) cls += " target";

    return `
      <div class="${cls}">
        <div class="dot">${current ? "●" : passed ? "✓" : target ? "◎" : "○"}</div>
        <div class="stop-name">${escapeHtml(getStationName(item))}</div>
        <div class="stop-meta">
          ${escapeHtml(item.stationCode || "")}
          ${item.platform ? ` · PF ${escapeHtml(item.platform)}` : ""}
        </div>
        <div class="stop-time">${formatTime(item.actualArrival || item.scheduledArrival)}</div>
      </div>
    `;
  }).join("");
}

function renderTrain(data) {
  lastTrainPayload = data;

  const train = data.train || {};
  const current = data.currentLocation || {};
  const next = data.nextHalt || {};

  els.trainName.textContent = data.trainName || train.name || "Unknown Train";
  els.trainMeta.textContent = `Train No. ${data.trainNumber || train.number || currentTrainNumber} · ${train.type || train.category || "Indian Railways"}`;

  const eta = calculateEta(data);
  els.etaValue.textContent = eta.text;
  els.etaNote.textContent = eta.note;

  els.currentLocation.textContent =
    current.stationCode || data.previousHalt?.stationName || "En route";
  els.nextStation.textContent =
    next.stationName || next.stationCode || "—";
  els.currentSpeed.textContent =
    Number.isFinite(Number(current.speedKmh)) ? `${current.speedKmh} km/h` : "—";
  els.currentDelay.textContent =
    Number.isFinite(Number(data.delayMinutes)) ? `${data.delayMinutes} min` : "—";
  els.targetStation.textContent =
    selectedStation?.name || "—";

  const targetIndex = getTargetRouteIndex(data.route || []);
  const target = targetIndex >= 0 ? data.route[targetIndex] : null;
  els.scheduledArrival.textContent = formatTime(target?.scheduledArrival || target?.scheduledDeparture);

  renderRoute(data.route, current);

  const diverted = Array.isArray(data.exceptions)
    ? data.exceptions.filter(x => String(x.type || "").toUpperCase().includes("DIVERT"))
    : [];

  if (diverted.length) {
    const message = diverted[0].message || "Train has a diversion.";
    els.diversionBox.textContent = `⚠️ ${message}`;
    show(els.diversionBox);
  } else {
    hide(els.diversionBox);
  }

  els.lastUpdated.textContent =
    `Last updated: ${formatTime(data.lastUpdatedAt || data.meta?.timestamp || new Date().toISOString())}`;
  els.sourceLabel.textContent =
    `Source: ${data.meta?.source || "RailRadar"} · Live: ${data.isLive === true ? "Yes" : "Unknown"}`;

  show(els.resultStep);
  els.resultStep.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function fetchTrain() {
  clearError();

  const number = els.trainInput.value.trim();
  if (!/^\d{5}$/.test(number)) {
    setError("Enter a valid 5-digit train number.");
    els.trainInput.focus();
    return;
  }

  if (!selectedStation) {
    setError("Please select a railway station first.");
    return;
  }

  if (RAILRADAR_PROXY_URL.includes("YOUR-WORKER-URL")) {
    setError("RailRadar proxy is not configured yet. Put your Cloudflare Worker URL in app.js.");
    return;
  }

  currentTrainNumber = number;
  hide(els.resultStep);
  show(els.loadingStep);

  try {
    const url = `${RAILRADAR_PROXY_URL.replace(/\/$/, "")}/train/${encodeURIComponent(number)}/live`;
    const response = await fetch(url);

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`Proxy returned HTTP ${response.status}.`);
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || `RailRadar request failed (HTTP ${response.status}).`);
    }

    renderTrain(payload.data || payload);
  } catch (error) {
    setError(error.message || "Unable to fetch live train data.");
  } finally {
    hide(els.loadingStep);
  }
}

els.locateBtn.addEventListener("click", locateAndLoadStations);
els.refreshStationsBtn.addEventListener("click", locateAndLoadStations);

els.changeStationBtn.addEventListener("click", () => {
  hide(els.trainStep);
  hide(els.resultStep);
  show(els.stationsStep);
  els.stationsStep.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.trainForm.addEventListener("submit", event => {
  event.preventDefault();
  fetchTrain();
});

els.refreshTrainBtn.addEventListener("click", fetchTrain);
