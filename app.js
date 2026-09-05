import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js';

// Firebase Web config supplied for the RailETA project. Web config is not a password.
const firebaseConfig = {
  apiKey: 'AIzaSyDDyMvsTfuJuX1TQ4ImufwP6xeI73SqiE4',
  authDomain: 'raileta-c9460.firebaseapp.com',
  projectId: 'raileta-c9460',
  storageBucket: 'raileta-c9460.firebasestorage.app',
  messagingSenderId: '875992250345',
  appId: '1:875992250345:web:0ae897e3c4553bbaae7d78',
  measurementId: 'G-BSTZYH0BBZ'
};
const app = initializeApp(firebaseConfig);
try { if (await isSupported()) getAnalytics(app); } catch (_) {}

// IMPORTANT: Set this to your deployed free proxy URL. Never put the RailRadar secret in this file.
const API_BASE_URL = localStorage.getItem('railetaApiBaseUrl') || 'YOUR_RAILRADAR_PROXY_URL';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

const $ = (id) => document.getElementById(id);
const views = ['locationView','stationsView','searchView','dashboardView'];
const state = { position: null, stations: [], station: null, trainNumber: '', data: null };

function showView(id) { views.forEach(v => $(v).classList.toggle('active', v === id)); window.scrollTo({top:0, behavior:'smooth'}); }
function escapeHtml(s='') { return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtTime(iso) { if (!iso) return '—'; const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso; return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
function fmtDateTime(iso) { if (!iso) return '—'; const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso; return d.toLocaleString([], {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}); }
function distanceKm(lat1, lon1, lat2, lon2) { const R=6371, p=Math.PI/180; const a=.5-Math.cos((lat2-lat1)*p)/2+Math.cos(lat1*p)*Math.cos(lat2*p)*(1-Math.cos((lon2-lon1)*p))/2; return 2*R*Math.asin(Math.sqrt(a)); }
function toast(msg) { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3200); }
function setError(id,msg){ const el=$(id); el.textContent=msg; el.classList.toggle('hidden',!msg); }

async function findStations(lat, lon) {
  const q=`[out:json][timeout:20];(nwr[railway=station](around:50000,${lat},${lon});nwr[public_transport=station][train=yes](around:50000,${lat},${lon}););out center tags;`;
  const res=await fetch(OVERPASS_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:new URLSearchParams({data:q})});
  if(!res.ok) throw new Error('Station service is temporarily unavailable.');
  const json=await res.json(); const seen=new Map();
  for(const x of json.elements||[]){ const la=x.lat ?? x.center?.lat, lo=x.lon ?? x.center?.lon; const t=x.tags||{}; if(!Number.isFinite(la)||!Number.isFinite(lo)) continue; const name=t.name||t['name:en']; if(!name) continue; const code=t['ref:IN']||t.ref||t['railway:ref']||''; const key=(code||name).toLowerCase(); const d=distanceKm(lat,lon,la,lo); if(!seen.has(key)||d<seen.get(key).distanceKm) seen.set(key,{name,code,lat:la,lon:lo,distanceKm:d}); }
  return [...seen.values()].sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,3);
}

function renderStations() {
  $('coordsText').textContent=`${state.position.lat.toFixed(5)}, ${state.position.lon.toFixed(5)} • ${state.stations.length} closest stations found`;
  $('stationsList').innerHTML=state.stations.map((s,i)=>`<button class="station-card" data-index="${i}"><span class="station-icon">🚉</span><span class="station-main"><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.code||'Station')} • ${s.distanceKm.toFixed(1)} km away</small></span><span class="select-arrow">Select →</span></button>`).join('');
  document.querySelectorAll('.station-card').forEach(b=>b.addEventListener('click',()=>{ state.station=state.stations[Number(b.dataset.index)]; $('selectedStationText').textContent=`${state.station.name}${state.station.code?' • '+state.station.code:''} • ${state.station.distanceKm.toFixed(1)} km from you`; showView('searchView'); }));
}

function requestLocation(){
  setError('searchError',''); $('locationStatus').textContent='Requesting location permission…';
  if(!navigator.geolocation){ $('locationStatus').textContent='Geolocation is not supported by this browser.'; return; }
  navigator.geolocation.getCurrentPosition(async pos=>{ state.position={lat:pos.coords.latitude,lon:pos.coords.longitude}; $('locationStatus').textContent='Location received. Finding nearby stations…'; try{ state.stations=await findStations(state.position.lat,state.position.lon); if(!state.stations.length) throw new Error('No railway stations were found within 50 km.'); renderStations(); showView('stationsView'); }catch(e){ $('locationStatus').textContent=e.message; } }, err=>{ $('locationStatus').textContent=err.code===1?'Location permission was denied. Please allow location in your browser and try again.':`Could not get location: ${err.message}`; },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
}

function buildProxyUrl(train){
  if(API_BASE_URL==='YOUR_RAILRADAR_PROXY_URL') throw new Error('API backend is not configured. Follow README.md Step 4 to deploy the free Cloudflare Worker and set its URL in app.js or localStorage.');
  return `${API_BASE_URL.replace(/\/$/,'')}/train/${encodeURIComponent(train)}/live`;
}

async function fetchLiveTrain(train){ const res=await fetch(buildProxyUrl(train)); let body={}; try{body=await res.json();}catch{} if(!res.ok||body.success===false) throw new Error(body?.error?.message||body?.message||`Train API error (${res.status})`); return body.data||body; }

function getRouteCurrentIndex(route,current){ if(!Array.isArray(route)||!current) return -1; let idx=route.findIndex(s=>s.sequence===current.sequence); if(idx<0) idx=route.findIndex(s=>s.stationCode===current.stationCode && s.status==='departed'); return idx; }
function predictEta(data){
  const route=data.route||[]; const cur=data.currentLocation||{}; const next=data.nextHalt||{}; const idx=getRouteCurrentIndex(route,cur);
  if(idx<0 || !next.stationCode) return {time:null,reason:'ETA unavailable from current route data'};
  const target=route.find(s=>s.stationCode===next.stationCode && s.sequence>=cur.sequence) || route[idx+1];
  if(!target) return {time:null,reason:'No upcoming station in route'};
  const now=new Date(); const speed=Number(cur.speedKmh)||Number(route[idx]?.speedToNextStationKmph)||Number(data.train?.avgSpeed)||50; const distance=Number(next.distance ?? (target.distance-route[idx].distance));
  let minutes=distance>0 ? distance/speed*60 : 0;
  // Blend the API delay with a live speed estimate; cap unrealistic values.
  const delay=Math.max(0,Number(data.delayMinutes)||0); minutes=Math.max(0,Math.min(minutes+delay,24*60));
  return {time:new Date(now.getTime()+minutes*60000),reason:`~${distance>0?distance.toFixed(0):'0'} km remaining at ~${speed.toFixed(0)} km/h, adjusted for +${delay} min delay`};
}

function renderDashboard(data){
  state.data=data; const tr=data.train||{}; const cur=data.currentLocation||{}; const next=data.nextHalt||{}; const route=data.route||[]; const prev=data.previousHalt||{};
  $('trainName').textContent=data.trainName||tr.name||`Train ${data.trainNumber}`; $('trainMeta').textContent=`Train ${data.trainNumber||tr.number||state.trainNumber} • ${tr.type||tr.category||'Train'}`;
  $('liveBadge').textContent=data.isLive===false?'● STALE':'● LIVE';
  $('currentLocation').textContent=cur.stationCode||prev.stationName||'En route'; $('currentStatus').textContent=cur.status||'—';
  $('nextStation').textContent=next.stationName||next.stationCode||'—'; $('nextDistance').textContent=next.distance!=null?`${next.distance} km`:'Distance unavailable';
  $('currentSpeed').textContent=Number.isFinite(Number(cur.speedKmh))?Number(cur.speedKmh).toFixed(0):'—'; $('lastUpdated').textContent=fmtDateTime(data.lastUpdatedAt);
  $('delayValue').textContent=`${Number(data.delayMinutes)||0} min`; $('detailNumber').textContent=data.trainNumber||tr.number||'—'; $('detailType').textContent=tr.type||tr.category||'—'; $('detailSource').textContent=tr.source?.name||'—'; $('detailDestination').textContent=tr.destination?.name||'—'; $('detailDistance').textContent=tr.distance!=null?`${tr.distance} km`:'—'; $('detailAvgSpeed').textContent=tr.avgSpeed!=null?`${tr.avgSpeed} km/h`:'—'; $('routeSummary').textContent=`${route.length} stations`;
  const p=predictEta(data); $('predictedEta').textContent=p.time?fmtTime(p.time):'—'; $('etaExplanation').textContent=p.reason;
  const idx=getRouteCurrentIndex(route,cur); $('routeList').innerHTML=route.map((s,i)=>`<div class="route-stop ${i<idx?'passed':''} ${i===idx?'current':''} ${s.status==='upcoming'?'upcoming':''}"><span class="dot"></span><div><b>${escapeHtml(s.stationName||s.stationCode)}</b><small>${escapeHtml(s.stationCode||'')} ${s.platform?`• Platform ${escapeHtml(s.platform)}`:''}</small></div><time>${fmtTime(s.actualArrival||s.actualDeparture||s.scheduledArrival||s.scheduledDeparture)}</time><em>${s.delayArrival!=null?`+${s.delayArrival}m`:s.status||''}</em></div>`).join('');
  const exceptions=data.exceptions||[]; if(exceptions.length){ const messages=exceptions.map(x=>x.message||x.type).filter(Boolean); $('exceptionBox').textContent='⚠️ '+messages.join(' • '); $('exceptionBox').classList.remove('hidden'); } else $('exceptionBox').classList.add('hidden');
}

async function loadTrain(){ const n=$('trainNumber').value.trim(); if(!/^\d{1,6}$/.test(n)){setError('searchError','Enter a valid numeric train number.');return;} state.trainNumber=n; setError('searchError',''); $('refreshBtn').disabled=true; showView('dashboardView'); $('trainName').textContent='Loading live train data…'; try{const d=await fetchLiveTrain(n); renderDashboard(d); setError('apiError','');}catch(e){setError('apiError',e.message); $('trainName').textContent=`Train ${n}`;}finally{$('refreshBtn').disabled=false;} }

$('locateBtn').addEventListener('click',requestLocation); $('changeLocationBtn').addEventListener('click',requestLocation); $('backStationsBtn').addEventListener('click',()=>showView('stationsView')); $('trainForm').addEventListener('submit',e=>{e.preventDefault();loadTrain();}); $('refreshBtn').addEventListener('click',loadTrain);
