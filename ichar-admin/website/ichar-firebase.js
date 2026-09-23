/* ICHAR website bridge to Firebase.
   Load this once, on every page that carries a form or the case tracker:

     <script type="module" src="assets/ichar-firebase.js"></script>

   It exposes three calls on window.ICHAR:

     await ICHAR.submitReport(record)   -> { ref }
     await ICHAR.lookupCase(reference)  -> public status, or null
     await ICHAR.submitPledge(record)   -> { ref }

   Nothing else on the site has to change shape. The record the Report a
   Violation form already builds is exactly what submitReport expects.

   If the network or the database is unreachable, the report is held in this
   browser and the caller is told, so that the reporter is never left with a
   form that silently ate their evidence. */

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

/* Paste the same web config used by the admin portal. */
const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT.firebaseapp.com',
  projectId: 'PASTE_PROJECT',
  storageBucket: 'PASTE_PROJECT.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};

const DIVISION_CODE = {
  'Human Rights': 'HR',
  'Animal Rights': 'AR',
  'Environmental Rights': 'ER'
};

const FIRST_NOTE = 'Intake will confirm the division and the handling office within 48 hours.';

let ready = null;

async function connect() {
  if (ready) return ready;
  ready = (async () => {
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const a = app.initializeApp(firebaseConfig);
    const authRef = auth.getAuth(a);
    /* The reporter is never asked to make an account. Anonymous sign in
       simply proves the write came from a real browser session, which is
       what the security rules check. */
    if (!authRef.currentUser) await auth.signInAnonymously(authRef);
    return { db: fs.getFirestore(a), F: fs, auth: authRef };
  })();
  return ready;
}

/* Reference numbers. ICH-<year>-<division code><six characters>.
   Six characters make a collision, or a guessed reference, very unlikely. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeRef(division) {
  const code = DIVISION_CODE[division] || 'GN';
  const rnd = new Uint32Array(6);
  window.crypto.getRandomValues(rnd);
  let tail = '';
  for (let i = 0; i < 6; i++) tail += ALPHABET[rnd[i] % ALPHABET.length];
  return 'ICH-' + new Date().getFullYear() + '-' + code + tail;
}

function keepLocally(key, record) {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift(record);
    window.localStorage.setItem(key, JSON.stringify(list.slice(0, 25)));
  } catch (e) { /* private browsing, nothing to do */ }
}

/* ---------------------------------------------------------------
   Reports
   --------------------------------------------------------------- */

async function submitReport(input) {
  const ref = makeRef(input.division);
  const record = {
    ref: ref,
    division: input.division || '',
    urgency: input.urgency || 'Standard',
    priority: input.urgency || 'Standard',
    where: input.where || '',
    when: input.when || '',
    summary: input.summary || '',
    affected: input.affected || '',
    ongoing: !!input.ongoing,
    evidence: input.evidence || [],
    authority: input.authority || '',
    anonymous: !!input.anonymous,
    name: input.anonymous ? '' : (input.name || ''),
    email: input.anonymous ? '' : (input.email || ''),
    phone: input.anonymous ? '' : (input.phone || ''),
    relation: input.relation || '',
    share: !!input.share,
    source: 'website',
    stage: 1,
    status: 'open',
    office: '',
    assignedTo: null,
    assignedName: '',
    cell: null,
    publicNote: FIRST_NOTE,
    tags: [],
    firstActionedAt: null,
    nextAction: '',
    nextActionDate: '',
    searchBlob: [ref, input.division, input.where, input.summary, input.affected, input.name, input.email]
      .filter(Boolean).join(' ').toLowerCase()
  };

  /* Always keep a copy on the device first, so the reference the person is
     shown survives even if the write fails. */
  keepLocally('ichar.applications', Object.assign({}, record, { created: new Date().toISOString() }));

  try {
    const { db, F } = await connect();
    const batch = F.writeBatch(db);
    batch.set(F.doc(F.collection(db, 'cases')), Object.assign({}, record, { created: F.serverTimestamp() }));
    batch.set(F.doc(db, 'caseStatus', ref), {
      ref: ref,
      division: record.division,
      office: '',
      stage: 1,
      priority: record.priority,
      where: record.where,
      when: record.when,
      created: F.serverTimestamp(),
      publicNote: FIRST_NOTE,
      closed: false,
      outcome: '',
      updatedAt: new Date().toISOString()
    });
    await batch.commit();
    return { ref: ref, stored: true };
  } catch (e) {
    console.error('ICHAR: the report could not be sent', e);
    return { ref: ref, stored: false, error: e };
  }
}

/* ---------------------------------------------------------------
   Case tracking
   --------------------------------------------------------------- */

async function lookupCase(reference) {
  const ref = String(reference || '').trim().toUpperCase();
  if (!ref) return null;
  try {
    const { db, F } = await connect();
    const snap = await F.getDoc(F.doc(db, 'caseStatus', ref));
    if (snap.exists()) {
      const d = snap.data();
      if (d.created && typeof d.created.toDate === 'function') d.created = d.created.toDate().toISOString();
      /* The tracker page reads urgency, the record stores priority. */
      d.urgency = d.priority || 'Standard';
      return d;
    }
  } catch (e) {
    console.error('ICHAR: the reference could not be looked up', e);
  }
  /* Fall back to anything held on this device. */
  try {
    const raw = window.localStorage.getItem('ichar.applications');
    const list = raw ? JSON.parse(raw) : [];
    return list.filter(r => String(r.ref).toUpperCase() === ref)[0] || null;
  } catch (e) { return null; }
}

/* ---------------------------------------------------------------
   Pledges
   --------------------------------------------------------------- */

async function submitPledge(input) {
  const ref = 'ICH-P-' + Math.floor(100000 + Math.random() * 899999);
  const record = {
    ref: ref,
    amount: Number(input.amount || 0),
    frequency: input.frequency === 'Monthly' ? 'Monthly' : 'One-time',
    designation: input.designation || 'Where it is needed most',
    name: input.name || '',
    email: input.email || '',
    status: 'Pledged',
    receiptNo: '',
    note: '',
    source: 'website'
  };
  keepLocally('ichar.pledges', Object.assign({}, record, { created: new Date().toISOString() }));
  try {
    const { db, F } = await connect();
    await F.addDoc(F.collection(db, 'pledges'), Object.assign({}, record, { created: F.serverTimestamp() }));
    return { ref: ref, stored: true };
  } catch (e) {
    console.error('ICHAR: the pledge could not be sent', e);
    return { ref: ref, stored: false, error: e };
  }
}

window.ICHAR = Object.assign(window.ICHAR || {}, {
  submitReport: submitReport,
  lookupCase: lookupCase,
  submitPledge: submitPledge,
  makeRef: makeRef
});
