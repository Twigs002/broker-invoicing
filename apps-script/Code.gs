/**
 * SA Broker Invoicing - draft mailer.
 *
 * Deploy this under the BOOKKEEPER's Google account so drafts are created in
 * THEIR Gmail. It ONLY creates drafts - it never sends. The bookkeeper reviews
 * each draft and sends manually.
 *
 * DEPLOY:
 *   1. script.google.com -> New project -> paste this in -> save.
 *   2. Deploy -> New deployment -> type "Web app".
 *   3. Execute as: Me (the bookkeeper).  Who has access: Anyone.
 *   4. Authorise (it needs Gmail draft access).
 *   5. Copy the /exec URL -> paste into docs/config.js INVOICE_MAIL_ENDPOINT.
 *
 * SENDER IDENTITY - brokers see SENDER_NAME as the "from" name.
 *   Route B (default, no setup): leave SEND_AS = ''. Drafts send from the
 *     bookkeeper's own address but show "Quay 1 Invoicing" as the name.
 *   Route A (branded alias): once invoicing@quay1.co.za is added as an ALIAS
 *     on the bookkeeper's mailbox AND registered under Gmail Settings ->
 *     Accounts -> "Send mail as", set SEND_AS = 'invoicing@quay1.co.za'.
 *     Drafts then send as "Quay 1 Invoicing <invoicing@quay1.co.za>" and
 *     broker replies land back in the bookkeeper's inbox automatically.
 *
 * The client posts (text/plain to avoid a CORS preflight):
 *   { to, brokerName, invoices:[{doc, filename, pdfBase64, total, date}], createdBy }
 */

var SENDER_NAME = 'Quay 1 Invoicing';   // display name brokers see
var SEND_AS = '';                       // '' = send from bookkeeper; or 'invoicing@quay1.co.za' once the alias exists

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var to = String(body.to || '').trim();
    var broker = String(body.brokerName || 'Broker').trim();
    var invoices = Array.isArray(body.invoices) ? body.invoices : [];
    if (!to) return json({ ok: false, error: 'No recipient email.' });
    if (!invoices.length) return json({ ok: false, error: 'No invoices.' });

    var attachments = invoices.map(function (inv) {
      var bytes = Utilities.base64Decode(inv.pdfBase64);
      return Utilities.newBlob(bytes, 'application/pdf', inv.filename || (inv.doc + '.pdf'));
    });

    var total = invoices.reduce(function (s, i) { return s + (Number(i.total) || 0); }, 0);
    var subject = 'Quay 1 - Invoice' + (invoices.length > 1 ? 's (' + invoices.length + ')' : ' ' + (invoices[0].doc || ''));

    var list = invoices.map(function (i) {
      return '&bull; ' + esc(i.doc) + (i.date ? ' (' + esc(i.date) + ')' : '') + ' - R' + fmt(i.total);
    }).join('<br>');

    var html =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1c2333">' +
      '<p>Good day ' + esc(broker) + ',</p>' +
      '<p>Please find ' + (invoices.length > 1 ? 'your attached invoices' : 'your attached invoice') +
      ' from Quay 1 International Realty:</p>' +
      '<p>' + list + '</p>' +
      (invoices.length > 1 ? '<p><b>Total: R' + fmt(total) + '</b></p>' : '') +
      '<p>Kind regards,<br>Quay 1 International Realty</p>' +
      '</div>';

    var plain = 'Good day ' + broker + ',\n\nPlease find your attached invoice' +
      (invoices.length > 1 ? 's' : '') + ' from Quay 1 International Realty.\n\nKind regards,\nQuay 1 International Realty';

    var opts = { htmlBody: html, attachments: attachments, name: SENDER_NAME };
    if (SEND_AS) opts.from = SEND_AS;
    var draft = GmailApp.createDraft(to, subject, plain, opts);
    return json({ ok: true, draftId: draft.getId(), count: invoices.length });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() { return json({ ok: true, service: 'sa-broker-invoicing-mailer' }); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function fmt(n) { return (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
