/* Data layer. Everything the views need goes through here.

   Two backends sit behind one API:
     - firestore, used as soon as config.js holds a real project
     - demo, an in-browser sample set so the portal can be reviewed first

   Case documents keep the reporter's submission exactly as it arrived. Staff
   fields live alongside it and never overwrite the original record. */

import { firebaseConfig, DEMO, DIVISION_CODE, STAGE_PUBLIC_NOTE, OFFICES, DIVISIONS, PRIORITIES } from './config.js';
import { makeRef, searchBlob, toDate, uid, fmtDay } from './util.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

let fb = null;          // firebase namespaces once loaded
export let mode = DEMO ? 'demo' : 'firestore';

/* ================================================================
   Firebase bootstrap
   ================================================================ */

async function loadFirebase() {
  if (fb) return fb;
  const [app, auth, fs, st] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'),
    import(SDK + 'firebase-storage.js')
  ]);
  const a = app.initializeApp(firebaseConfig);
  fb = {
    app: a,
    auth: auth.getAuth(a),
    db: fs.getFirestore(a),
    storage: st.getStorage(a),
    A: auth, F: fs, S: st
  };
  return fb;
}

export async function init() {
  if (mode === 'demo') { demo.load(); return; }
  await loadFirebase();
}

/* ================================================================
   Authentication and the signed-in staff record
   ================================================================ */

export const session = { user: null, staff: null };

export async function onAuth(cb) {
  if (mode === 'demo') {
    demo.load();
    const saved = localStorage.getItem('ichar.admin.demo.user');
    if (saved) {
      session.user = { uid: 'demo-user', email: saved };
      session.staff = demo.data.staff.find(s => s.email === saved) || demo.data.staff[0];
    }
    cb(session.user ? session : null);
    return;
  }
  const f = await loadFirebase();
  f.A.onAuthStateChanged(f.auth, async user => {
    if (!user) { session.user = null; session.staff = null; return cb(null); }
    session.user = user;
    const snap = await f.F.getDoc(f.F.doc(f.db, 'staff', user.uid));
    if (!snap.exists()) {
      session.staff = null;
      return cb({ user, staff: null, noProfile: true });
    }
    session.staff = Object.assign({ id: user.uid }, snap.data());
    if (session.staff.active === false) return cb({ user, staff: null, inactive: true });
    cb(session);
  });
}

export async function signIn(email, password) {
  if (mode === 'demo') {
    const s = demo.data.staff.find(x => x.email.toLowerCase() === String(email).toLowerCase());
    if (!s) throw new Error('No demo account with that address. Try ' + demo.data.staff[0].email);
    localStorage.setItem('ichar.admin.demo.user', s.email);
    session.user = { uid: s.id, email: s.email };
    session.staff = s;
    return session;
  }
  const f = await loadFirebase();
  await f.A.signInWithEmailAndPassword(f.auth, email, password);
}

export async function sendReset(email) {
  if (mode === 'demo') return;
  const f = await loadFirebase();
  await f.A.sendPasswordResetEmail(f.auth, email);
}

export async function signOut() {
  if (mode === 'demo') {
    localStorage.removeItem('ichar.admin.demo.user');
    session.user = null; session.staff = null;
    return;
  }
  const f = await loadFirebase();
  await f.A.signOut(f.auth);
}

/* ================================================================
   Cases
   ================================================================ */

/* Normalises a stored document into what the views expect. */
function shape(id, d) {
  const c = Object.assign({ id: id }, d);
  c.stage = Math.min(4, Math.max(1, Number(c.stage) || 1));
  c.status = c.status || 'open';
  c.priority = c.priority || c.urgency || 'Standard';
  c.evidence = c.evidence || [];
  c.tags = c.tags || [];
  return c;
}

export async function listCases(opts) {
  const limitTo = (opts && opts.limit) || 800;
  if (mode === 'demo') {
    return demo.data.cases.slice()
      .sort((a, b) => (toDate(b.created) || 0) - (toDate(a.created) || 0))
      .slice(0, limitTo)
      .map(c => shape(c.id, c));
  }
  const f = await loadFirebase();
  const q = f.F.query(
    f.F.collection(f.db, 'cases'),
    f.F.orderBy('created', 'desc'),
    f.F.limit(limitTo)
  );
  const snap = await f.F.getDocs(q);
  return snap.docs.map(d => shape(d.id, d.data()));
}

export async function getCase(id) {
  if (mode === 'demo') {
    const c = demo.data.cases.find(x => x.id === id);
    return c ? shape(c.id, c) : null;
  }
  const f = await loadFirebase();
  const snap = await f.F.getDoc(f.F.doc(f.db, 'cases', id));
  return snap.exists() ? shape(snap.id, snap.data()) : null;
}

/* Patch a case, write a timeline entry and keep the public mirror in step.
   entry is optional: { type, body, meta } */
export async function updateCase(id, patch, entry) {
  const who = session.staff || { id: 'unknown', name: 'Unknown' };
  const full = Object.assign({}, patch, {
    updatedAt: mode === 'demo' ? new Date().toISOString() : null,
    updatedBy: who.id,
    updatedByName: who.name
  });

  if (mode === 'demo') {
    const i = demo.data.cases.findIndex(x => x.id === id);
    if (i < 0) throw new Error('Case not found');
    full.updatedAt = new Date().toISOString();
    demo.data.cases[i] = Object.assign({}, demo.data.cases[i], full);
    demo.data.cases[i].searchBlob = searchBlob(demo.data.cases[i]);
    if (entry) demo.data.timeline.push(makeEntry(id, entry, who));
    await mirror(demo.data.cases[i]);
    await audit('case.update', id, demo.data.cases[i].ref, entry ? entry.body : Object.keys(patch).join(', '));
    demo.save();
    return;
  }

  const f = await loadFirebase();
  full.updatedAt = f.F.serverTimestamp();
  const ref = f.F.doc(f.db, 'cases', id);
  await f.F.updateDoc(ref, full);
  if (entry) {
    await f.F.addDoc(f.F.collection(f.db, 'cases', id, 'timeline'), makeEntry(id, entry, who, f));
  }
  const fresh = await getCase(id);
  await mirror(fresh);
  await audit('case.update', id, fresh.ref, entry ? entry.body : Object.keys(patch).join(', '));
}

function makeEntry(caseId, entry, who, f) {
  return {
    caseId: caseId,
    type: entry.type || 'note',
    body: entry.body || '',
    meta: entry.meta || {},
    byUid: who.id,
    byName: who.name || who.email || 'Staff',
    at: f ? f.F.serverTimestamp() : new Date().toISOString(),
    internal: entry.internal !== false
  };
}

/* The public tracker reads this mirror. It carries no personal data:
   no name, no contact details, no incident narrative. */
async function mirror(c) {
  if (!c || !c.ref) return;
  const doc = {
    ref: c.ref,
    division: c.division || '',
    office: c.office || '',
    stage: c.stage || 1,
    priority: c.priority || 'Standard',
    where: c.where || '',
    when: c.when || '',
    created: c.created || null,
    publicNote: c.publicNote || STAGE_PUBLIC_NOTE[(c.stage || 1) - 1],
    closed: c.status && c.status !== 'open',
    outcome: c.status === 'closed' ? (c.closureOutcome || '') : '',
    updatedAt: new Date().toISOString()
  };
  if (mode === 'demo') {
    demo.data.status[c.ref] = doc;
    return;
  }
  const f = await loadFirebase();
  await f.F.setDoc(f.F.doc(f.db, 'caseStatus', c.ref), doc, { merge: true });
}

/* Staff-entered case, for reports that arrive by phone, email or in person. */
export async function createCase(data) {
  const who = session.staff || { id: 'unknown', name: 'Unknown' };
  const ref = makeRef(data.division, DIVISION_CODE);
  const now = new Date().toISOString();
  const rec = Object.assign({
    ref: ref,
    stage: 1,
    status: 'open',
    urgency: data.priority || 'Standard',
    priority: data.priority || 'Standard',
    created: now,
    source: data.source || 'staff',
    loggedBy: who.id,
    loggedByName: who.name,
    publicNote: STAGE_PUBLIC_NOTE[0],
    evidence: data.evidence || [],
    tags: []
  }, data);
  rec.searchBlob = searchBlob(rec);

  if (mode === 'demo') {
    rec.id = uid();
    demo.data.cases.unshift(rec);
    demo.data.timeline.push(makeEntry(rec.id, { type: 'created', body: 'Case opened at the desk by ' + who.name }, who));
    await mirror(rec);
    await audit('case.create', rec.id, ref, data.division || '');
    demo.save();
    return rec.id;
  }
  const f = await loadFirebase();
  rec.created = f.F.serverTimestamp();
  const added = await f.F.addDoc(f.F.collection(f.db, 'cases'), rec);
  await f.F.addDoc(f.F.collection(f.db, 'cases', added.id, 'timeline'),
    makeEntry(added.id, { type: 'created', body: 'Case opened at the desk by ' + who.name }, who, f));
  await mirror(Object.assign({}, rec, { created: new Date().toISOString() }));
  await audit('case.create', added.id, ref, data.division || '');
  return added.id;
}

export async function deleteCase(id) {
  const c = await getCase(id);
  if (mode === 'demo') {
    demo.data.cases = demo.data.cases.filter(x => x.id !== id);
    demo.data.timeline = demo.data.timeline.filter(t => t.caseId !== id);
    if (c) delete demo.data.status[c.ref];
    await audit('case.delete', id, c ? c.ref : '', 'removed');
    demo.save();
    return;
  }
  const f = await loadFirebase();
  await f.F.deleteDoc(f.F.doc(f.db, 'cases', id));
  if (c) await f.F.deleteDoc(f.F.doc(f.db, 'caseStatus', c.ref)).catch(() => {});
  await audit('case.delete', id, c ? c.ref : '', 'removed');
}

/* ================================================================
   Timeline
   ================================================================ */

export async function listTimeline(caseId) {
  if (mode === 'demo') {
    return demo.data.timeline
      .filter(t => t.caseId === caseId)
      .sort((a, b) => (toDate(b.at) || 0) - (toDate(a.at) || 0))
      .map(t => Object.assign({}, t));
  }
  const f = await loadFirebase();
  const q = f.F.query(f.F.collection(f.db, 'cases', caseId, 'timeline'), f.F.orderBy('at', 'desc'), f.F.limit(300));
  const snap = await f.F.getDocs(q);
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

export async function addEntry(caseId, entry) {
  const who = session.staff || { id: 'unknown', name: 'Unknown' };
  if (mode === 'demo') {
    demo.data.timeline.push(makeEntry(caseId, entry, who));
    demo.save();
    await audit('case.note', caseId, '', entry.type || 'note');
    return;
  }
  const f = await loadFirebase();
  await f.F.addDoc(f.F.collection(f.db, 'cases', caseId, 'timeline'), makeEntry(caseId, entry, who, f));
  await audit('case.note', caseId, '', entry.type || 'note');
}

/* ================================================================
   Attachments
   ================================================================ */

export async function listFiles(caseId) {
  if (mode === 'demo') return demo.data.files.filter(f => f.caseId === caseId);
  const f = await loadFirebase();
  const snap = await f.F.getDocs(f.F.query(f.F.collection(f.db, 'cases', caseId, 'files'), f.F.orderBy('at', 'desc')));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

export async function uploadFile(caseId, file, onProgress) {
  const who = session.staff || { id: 'unknown', name: 'Unknown' };
  if (mode === 'demo') {
    const rec = {
      id: uid(), caseId: caseId, name: file.name, size: file.size,
      contentType: file.type, at: new Date().toISOString(),
      byName: who.name, url: '', demo: true
    };
    demo.data.files.push(rec);
    demo.save();
    if (onProgress) onProgress(100);
    return rec;
  }
  const f = await loadFirebase();
  const path = 'cases/' + caseId + '/' + Date.now() + '_' + file.name.replace(/[^\w.\-]/g, '_');
  const sref = f.S.ref(f.storage, path);
  const task = f.S.uploadBytesResumable(sref, file, { contentType: file.type });
  await new Promise((res, rej) => {
    task.on('state_changed',
      s => onProgress && onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      rej, res);
  });
  const url = await f.S.getDownloadURL(sref);
  const rec = {
    name: file.name, size: file.size, contentType: file.type, path: path, url: url,
    at: f.F.serverTimestamp(), byUid: who.id, byName: who.name
  };
  await f.F.addDoc(f.F.collection(f.db, 'cases', caseId, 'files'), rec);
  await addEntry(caseId, { type: 'file', body: 'Attached ' + file.name });
  return rec;
}

export async function removeFile(caseId, fileRec) {
  if (mode === 'demo') {
    demo.data.files = demo.data.files.filter(f => f.id !== fileRec.id);
    demo.save();
    return;
  }
  const f = await loadFirebase();
  if (fileRec.path) await f.S.deleteObject(f.S.ref(f.storage, fileRec.path)).catch(() => {});
  await f.F.deleteDoc(f.F.doc(f.db, 'cases', caseId, 'files', fileRec.id));
  await addEntry(caseId, { type: 'file', body: 'Removed ' + fileRec.name });
}

/* ================================================================
   Pledges, from the Donate page
   ================================================================ */

export async function listPledges() {
  if (mode === 'demo') {
    return demo.data.pledges.slice().sort((a, b) => (toDate(b.created) || 0) - (toDate(a.created) || 0));
  }
  const f = await loadFirebase();
  const snap = await f.F.getDocs(f.F.query(f.F.collection(f.db, 'pledges'), f.F.orderBy('created', 'desc'), f.F.limit(500)));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

export async function updatePledge(id, patch) {
  if (mode === 'demo') {
    const i = demo.data.pledges.findIndex(p => p.id === id);
    demo.data.pledges[i] = Object.assign({}, demo.data.pledges[i], patch);
    demo.save();
    await audit('pledge.update', id, demo.data.pledges[i].ref, patch.status || '');
    return;
  }
  const f = await loadFirebase();
  await f.F.updateDoc(f.F.doc(f.db, 'pledges', id), patch);
  await audit('pledge.update', id, '', patch.status || '');
}

/* ================================================================
   Staff
   ================================================================ */

export async function listStaff() {
  if (mode === 'demo') return demo.data.staff.slice();
  const f = await loadFirebase();
  const snap = await f.F.getDocs(f.F.collection(f.db, 'staff'));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

export async function saveStaff(id, patch) {
  if (mode === 'demo') {
    const i = demo.data.staff.findIndex(s => s.id === id);
    if (i < 0) demo.data.staff.push(Object.assign({ id: id }, patch));
    else demo.data.staff[i] = Object.assign({}, demo.data.staff[i], patch);
    demo.save();
    await audit('staff.save', id, patch.email || '', patch.role || '');
    return;
  }
  const f = await loadFirebase();
  await f.F.setDoc(f.F.doc(f.db, 'staff', id), patch, { merge: true });
  await audit('staff.save', id, patch.email || '', patch.role || '');
}

/* ================================================================
   Audit trail
   ================================================================ */

export async function audit(action, targetId, targetRef, detail) {
  const who = session.staff || { id: 'system', name: 'System' };
  const rec = {
    action: action, targetId: targetId || '', targetRef: targetRef || '',
    detail: String(detail || '').slice(0, 400),
    byUid: who.id, byName: who.name || 'Staff',
    at: new Date().toISOString()
  };
  if (mode === 'demo') {
    demo.data.audit.unshift(rec);
    demo.data.audit = demo.data.audit.slice(0, 500);
    return;
  }
  try {
    const f = await loadFirebase();
    rec.at = f.F.serverTimestamp();
    await f.F.addDoc(f.F.collection(f.db, 'audit'), rec);
  } catch (e) { /* the audit line must never block the action itself */ }
}

export async function listAudit() {
  if (mode === 'demo') return demo.data.audit.slice(0, 300);
  const f = await loadFirebase();
  const snap = await f.F.getDocs(f.F.query(f.F.collection(f.db, 'audit'), f.F.orderBy('at', 'desc'), f.F.limit(300)));
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
}

/* ================================================================
   Demo backend
   ================================================================ */

const demo = {
  data: null,
  load() {
    if (this.data) return;
    const raw = localStorage.getItem('ichar.admin.demo');
    if (raw) {
      try { this.data = JSON.parse(raw); return; } catch (e) { /* rebuild below */ }
    }
    this.data = seed();
    this.save();
  },
  save() {
    try { localStorage.setItem('ichar.admin.demo', JSON.stringify(this.data)); } catch (e) {}
  },
  reset() {
    localStorage.removeItem('ichar.admin.demo');
    this.data = null;
    this.load();
  }
};

export function resetDemo() { demo.reset(); }

function seed() {
  const staff = [
    { id: 'u1', name: 'Aswin Karthik S', email: 'chair@ichar.org', role: 'admin', office: OFFICES[0], active: true },
    { id: 'u2', name: 'Ashish', email: 'hr.secretary@ichar.org', role: 'director', office: OFFICES[0], active: true },
    { id: 'u3', name: 'Subbulakshmi', email: 'ar.secretary@ichar.org', role: 'director', office: OFFICES[3], active: true },
    { id: 'u4', name: 'Nandini Rao', email: 'legal.delhi@ichar.org', role: 'legal', office: OFFICES[0], active: true },
    { id: 'u5', name: 'Imran Qureshi', email: 'legal.mumbai@ichar.org', role: 'legal', office: OFFICES[2], active: true },
    { id: 'u6', name: 'Desk, New Delhi', email: 'intake@ichar.org', role: 'intake', office: OFFICES[0], active: true }
  ];

  const samples = [
    ['Human Rights', 'Emergency', 'Chattarpur, New Delhi', 'Domestic violence complaint, the station refused to record an FIR and the woman has been sent back to the house twice.', 'A woman and two children', true, ['Medical or hospital records', 'Witnesses willing to speak'], 'Police station'],
    ['Animal Rights', 'Urgent', 'Tiruvallur, Chennai', 'Community dogs are being removed from the layout at night by a private contractor. Residents report a van with no municipal marking.', 'Community animals, roughly twenty', true, ['Photographs or video'], 'Municipal or local body'],
    ['Environmental Rights', 'Standard', 'Bhandup, Mumbai', 'Untreated effluent entering a nullah from a small industrial estate. The smell carries into two schools nearby.', 'A locality of about four thousand', true, ['Photographs or video', 'Official or municipal correspondence'], 'Pollution control board'],
    ['Human Rights', 'Urgent', 'Howrah, Kolkata', 'Bonded work at a brick kiln. Wages withheld for five months and identity documents held by the owner.', 'Eleven workers and their families', true, ['Witnesses willing to speak'], 'No one yet'],
    ['Animal Rights', 'Emergency', 'Karol Bagh, New Delhi', 'A working horse collapsed in traffic and was left without water. The owner continues to load the cart daily.', 'One horse', true, ['Photographs or video'], 'No one yet'],
    ['Human Rights', 'Standard', 'Perambur, Chennai', 'A child has been kept out of school and put to work in a roadside eatery during school hours.', 'A boy, about eleven', true, ['Witnesses willing to speak'], 'No one yet'],
    ['Environmental Rights', 'Urgent', 'New Town, Kolkata', 'Wetland filling under way at night. Trucks tipping construction debris into a listed water body.', 'A wetland and the settlements around it', true, ['Photographs or video'], 'A commission (NHRC, NCW, NCPCR, AWBI)'],
    ['Animal Rights', 'Standard', 'Vasai, Mumbai', 'A shop is selling birds in cages far too small, with no water. Two were dead in the cage yesterday.', 'Roughly forty birds', true, ['Photographs or video'], 'No one yet'],
    ['Human Rights', 'Emergency', 'Seelampur, New Delhi', 'Eviction notice served without hearing. Demolition is set for the coming week and the families have nowhere to go.', 'Around sixty households', true, ['Official or municipal correspondence', 'Witnesses willing to speak'], 'Municipal or local body'],
    ['Environmental Rights', 'Standard', 'Guindy, Chennai', 'Burning of mixed waste behind a market every evening. Smoke enters the ward hospital.', 'A ward of the city', true, ['Photographs or video'], 'Municipal or local body'],
    ['Human Rights', 'Urgent', 'Dharavi, Mumbai', 'Wages below the notified minimum for sanitation contract workers, and no protective equipment issued.', 'Thirty-two contract workers', true, ['Official or municipal correspondence'], 'No one yet'],
    ['Animal Rights', 'Urgent', 'Salt Lake, Kolkata', 'A resident welfare association has passed a resolution barring the feeding of community dogs and has threatened the feeders.', 'Community animals and their caregivers', true, ['Official or municipal correspondence', 'Witnesses willing to speak'], 'Police station']
  ];

  const names = ['Meera Nair', 'Rakesh Gupta', 'Farida Sheikh', 'Joseph Mathew', 'Anita Kulkarni', 'Vikram Shetty', 'Sunil Barman', 'Latha Ramesh'];
  const relations = ['I am affected', 'A family member or friend is affected', 'I witnessed it', 'I work with an organisation'];
  const offices = { 'Human Rights': OFFICES[0], 'Animal Rights': OFFICES[3], 'Environmental Rights': OFFICES[2] };

  const cases = [];
  const timeline = [];
  const status = {};
  const now = Date.now();

  for (let i = 0; i < 34; i++) {
    const s = samples[i % samples.length];
    const ageDays = Math.floor(Math.pow(i / 34, 1.5) * 95) + (i % 4);
    const created = new Date(now - ageDays * 86400000 - (i * 3600000) % 86400000).toISOString();
    const anonymous = i % 7 === 3;
    const stage = i < 3 ? 1 : (i % 9 === 0 ? 4 : (i % 3 === 0 ? 3 : (i % 2 === 0 ? 2 : 1)));
    const closed = i > 24 && i % 5 === 0;
    const division = s[0];
    const id = 'demo' + String(i + 1).padStart(3, '0');
    const ref = 'ICH-' + new Date(created).getFullYear() + '-' + DIVISION_CODE[division] +
      ('DEMO' + String(i + 1)).slice(0, 6).toUpperCase().padEnd(6, 'X');
    const office = i % 6 === 5 ? OFFICES[1] : offices[division];
    const assignee = i < 3 ? null : staff[3 + (i % 2)];

    const c = {
      id: id, ref: ref, division: division,
      urgency: s[1], priority: s[1],
      where: s[2], when: fmtDay(new Date(new Date(created).getTime() - 86400000 * (1 + i % 5))),
      summary: s[3], affected: s[4], ongoing: s[5], evidence: s[6], authority: s[7],
      anonymous: anonymous,
      name: anonymous ? '' : names[i % names.length],
      email: anonymous ? '' : names[i % names.length].split(' ')[0].toLowerCase() + '@example.com',
      phone: anonymous ? '' : '+91 98' + String(10000000 + i * 137).slice(0, 8),
      relation: relations[i % relations.length],
      share: i % 3 !== 0,
      created: created,
      source: 'website',
      stage: closed ? 4 : stage,
      status: closed ? 'closed' : 'open',
      office: office,
      assignedTo: assignee ? assignee.id : null,
      assignedName: assignee ? assignee.name : '',
      cell: null,
      publicNote: STAGE_PUBLIC_NOTE[(closed ? 4 : stage) - 1],
      firstActionedAt: i < 3 ? null : new Date(new Date(created).getTime() + 3600000 * (6 + i % 40)).toISOString(),
      nextAction: stage >= 2 && !closed ? 'Collect the missing papers and confirm the hearing date' : '',
      nextActionDate: stage >= 2 && !closed ? fmtDay(new Date(now + 86400000 * (2 + i % 9))) : '',
      closedAt: closed ? new Date(now - ageDays * 86400000 + 86400000 * 20).toISOString() : null,
      closureOutcome: closed ? 'Relief obtained' : '',
      closureNote: closed ? 'Authority acted after the second representation. Compliance confirmed with the reporter.' : '',
      tags: []
    };
    c.searchBlob = searchBlob(c);
    cases.push(c);
    status[ref] = {
      ref: ref, division: division, office: office, stage: c.stage, priority: c.priority,
      where: c.where, when: c.when, created: created, publicNote: c.publicNote, closed: closed
    };

    timeline.push({
      caseId: id, type: 'created', body: 'Report received from the website.',
      byUid: 'system', byName: 'Website', at: created, meta: {}, internal: false
    });
    if (assignee) {
      timeline.push({
        caseId: id, type: 'assign',
        body: 'Routed to ' + office + ' and assigned to ' + assignee.name + '.',
        byUid: 'u6', byName: 'Desk, New Delhi',
        at: new Date(new Date(created).getTime() + 7200000).toISOString(), meta: {}, internal: true
      });
    }
    if (c.stage >= 2) {
      timeline.push({
        caseId: id, type: 'stage', body: 'Moved to Documentation.',
        byUid: 'u4', byName: 'Nandini Rao',
        at: new Date(new Date(created).getTime() + 86400000).toISOString(),
        meta: { from: 1, to: 2 }, internal: true
      });
      timeline.push({
        caseId: id, type: 'note',
        body: 'Spoke to the reporter. Facts confirmed. Asked for the copy of the complaint already given at the station.',
        byUid: 'u4', byName: 'Nandini Rao',
        at: new Date(new Date(created).getTime() + 90000000).toISOString(), meta: {}, internal: true
      });
    }
    if (c.stage >= 3) {
      timeline.push({
        caseId: id, type: 'legal', body: 'Representation filed.',
        byUid: 'u4', byName: 'Nandini Rao',
        at: new Date(new Date(created).getTime() + 86400000 * 4).toISOString(),
        meta: { filingType: 'Representation to authority', authority: s[7], filedOn: fmtDay(new Date(new Date(created).getTime() + 86400000 * 4)), reference: 'REP/' + (1200 + i) },
        internal: true
      });
    }
    if (closed) {
      timeline.push({
        caseId: id, type: 'close', body: 'Case closed. Relief obtained.',
        byUid: 'u2', byName: 'Ashish',
        at: c.closedAt, meta: { outcome: 'Relief obtained' }, internal: true
      });
    }
  }

  const designations = ['Where it is needed most', 'Human Rights Division', 'Animal Rights Division', 'Environmental Rights Division', 'Legal aid fund'];
  const pledges = [];
  for (let i = 0; i < 14; i++) {
    pledges.push({
      id: 'p' + i,
      ref: 'ICH-P-' + (1000 + i * 137),
      amount: [500, 1000, 2500, 5000, 10000, 25000][i % 6],
      frequency: i % 3 === 0 ? 'Monthly' : 'One-time',
      designation: designations[i % designations.length],
      name: names[i % names.length],
      email: names[i % names.length].split(' ')[0].toLowerCase() + '@example.com',
      created: new Date(now - i * 4 * 86400000).toISOString(),
      status: i % 4 === 0 ? 'Received' : 'Pledged',
      receiptNo: i % 4 === 0 ? 'R/2026/' + (300 + i) : '',
      note: ''
    });
  }

  return {
    staff: staff, cases: cases, timeline: timeline, files: [], pledges: pledges,
    status: status, audit: [], settings: { offices: OFFICES, divisions: DIVISIONS, priorities: PRIORITIES }
  };
}
