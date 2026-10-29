// @ts-nocheck
// Fichier généré pour Supabase Editor. Ne pas modifier directement.
// Régénération : node scripts/prepare_edge_editor.mjs
// Ne contient aucune clé secrète ; configurer les secrets dans Supabase.

// supabase/functions/report-notifications/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

// supabase/functions/_shared/report-model.js
var kinds = { missing: "Mat\xE9riel manquant", broken: "Mat\xE9riel cass\xE9", faulty: "Dysfonctionnement", other: "Autre anomalie" };
var recipient = "magasin-central@ensosp.fr";
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

// supabase/functions/report-notifications/index.ts
var env = (key) => Deno.env.get(key);
var db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(createMailHandler({ db, env }));
