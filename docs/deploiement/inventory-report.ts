// @ts-nocheck
// Fichier généré pour Supabase Editor. Ne pas modifier directement.
// Régénération : node scripts/prepare_edge_editor.mjs
// Ne contient aucune clé secrète ; configurer les secrets dans Supabase.

// supabase/functions/inventory-report/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// supabase/functions/_shared/report-model.js
var kinds = { missing: "Mat\xE9riel manquant", broken: "Mat\xE9riel cass\xE9", faulty: "Dysfonctionnement", other: "Autre anomalie" };
var recipient = "magasin-central@ensosp.fr";
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
function mailFor(report, appUrl) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("URL publique HTTPS requise");
  return {
    to: [recipient],
    subject: `[Inventaire #${report.reference}] ${report.center} \u2014 ${report.vehicle_name}`,
    text: [`Signalement n\xB0${report.reference}`, `Centre : ${report.center}`, `Engin : ${report.vehicle_name} \u2014 ${report.registration}`, `Date : ${report.created_at}`, "", ...report.items.map((i) => `${i.section} \xB7 ${i.designation}
${kinds[i.kind]} \xB7 quantit\xE9 concern\xE9e : ${i.quantity}
${i.description}
`), `D\xE9clarant : ${report.reporter_name || "Non renseign\xE9"}`, `Contact : ${report.reporter_contact || "Non renseign\xE9"}`, `Photos jointes : ${report.photos.length} (consultables dans l\u2019espace administrateur)`, "", `Consulter et traiter : ${url.origin}/signalements/#report=${report.id}`].join("\n")
  };
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
function createSubmitHandler({ db: db2, env: env2, notify: notify2, waitUntil }) {
  const allowed = (env2("REPORT_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const scheduleNotification = (requestId) => {
    if (!notify2) return;
    const task = Promise.resolve().then(() => notify2(requestId)).catch(() => void 0);
    try {
      if (waitUntil) waitUntil(task);
    } catch {
    }
  };
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
        scheduleNotification(payload.requestId);
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
      scheduleNotification(payload.requestId);
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
async function secretMatches(a, b) {
  if (!a || !b) return false;
  const x = await sha256(a), y = await sha256(b);
  let different = 0;
  for (let i = 0; i < x.length; i++) different |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return different === 0;
}
function createMailHandler({ db: db2, env: env2, fetchImpl = fetch, reportId }) {
  return async (request) => {
    if (request.method !== "POST") return response(405, { error: "POST requis" });
    if (!await secretMatches(request.headers.get("x-report-worker-secret"), env2("REPORT_WORKER_SECRET"))) return response(401, { error: "Acc\xE8s refus\xE9" });
    const provider = env2("REPORT_MAIL_PROVIDER") || "resend";
    const gmailUrl = env2("GMAIL_WEBAPP_URL");
    const providerReady = provider === "gmail" ? gmailUrl && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gmailUrl) && (env2("GMAIL_WEBAPP_SECRET") || "").length >= 32 : provider === "resend" && env2("RESEND_API_KEY") && env2("REPORT_EMAIL_FROM");
    if (env2("REPORT_EMAIL_ENABLED") !== "true" || !providerReady || !env2("PUBLIC_APP_URL")) return response(503, { error: "Notifications non activ\xE9es ou configuration incompl\xE8te" });
    try {
      mailFor({ reference: 0, items: [], photos: [] }, env2("PUBLIC_APP_URL"));
    } catch {
      return response(503, { error: "URL publique invalide" });
    }
    const expired = await db2.rpc("expire_inventory_report_mail");
    if (expired.error) return response(503, { error: "File indisponible" });
    const jobs = reportId ? await claimReportMail(db2, reportId) : await db2.rpc("claim_inventory_report_mail");
    if (jobs.error) return response(503, { error: "File indisponible" });
    let sent = 0, failed = 0;
    for (const job of jobs.data) {
      let success = false, errorCode = "notification_failed";
      try {
        const result = await db2.from("inventory_reports").select("*").eq("id", job.report_id).single();
        if (result.error) throw Error("report");
        const mail = mailFor(result.data, env2("PUBLIC_APP_URL"));
        if (provider === "gmail") {
          const email = await fetchImpl(gmailUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: env2("GMAIL_WEBAPP_SECRET"), id: job.report_id, subject: mail.subject, text: mail.text }), signal: AbortSignal.timeout(2e4) });
          if (email.ok) {
            const result2 = await email.json();
            success = result2.ok === true;
            errorCode = "gmail_relay_failed";
          } else errorCode = `provider_http_${email.status}`;
        } else {
          const email = await fetchImpl("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env2("RESEND_API_KEY")}`, "Content-Type": "application/json", "Idempotency-Key": `inventory-report/${job.report_id}` }, body: JSON.stringify({ from: env2("REPORT_EMAIL_FROM"), ...mail }), signal: AbortSignal.timeout(15e3) });
          success = email.ok;
          errorCode = `provider_http_${email.status}`;
        }
      } catch {
        errorCode = "transport_or_configuration_error";
      }
      const finished = await db2.rpc("finish_inventory_report_mail", { p_report: job.report_id, p_lease: job.lease_id, p_success: success, p_error: success ? null : errorCode });
      if (success && !finished.error) sent++;
      else failed++;
    }
    return response(200, { sent, failed });
  };
}
async function claimReportMail(db2, reportId) {
  const current = await db2.from("inventory_report_mail").select("*").eq("report_id", reportId).maybeSingle();
  if (current.error) return { data: [], error: current.error };
  const job = current.data, now = /* @__PURE__ */ new Date();
  const firstAttempt = job?.state === "pending" && job.attempts === 0;
  if (!job || !["pending", "sending"].includes(job.state) || job.attempts >= 8 || !firstAttempt && new Date(job.available_at) > now) return { data: [] };
  let claim = db2.from("inventory_report_mail").update({ state: "sending", attempts: job.attempts + 1, lease_id: crypto.randomUUID(), available_at: new Date(now.getTime() + 3e5).toISOString() }).eq("report_id", reportId).eq("state", job.state).eq("attempts", job.attempts);
  if (!firstAttempt) claim = claim.lte("available_at", now.toISOString());
  return await claim.select("*");
}
function createImmediateNotifier({ db: db2, env: env2, fetchImpl = fetch }) {
  return async (requestId) => {
    if (env2("REPORT_EMAIL_ENABLED") !== "true" || !env2("REPORT_WORKER_SECRET")) return;
    const report = await db2.from("inventory_reports").select("id").eq("request_id", requestId).maybeSingle();
    if (report.error || !report.data) return;
    const handler = createMailHandler({ db: db2, env: env2, fetchImpl, reportId: report.data.id });
    return handler(new Request("https://internal.invalid/report-notifications", { method: "POST", headers: { "x-report-worker-secret": env2("REPORT_WORKER_SECRET") } }));
  };
}

// supabase/functions/inventory-report/index.ts
var env = (key) => Deno.env.get(key);
var db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
var notify = createImmediateNotifier({ db, env });
Deno.serve(createSubmitHandler({ db, env, notify, waitUntil: (task) => EdgeRuntime.waitUntil(task) }));
