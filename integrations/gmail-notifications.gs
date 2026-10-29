// Relais privé Supabase → Gmail. À coller dans votre propre projet Google Apps Script.
// Aucun mot de passe Gmail ni clé API n'est nécessaire dans ce code.
// Configurer REPORT_GMAIL_SECRET dans les propriétés du script (32 caractères minimum).
// Déployer comme application Web, exécuter en tant que vous, accès « Tout le monde ».
var INVENTORY_RECIPIENT = 'magasin-central@ensosp.fr';

function mailResult(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function sameMailSecret(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || right.length < 32) return false;
  var a = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, left);
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, right);
  var difference = 0;
  for (var i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function doPost(event) {
  var content = event && event.postData && event.postData.contents;
  if (!content || content.length > 60000) return mailResult({ok:false,error:'invalid_request'});
  var input;
  try { input = JSON.parse(content); } catch (_) { return mailResult({ok:false,error:'invalid_request'}); }
  var properties = PropertiesService.getScriptProperties();
  if (!input || !sameMailSecret(input.secret, properties.getProperty('REPORT_GMAIL_SECRET'))) return mailResult({ok:false,error:'unauthorized'});
  if (typeof input.id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.id)
      || typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 300
      || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 50000) return mailResult({ok:false,error:'invalid_message'});
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return mailResult({ok:false,error:'busy'});
  try {
    var now = Date.now();
    // Mémoire des envois pendant sept jours, pour les reprises après coupure.
    var existing = properties.getProperties();
    Object.keys(existing).forEach(function(key) {
      if (key.indexOf('sent_report_') === 0 && Number(existing[key]) < now - 7 * 86400000) properties.deleteProperty(key);
    });
    var key = 'sent_report_' + input.id.toLowerCase();
    if (properties.getProperty(key)) return mailResult({ok:true,duplicate:true});
    if (MailApp.getRemainingDailyQuota() < 1) return mailResult({ok:false,error:'daily_quota'});
    // Destinataire fixé ici : une requête ne peut pas choisir une autre adresse.
    MailApp.sendEmail({to:INVENTORY_RECIPIENT,subject:input.subject,body:input.text,name:'ENSOSP — Signalements inventaire'});
    properties.setProperty(key, String(now));
    return mailResult({ok:true});
  } catch (_) {
    return mailResult({ok:false,error:'mail_failed'});
  } finally {
    lock.releaseLock();
  }
}
