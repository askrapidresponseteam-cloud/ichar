import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

/* Boots the portal in a headless DOM and exercises the main flows.
   Run from the tools folder after: npm install jsdom

     node smoke-test.mjs

   It uses demo mode only, so it never touches your Firebase project. */

const ROOT = new URL('../public', import.meta.url).pathname;
const html = readFileSync(ROOT + '/index.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');

const dom = new JSDOM(html, { url: 'http://localhost/#/overview', pretendToBeVisual: true });
const { window } = dom;

// minimal localStorage
const mem = new Map();
const fakeStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  clear: () => mem.clear()
};
Object.defineProperty(window, 'localStorage', { value: fakeStorage, configurable: true });
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
window.scrollTo = () => {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.print = () => {};
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

global.window = window;
global.document = window.document;
global.localStorage = fakeStorage;
global.self = window;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
Object.defineProperty(global, 'location', { value: window.location, configurable: true });
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Blob = window.Blob;
global.getComputedStyle = window.getComputedStyle;
Object.defineProperty(global, 'crypto', { value: webcrypto, configurable: true });

const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + e.message));
const origError = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 200)); };

const url = p => pathToFileURL(ROOT + p).href;

function ok(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '  <<< ' + (extra || '')));
  if (!cond) process.exitCode = 1;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- boot ----
const store = await import(url('/js/store.js'));
const util = await import(url('/js/util.js'));

ok('store starts in demo mode', store.mode === 'demo', store.mode);
await store.init();

const cases = await store.listCases();
ok('demo seed produces cases', cases.length === 34, 'got ' + cases.length);
ok('every case has a reference', cases.every(c => /^ICH-\d{4}-(HR|AR|ER)/.test(c.ref)), cases[0] && cases[0].ref);
ok('every case has a division', cases.every(c => c.division));
ok('stages are within 1 to 4', cases.every(c => c.stage >= 1 && c.stage <= 4));
ok('anonymous cases carry no contact details',
  cases.filter(c => c.anonymous).every(c => !c.email && !c.phone && !c.name));

// util maths
const em = { created: new Date(Date.now() - 48 * 3600000).toISOString(), priority: 'Emergency', status: 'open' };
ok('emergency past 24 hours reads as overdue', util.slaState(em).key === 'over', util.slaState(em).key);
const std = { created: new Date().toISOString(), priority: 'Standard', status: 'open' };
ok('a fresh standard case is inside its clock', util.slaState(std).key === 'ok', util.slaState(std).key);
ok('an answered case stops the clock',
  util.slaState({ created: em.created, priority: 'Emergency', status: 'open', firstActionedAt: new Date().toISOString() }).key === 'met');
ok('reference generator makes the expected shape',
  /^ICH-\d{4}-HR[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(util.makeRef('Human Rights', { 'Human Rights': 'HR' })),
  util.makeRef('Human Rights', { 'Human Rights': 'HR' }));

// reference uniqueness over many draws
const seen = new Set();
for (let i = 0; i < 5000; i++) seen.add(util.makeRef('Human Rights', { 'Human Rights': 'HR' }));
ok('5000 references collide zero times', seen.size === 5000, 'unique ' + seen.size);

// CSV escaping
const csv = util.toCSV([{ a: 'has, comma', b: 'has "quote"' }], [
  { label: 'A', get: r => r.a }, { label: 'B', get: r => r.b }
]);
ok('CSV escapes commas and quotes', csv.includes('"has, comma"') && csv.includes('"has ""quote"""'), csv);

// ---- sign in, then drive the app ----
await store.signIn('chair@ichar.org', 'x');
ok('sign in gives a staff record', !!store.session.staff && store.session.staff.role === 'admin');

const app = await import(url('/js/app.js'));
await sleep(150);

ok('the shell is shown after sign in', document.getElementById('shell').hidden === false);
ok('the sign in gate is hidden', document.getElementById('gate').hidden === true);
ok('navigation is built', document.querySelectorAll('.rail-link').length >= 5,
  document.querySelectorAll('.rail-link').length);

// dashboard
await sleep(250);
ok('overview renders metrics', document.querySelectorAll('.metric').length === 6,
  document.querySelectorAll('.metric').length);
ok('overview shows a queue table or an empty state',
  !!document.querySelector('.panel table') || !!document.querySelector('.empty'));

// case list
window.location.hash = '#/cases';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
const rows = document.querySelectorAll('#view tbody tr');
ok('case list renders rows', rows.length > 0, rows.length);
ok('case list caps at the page size', rows.length <= 40, rows.length);
ok('filter bar is present', document.querySelectorAll('.filters select').length >= 6,
  document.querySelectorAll('.filters select').length);

// filter by division through the hash
window.location.hash = '#/cases?division=' + encodeURIComponent('Animal Rights');
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
const arRows = Array.from(document.querySelectorAll('#view tbody tr'));
const allAnimal = arRows.every(tr => tr.textContent.includes('Animal Rights'));
ok('division filter from a link works', arRows.length > 0 && allAnimal, arRows.length + ' rows');

// unassigned filter
window.location.hash = '#/cases?unassigned=1';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
const unRows = Array.from(document.querySelectorAll('#view tbody tr'));
ok('unassigned filter works', unRows.length > 0 && unRows.every(tr => tr.textContent.includes('Unassigned')),
  unRows.length + ' rows');

// case detail
const first = cases[0];
window.location.hash = '#/case/' + first.id;
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(350);
ok('case detail renders the reference', document.getElementById('page-title').textContent === first.ref,
  document.getElementById('page-title').textContent);
ok('case detail shows the four stages', document.querySelectorAll('.stage-step').length === 4,
  document.querySelectorAll('.stage-step').length);
ok('case detail shows the record of the file', document.querySelectorAll('.tl-item').length > 0);
ok('case detail shows routing controls', document.querySelectorAll('.case-side select').length >= 5,
  document.querySelectorAll('.case-side select').length);

// mutate a case through the store and confirm the mirror follows
await store.updateCase(first.id, { stage: 3, publicNote: 'Filed before the commission.' },
  { type: 'stage', body: 'Moved to Legal action.' });
const after = await store.getCase(first.id);
ok('stage change persists', after.stage === 3, after.stage);
const tl = await store.listTimeline(first.id);
ok('stage change writes a timeline entry', tl.some(t => t.type === 'stage' && /Legal action/.test(t.body)));

// the public mirror must never carry personal data
const mirror = JSON.parse(mem.get('ichar.admin.demo')).status[first.ref];
ok('public mirror exists for the reference', !!mirror);
const mirrorKeys = Object.keys(mirror || {});
const leaky = ['name', 'email', 'phone', 'summary', 'affected', 'relation'].filter(k => mirrorKeys.includes(k));
ok('public mirror carries no personal data', leaky.length === 0, 'leaked: ' + leaky.join(', '));
ok('public mirror follows the stage', mirror.stage === 3, mirror.stage);
ok('public mirror carries the staff line', mirror.publicNote === 'Filed before the commission.');

// closing
await store.updateCase(first.id, {
  status: 'closed', closureOutcome: 'Relief obtained', closedAt: new Date().toISOString(), stage: 4
}, { type: 'close', body: 'File closed.' });
const closed = await store.getCase(first.id);
ok('closing sets the state', closed.status === 'closed');
const mirror2 = JSON.parse(mem.get('ichar.admin.demo')).status[first.ref];
ok('public mirror shows the file as closed', mirror2.closed === true);

// desk intake
const newId = await store.createCase({
  division: 'Environmental Rights', priority: 'Urgent', summary: 'A long enough test summary for validation to pass.',
  where: 'Udupi, Karnataka', source: 'Telephone'
});
const made = await store.getCase(newId);
ok('desk intake opens a file', !!made && made.stage === 1 && made.status === 'open');
ok('desk intake makes a valid reference', /^ICH-\d{4}-ER[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(made.ref), made.ref);

// pledges
window.location.hash = '#/pledges';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
ok('pledges render', document.querySelectorAll('#view tbody tr').length > 0);

// staff
window.location.hash = '#/staff';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
ok('staff list renders', document.querySelectorAll('#view tbody tr').length === 6,
  document.querySelectorAll('#view tbody tr').length);

// audit
window.location.hash = '#/audit';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(300);
ok('activity log records the changes just made',
  document.querySelectorAll('#view tbody tr').length > 0,
  document.querySelectorAll('#view tbody tr').length);

// role gating: a legal officer must not see staff
store.session.staff = { id: 'u4', name: 'Nandini Rao', role: 'legal', office: 'Head Office, New Delhi' };
window.location.hash = '#/staff';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await sleep(250);
ok('a legal officer is refused the staff section',
  /Not your section/.test(document.getElementById('view').textContent));

console.error = origError;
const realErrors = errors.filter(e => !/Could not parse CSS|Error: Not implemented/.test(e));
ok('no runtime errors were logged', realErrors.length === 0, realErrors.slice(0, 4).join(' | '));
console.log('\nDone.');
