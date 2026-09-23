/* Creates the first administrator so that someone can sign in.

   The portal will not open for an account that has no staff record, which
   leaves a new project locked. This script makes that first record.

   Usage:
     cd tools
     npm install
     node bootstrap.mjs --email you@ichar.org --password "a long passphrase" --name "Your Name"

   It needs a service account key. In the Firebase console open
   Project settings > Service accounts > Generate new private key, save the
   file as tools/service-account.json, and keep it out of version control.

   Options:
     --email     required
     --password  required, at least 8 characters
     --name      required
     --office    defaults to Head Office, New Delhi
     --demo      also writes a handful of sample cases, to try the portal out
*/

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const args = {};
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = all[i + 1];
    args[key] = !next || next.startsWith('--') ? true : next;
  }
});

const need = k => {
  if (!args[k] || args[k] === true) {
    console.error('Missing --' + k);
    process.exit(1);
  }
  return args[k];
};

const email = need('email');
const password = need('password');
const name = need('name');
const office = args.office && args.office !== true ? args.office : 'Head Office, New Delhi';

if (String(password).length < 8) {
  console.error('Use a password of at least 8 characters.');
  process.exit(1);
}

let creds;
try {
  creds = JSON.parse(readFileSync(new URL('./service-account.json', import.meta.url)));
} catch (e) {
  console.error('tools/service-account.json is missing. Download it from');
  console.error('Firebase console > Project settings > Service accounts.');
  process.exit(1);
}

initializeApp({ credential: cert(creds) });
const auth = getAuth();
const db = getFirestore();

/* 1. The sign-in account. */
let user;
try {
  user = await auth.getUserByEmail(email);
  console.log('Account already exists for ' + email);
} catch (e) {
  user = await auth.createUser({ email, password, displayName: name });
  console.log('Created the sign-in account for ' + email);
}

/* 2. The staff record the portal checks on every request. */
await db.collection('staff').doc(user.uid).set({
  name,
  email,
  role: 'admin',
  office,
  active: true,
  createdAt: FieldValue.serverTimestamp()
}, { merge: true });

console.log('Staff record written. ' + name + ' is an administrator.');
console.log('User ID: ' + user.uid);

/* 3. Optional sample cases. */
if (args.demo) {
  const seeds = [
    ['Human Rights', 'Emergency', 'Chattarpur, New Delhi',
      'Domestic violence complaint, the station refused to record an FIR and the woman has been sent back to the house twice.',
      'A woman and two children', 'Police station'],
    ['Animal Rights', 'Urgent', 'Tiruvallur, Chennai',
      'Community dogs are being removed from the layout at night by a private contractor with an unmarked van.',
      'Community animals, roughly twenty', 'Municipal or local body'],
    ['Environmental Rights', 'Standard', 'Bhandup, Mumbai',
      'Untreated effluent entering a nullah from a small industrial estate. The smell carries into two schools nearby.',
      'A locality of about four thousand', 'Pollution control board']
  ];
  const code = { 'Human Rights': 'HR', 'Animal Rights': 'AR', 'Environmental Rights': 'ER' };
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const tail = () => Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

  for (const [division, urgency, where, summary, affected, authority] of seeds) {
    const ref = 'ICH-' + new Date().getFullYear() + '-' + code[division] + tail();
    const doc = {
      ref, division, urgency, priority: urgency, where, summary, affected, authority,
      when: '', ongoing: true, evidence: ['Photographs or video'],
      anonymous: false, name: 'Sample Reporter', email: 'sample@example.com', phone: '',
      relation: 'I witnessed it', share: true, source: 'website',
      stage: 1, status: 'open', office: '', assignedTo: null, assignedName: '',
      cell: null, publicNote: 'Intake will confirm the division and the handling office within 48 hours.',
      tags: [], firstActionedAt: null, nextAction: '', nextActionDate: '',
      searchBlob: [ref, division, where, summary].join(' ').toLowerCase(),
      created: FieldValue.serverTimestamp()
    };
    const added = await db.collection('cases').add(doc);
    await db.collection('caseStatus').doc(ref).set({
      ref, division, office: '', stage: 1, priority: urgency, where, when: '',
      created: FieldValue.serverTimestamp(), publicNote: doc.publicNote,
      closed: false, outcome: '', updatedAt: new Date().toISOString()
    });
    await db.collection('cases').doc(added.id).collection('timeline').add({
      type: 'created', body: 'Report received from the website.', meta: {},
      byUid: 'system', byName: 'Website', at: FieldValue.serverTimestamp(), internal: false
    });
    console.log('Sample case ' + ref);
  }
}

console.log('\nDone. Open the portal and sign in.');
process.exit(0);
