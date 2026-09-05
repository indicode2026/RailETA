/**
 * RailETA free proxy for Cloudflare Workers.
 * Keeps the RailRadar secret OUT of GitHub/frontend code.
 * Deploy with: wrangler secret put RAILRADAR_API_KEY
 */
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {headers: cors});
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/train\/(\d{1,6})\/live$/);
    if (!m) return json({success:false,error:{message:'Use /train/{trainNumber}/live'}},404);
    if (!env.RAILRADAR_API_KEY) return json({success:false,error:{message:'Server API key is not configured.'}},500);
    const upstream = `https://api.railradar.in/v1/trains/${m[1]}/live${url.search}`;
    const r = await fetch(upstream,{headers:{Authorization:`Bearer ${env.RAILRADAR_API_KEY}`,Accept:'application/json'}});
    const text = await r.text();
    return new Response(text,{status:r.status,headers:{...cors,'Content-Type':'application/json'}});
  }
};
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{...cors,'Content-Type':'application/json'}})}
