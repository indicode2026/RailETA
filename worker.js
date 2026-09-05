/**
 * RailETA Cloudflare Worker
 *
 * Secret required in Cloudflare:
 *   RAILRADAR_API_KEY
 *
 * Frontend calls:
 *   GET /train/12919/live
 *
 * Worker calls:
 *   https://api.railradar.in/v1/trains/12919/live
 */

const ALLOWED_ORIGIN = "*";
const API_BASE = "https://api.railradar.in/v1";

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    if (request.method !== "GET") {
      return json({ success: false, error: "Method not allowed" }, 405);
    }

    const match = url.pathname.match(/^\/train\/(\d{5})\/live\/?$/);
    if (!match) {
      return json({
        success: false,
        error: "Use GET /train/{5-digit-number}/live"
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
