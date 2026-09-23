/* Boots the portal: sign in, navigation, routing. */

import { mode, init, onAuth, signIn, signOut, sendReset, session, listCases } from './store.js';
import { qs, esc } from './util.js';
import { toast } from './ui.js';
import { ROLE_LABEL } from './config.js';

import dashboard from './views/dashboard.js';
import cases from './views/cases.js';
import caseDetail from './views/case-detail.js';
import pledges from './views/pledges.js';
import staff from './views/staff.js';
import audit from './views/audit.js';

const ROUTES = [
  { path: 'overview', title: 'Overview', view: dashboard, nav: 'Work' },
  { path: 'cases', title: 'Cases', view: cases, nav: 'Work' },
  { path: 'case', title: 'Case', view: caseDetail, hidden: true },
  { path: 'pledges', title: 'Pledges', view: pledges, nav: 'Work' },
  { path: 'staff', title: 'Staff', view: staff, nav: 'Council', roles: ['admin'] },
  { path: 'audit', title: 'Activity log', view: audit, nav: 'Council', roles: ['admin', 'director'] }
];

/* Counts shown beside the navigation items. */
export const counts = { cases: 0, unassigned: 0, overdue: 0 };

let current = null;

/* ---------- sign in ---------- */

function showGate(message) {
  qs('#gate').hidden = false;
  qs('#shell').hidden = true;
  const note = qs('#gate-note');
  if (mode === 'demo') {
    note.innerHTML = 'Demo mode. Firebase is not connected yet, so the portal is running on ' +
      'sample cases held in this browser. Sign in with <b>chair@ichar.org</b> and any password.';
  } else {
    note.textContent = '';
  }
  if (message) {
    const err = qs('#gate-err');
    err.textContent = message;
    err.hidden = false;
  }
}

function wireGate() {
  const form = qs('#signin-form');
  const err = qs('#gate-err');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    const btn = qs('#gate-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in';
    try {
      await signIn(qs('#gate-email').value.trim(), qs('#gate-pass').value);
      if (mode === 'demo') start();
    } catch (ex) {
      err.textContent = readableAuthError(ex);
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  qs('#gate-reset').addEventListener('click', async () => {
    const email = qs('#gate-email').value.trim();
    if (!email) {
      err.textContent = 'Enter your work email first, then ask for the link.';
      err.hidden = false;
      return;
    }
    try {
      await sendReset(email);
      toast('Reset link sent to ' + email);
    } catch (ex) {
      err.textContent = readableAuthError(ex);
      err.hidden = false;
    }
  });
}

function readableAuthError(ex) {
  const code = (ex && ex.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'That email and password do not match an account. Check the address, or ask for a reset link.';
  }
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a few minutes and try again.';
  if (code.includes('network')) return 'No connection to the server. Check the network and try again.';
  return (ex && ex.message) || 'Sign in failed.';
}

/* ---------- navigation ---------- */

function buildNav() {
  const role = (session.staff && session.staff.role) || 'viewer';
  const nav = qs('#rail-nav');
  nav.innerHTML = '';
  const groups = [];
  ROUTES.forEach(r => {
    if (r.hidden) return;
    if (r.roles && r.roles.indexOf(role) < 0) return;
    let g = groups.find(x => x.name === r.nav);
    if (!g) { g = { name: r.nav, items: [] }; groups.push(g); }
    g.items.push(r);
  });
  groups.forEach(g => {
    nav.insertAdjacentHTML('beforeend', '<div class="rail-group"><span>' + esc(g.name) + '</span></div>');
    g.items.forEach(r => {
      const a = document.createElement('a');
      a.className = 'rail-link';
      a.href = '#/' + r.path;
      a.dataset.path = r.path;
      a.innerHTML = '<span>' + esc(r.title) + '</span><span class="count" data-count="' + r.path + '"></span>';
      nav.appendChild(a);
    });
  });

  qs('#rail-who').innerHTML =
    '<b>' + esc(session.staff.name || session.user.email) + '</b>' +
    '<span>' + esc(ROLE_LABEL[role] || role) + ' at ' + esc(session.staff.office || 'ICHAR') + '</span>';
}

export function paintCounts() {
  const set = (path, n) => {
    const node = document.querySelector('[data-count="' + path + '"]');
    if (node) node.textContent = n > 0 ? n : '';
  };
  set('cases', counts.cases);
}

export async function refreshCounts() {
  try {
    const all = await listCases();
    counts.cases = all.filter(c => c.status === 'open').length;
    counts.unassigned = all.filter(c => c.status === 'open' && !c.assignedTo).length;
    paintCounts();
  } catch (e) { /* counts are a convenience, never block the view */ }
}

function markActive(path) {
  document.querySelectorAll('.rail-link').forEach(a => {
    if (a.dataset.path === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

/* ---------- routing ---------- */

export function go(hash) { location.hash = hash; }

export function setHeader(title, sub, actions) {
  qs('#page-title').textContent = title;
  qs('#page-sub').textContent = sub || '';
  const bar = qs('#page-actions');
  bar.innerHTML = '';
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.kind || 'ghost') + ' sm';
    b.textContent = a.label;
    b.addEventListener('click', a.onClick);
    bar.appendChild(b);
  });
}

async function route() {
  const raw = (location.hash || '#/overview').replace(/^#\/?/, '').split('?')[0];
  const [path, arg] = raw.split('/');
  const r = ROUTES.find(x => x.path === path) || ROUTES[0];
  const role = (session.staff && session.staff.role) || 'viewer';

  if (r.roles && r.roles.indexOf(role) < 0) {
    qs('#view').innerHTML = '<div class="empty"><b>Not your section</b>' +
      '<span>Your role does not open this part of the portal. Ask an administrator if you need it.</span></div>';
    return;
  }

  markActive(r.path);
  document.body.classList.remove('nav-open');
  const view = qs('#view');
  view.innerHTML = '<div class="loading"><span class="spinner"></span><span>Loading</span></div>';

  if (current && current.destroy) current.destroy();
  try {
    current = await r.view.mount(view, arg);
  } catch (ex) {
    console.error(ex);
    view.innerHTML = '<div class="empty"><b>This section did not load</b><span>' +
      esc(ex.message || 'Something went wrong reading from the database.') + '</span></div>';
  }
  view.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

/* ---------- start ---------- */

function start() {
  qs('#gate').hidden = true;
  qs('#shell').hidden = false;
  buildNav();
  refreshCounts();
  route();
}

async function main() {
  wireGate();
  qs('#signout').addEventListener('click', async () => {
    await signOut();
    location.hash = '';
    location.reload();
  });
  qs('#railtoggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  window.addEventListener('hashchange', route);

  await init();

  onAuth(s => {
    if (!s) return showGate();
    if (s.noProfile) {
      return showGate('You have an account but no staff record yet. An administrator has to add you before the portal will open.');
    }
    if (s.inactive) {
      return showGate('This account has been switched off. Speak to an administrator.');
    }
    start();
  });
}

main();
