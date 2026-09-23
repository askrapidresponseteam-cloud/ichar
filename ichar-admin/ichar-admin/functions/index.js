/* Optional. The portal works without any of this.

   Deploying functions needs the Blaze plan. Two things are worth having once
   reports start arriving in volume:

   1. The public tracking entry is rebuilt from the case by the server, so it
      cannot drift out of step with the file and cannot be tampered with from
      a browser.
   2. An email goes to intake the moment an emergency report lands, so nobody
      has to be watching the portal.

   Deploy with:  firebase deploy --only functions
*/

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

/* Set these once with:
   firebase functions:config is no longer used in v2, so use parameters:
   firebase deploy --only functions  and answer the prompts, or set them in
   the console under Functions > Configuration. */
const SMTP_HOST = defineString('SMTP_HOST', { default: '' });
const SMTP_USER = defineString('SMTP_USER', { default: '' });
const SMTP_PASS = defineString('SMTP_PASS', { default: '' });
const ALERT_TO = defineString('ALERT_TO', { default: 'info.ichar@gmail.com' });
const PORTAL_URL = defineString('PORTAL_URL', { default: '' });

const FIRST_NOTE = 'Intake will confirm the division and the handling office within 48 hours.';

function mirrorFrom(c) {
  return {
    ref: c.ref,
    division: c.division || '',
    office: c.office || '',
    stage: c.stage || 1,
    priority: c.priority || c.urgency || 'Standard',
    where: c.where || '',
    when: c.when || '',
    created: c.created || admin.firestore.FieldValue.serverTimestamp(),
    publicNote: c.publicNote || FIRST_NOTE,
    closed: !!(c.status && c.status !== 'open'),
    outcome: c.status === 'closed' ? (c.closureOutcome || '') : '',
    updatedAt: new Date().toISOString()
  };
}

/* Keep the public tracking entry true to the file. */
exports.mirrorOnCreate = onDocumentCreated('cases/{caseId}', async event => {
  const c = event.data && event.data.data();
  if (!c || !c.ref) return;
  await db.collection('caseStatus').doc(c.ref).set(mirrorFrom(c), { merge: true });
  await alert(c, event.params.caseId);
});

exports.mirrorOnUpdate = onDocumentUpdated('cases/{caseId}', async event => {
  const c = event.data && event.data.after && event.data.after.data();
  if (!c || !c.ref) return;
  await db.collection('caseStatus').doc(c.ref).set(mirrorFrom(c), { merge: true });
});

/* Tell a person when something cannot wait. */
async function alert(c, caseId) {
  const priority = c.priority || c.urgency;
  if (priority !== 'Emergency') return;
  if (!SMTP_HOST.value() || !SMTP_USER.value()) {
    console.log('Emergency case ' + c.ref + ' logged. No mail server configured, so no alert was sent.');
    return;
  }
  const link = PORTAL_URL.value() ? PORTAL_URL.value() + '/#/case/' + caseId : '(portal link not configured)';
  const body = [
    'An emergency report has been logged.',
    '',
    'Reference: ' + c.ref,
    'Division:  ' + (c.division || '-'),
    'Where:     ' + (c.where || '-'),
    'Still happening: ' + (c.ongoing ? 'Yes' : 'No'),
    'Reporter:  ' + (c.anonymous ? 'Anonymous' : (c.name || 'Not given')),
    'Contact:   ' + (c.anonymous ? 'None given' : [c.email, c.phone].filter(Boolean).join(', ') || 'Not given'),
    '',
    'Open the file: ' + link,
    '',
    'This message contains personal information. Do not forward it outside the council.'
  ].join('\n');

  const transport = nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port: 587,
    secure: false,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() }
  });

  await transport.sendMail({
    from: SMTP_USER.value(),
    to: ALERT_TO.value(),
    subject: 'Emergency report ' + c.ref + ' - ' + (c.division || 'unrouted'),
    text: body
  });
  console.log('Alert sent for ' + c.ref);
}
