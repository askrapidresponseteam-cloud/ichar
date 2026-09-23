/* ICHAR admin - configuration and domain model.
   The domain values below are copied from the public site so that the portal
   and the Report a Violation form always agree. */

/* 1. Paste your Firebase web config here (Project settings > Your apps > Web).
   While the values are left as PASTE_..., the portal runs in demo mode with
   sample cases so you can review the interface before wiring the backend. */
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT.firebaseapp.com',
  projectId: 'PASTE_PROJECT',
  storageBucket: 'PASTE_PROJECT.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID'
};

export const DEMO = String(firebaseConfig.projectId).startsWith('PASTE_');

/* 2. Divisions, exactly as the form submits them. */
export const DIVISIONS = ['Human Rights', 'Animal Rights', 'Environmental Rights'];

export const DIVISION_CODE = {
  'Human Rights': 'HR',
  'Animal Rights': 'AR',
  'Environmental Rights': 'ER'
};

/* Cells sit under the Human Rights division at head office. */
export const CELLS = {
  'Human Rights': ["Women's Rights Cell", "Child Rights Cell", 'General'],
  'Animal Rights': ['Cruelty documentation', 'ABC monitoring', 'Wildlife crime'],
  'Environmental Rights': ['NGT practice', 'Pollution complaints', 'General']
};

/* 3. Priority, as submitted. Staff may override on the case. */
export const PRIORITIES = ['Emergency', 'Urgent', 'Standard'];

/* First-response clock in hours, counted from the moment the report lands. */
export const SLA_HOURS = { Emergency: 24, Urgent: 72, Standard: 168 };

/* 4. The four stages the public tracker shows. Keep names and order in step
   with the Case Status page. */
export const STAGES = [
  { n: 1, name: 'Received', note: 'Logged and routed to a division and office.' },
  { n: 2, name: 'Documentation', note: 'Facts verified, provisions identified, missing material requested.' },
  { n: 3, name: 'Legal action', note: 'Complaint, FIR support, petition or representation filed.' },
  { n: 4, name: 'Follow-through', note: 'Compliance monitored, compensation tracked, outcome recorded.' }
];

/* Default line shown to the reporter at each stage. Staff can replace it per case. */
export const STAGE_PUBLIC_NOTE = [
  'Intake will confirm the division and the handling office within 48 hours.',
  'A legal officer is checking the facts and will tell you what is missing.',
  'The matter is before an authority. You will be told of every filing made in your name.',
  'The file stays open until compliance is confirmed or the matter is formally closed.'
];

/* 5. Offices. Head office plus the three branches. */
export const OFFICES = [
  'Head Office, New Delhi',
  'Branch Office, Chennai',
  'Branch Office, Mumbai',
  'Branch Office, Kolkata'
];

/* 6. Authority already approached, as the form offers it. */
export const AUTHORITIES = [
  'No one yet',
  'Police station',
  'Municipal or local body',
  'Pollution control board',
  'A commission (NHRC, NCW, NCPCR, AWBI)',
  'A court or tribunal'
];

/* 7. Filing types the legal log accepts. */
export const FILING_TYPES = [
  'Written complaint',
  'FIR support',
  'Representation to authority',
  'Commission petition',
  'Writ petition',
  'NGT application',
  'RTI application',
  'Legal notice',
  'Follow-up reminder'
];

/* 8. Closure outcomes. */
export const OUTCOMES = [
  'Relief obtained',
  'Authority acted',
  'Referred to partner',
  'Withdrawn by reporter',
  'Outside our mandate',
  'Insufficient information',
  'Duplicate of another file',
  'No further action possible'
];

/* 9. Roles. Each role inherits everything below it.
   admin    - staff, settings, deletion, everything
   director - assigns, closes, reads every office
   legal    - works the cases assigned to them or to their office
   intake   - logs, triages and routes, cannot close
   viewer   - reads only */
export const ROLES = ['admin', 'director', 'legal', 'intake', 'viewer'];

export const ROLE_LABEL = {
  admin: 'Administrator',
  director: 'Director',
  legal: 'Legal officer',
  intake: 'Intake',
  viewer: 'Read only'
};

export const CAN = {
  manageStaff: ['admin'],
  editSettings: ['admin'],
  deleteCase: ['admin'],
  closeCase: ['admin', 'director'],
  assign: ['admin', 'director', 'intake'],
  changeStage: ['admin', 'director', 'legal'],
  editCase: ['admin', 'director', 'legal', 'intake'],
  addNote: ['admin', 'director', 'legal', 'intake'],
  upload: ['admin', 'director', 'legal', 'intake'],
  managePledges: ['admin', 'director'],
  export: ['admin', 'director', 'legal', 'intake']
};

export const EVIDENCE_TYPES = [
  'Photographs or video',
  'Medical or hospital records',
  'FIR or police papers',
  'Official or municipal correspondence',
  'Witnesses willing to speak',
  'Nothing yet'
];

export const PLEDGE_STATUS = ['Pledged', 'Received', 'Cancelled'];
export const PAGE_SIZE = 40;
