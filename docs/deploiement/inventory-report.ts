// @ts-nocheck
// Fichier généré pour Supabase Editor. Ne pas modifier directement.
// Régénération : node scripts/prepare_edge_editor.mjs
// Ne contient aucune clé secrète ; configurer les secrets dans Supabase.

// supabase/functions/inventory-report/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// supabase/functions/_shared/report-model.js
var kinds = { missing: "Mat\xE9riel manquant", broken: "Mat\xE9riel cass\xE9", faulty: "Dysfonctionnement", other: "Autre anomalie" };
var clean = (value, max, required = false) => {
  if (typeof value !== "string" || value.length > max || required && !value.trim()) throw Error("Champ absent ou trop long");
  return value.trim();
};
function validateSubmission(input) {
  if (!input || typeof input !== "object" || input.website) throw Error("Envoi invalide");
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) throw Error("Identifiant invalide");
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) throw Error("Rechargez la fiche de l\u2019engin");
  if (input.consent !== true) throw Error("Veuillez accepter la transmission du signalement");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 20) throw Error("Ajoutez de 1 \xE0 20 mat\xE9riels");
  const items = input.items.map((item) => {
    if (!Object.hasOwn(kinds, item.kind) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) throw Error("Type ou quantit\xE9 invalide");
    const description = clean(item.description, 1500, true);
    if (description.length < 3) throw Error("Pr\xE9cisez le probl\xE8me en quelques mots");
    return { sectionId: item.sectionId === null ? null : clean(item.sectionId, 100, true), section: clean(item.section, 120, true), designation: clean(item.designation, 200, true), kind: item.kind, quantity: item.quantity, description };
  });
  if (!Array.isArray(input.photos) || input.photos.length > 3) throw Error("Trois photos maximum");
  return { requestId: input.requestId, vehicleId: clean(input.vehicleId, 100, true), revision: input.revision, name: clean(input.name || "", 80), contact: clean(input.contact || "", 160), items, photos: input.photos.map((photo) => ({ type: clean(photo.type, 30, true), data: clean(photo.data, 2796204, true) })) };
}
function decodePhoto(photo) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data)) throw Error("Photo JPEG, PNG ou WebP requise");
  const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
  if (bytes.length > 2097152 || bytes.length < 12) throw Error("Photo vide ou sup\xE9rieure \xE0 2 Mo");
  const match = photo.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : photo.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b) : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!match) throw Error("Le contenu de la photo ne correspond pas \xE0 son format");
  return { bytes, extension: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[photo.type] };
}

// supabase/functions/_shared/report-handlers.js
var response = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function limitedJSON(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Requ\xEAte vide");
  let size = 0, chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 85e5) {
        await reader.cancel();
        throw Error("Envoi trop volumineux (trois photos de 2 Mo maximum)");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    all.set(chunk, position);
    position += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(all));
}
function createSubmitHandler({ db: db2, env: env2 }) {
  const allowed = (env2("REPORT_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  return async (request) => {
    const origin = request.headers.get("origin");
    if (!allowed.includes(origin)) return response(403, { error: "Origine non autoris\xE9e" });
    const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return response(405, { error: "M\xE9thode non autoris\xE9e" }, cors);
    if (!env2("REPORT_RATE_SECRET")) return response(503, { error: "Le service de signalement n\u2019est pas encore activ\xE9." }, cors);
    let input, payload, photos;
    try {
      input = await limitedJSON(request);
      payload = validateSubmission(input);
      photos = payload.photos.map(decodePhoto);
    } catch (error) {
      return response(400, { error: error.message || "Formulaire invalide" }, cors);
    }
    const paths = [];
    let saveStarted = false;
    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env2("REPORT_RATE_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const ip = (request.headers.get("x-forwarded-for") || "unknown").split(",").at(-1).trim().slice(0, 100);
      const digest = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ip)))].map((b) => b.toString(16).padStart(2, "0")).join("");
      const quota = await db2.rpc("take_inventory_report_quota", { p_key: digest });
      if (quota.error) throw Error("quota");
      if (!quota.data) return response(429, { error: "Trop d\u2019envois. R\xE9essayez plus tard." }, cors);
      const hash = await sha256(JSON.stringify(payload));
      const existing = await db2.from("inventory_reports").select("reference,submission_hash").eq("request_id", payload.requestId).maybeSingle();
      if (existing.error) throw Error("lookup");
      if (existing.data) {
        if (existing.data.submission_hash !== hash) return response(409, { error: "Cet envoi a chang\xE9. Rechargez le formulaire pour cr\xE9er un nouveau signalement." }, cors);
        return response(200, { reference: existing.data.reference }, cors);
      }
      for (let i = 0; i < photos.length; i++) {
        const path = `${payload.requestId}/${crypto.randomUUID()}.${photos[i].extension}`;
        paths.push(path);
        const result = await db2.storage.from("inventory-report-photos").upload(path, photos[i].bytes, { contentType: payload.photos[i].type, upsert: false });
        if (result.error) throw Error("upload");
      }
      saveStarted = true;
      const saved = await db2.rpc("submit_inventory_report", { p_request_id: payload.requestId, p_hash: hash, p_vehicle_id: payload.vehicleId, p_revision: payload.revision, p_name: payload.name, p_contact: payload.contact, p_items: payload.items, p_photos: paths.map((path) => ({ path })) });
      if (saved.error) {
        if (paths.length) await db2.storage.from("inventory-report-photos").remove(paths);
        return response(saved.error.code === "40001" ? 409 : 400, { error: saved.error.code === "40001" ? "La fiche ou l\u2019affectation a chang\xE9. Rechargez la page avant de recommencer." : "Enregistrement impossible. V\xE9rifiez les champs et rechargez la fiche." }, cors);
      }
      if (saved.data.existing && paths.length) await db2.storage.from("inventory-report-photos").remove(paths);
      return response(200, { reference: saved.data.reference }, cors);
    } catch {
      if (!saveStarted && paths.length) {
        try {
          await db2.storage.from("inventory-report-photos").remove(paths);
        } catch {
        }
      }
      return response(503, { error: "Envoi non confirm\xE9. Gardez ce formulaire ouvert et r\xE9essayez : aucun doublon ne sera cr\xE9\xE9." }, cors);
    }
  };
}

// supabase/functions/inventory-report/index.ts
var env = (key) => Deno.env.get(key);
var db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createSubmitHandler({ db, env }));
