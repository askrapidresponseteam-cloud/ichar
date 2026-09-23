/* Small helpers used across the portal. No dependencies. */

import { SLA_HOURS, STAGES } from './config.js';

export const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
};

export const qs = (sel, root) => (root || document).querySelector(sel);
export const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

/* Firestore timestamps, ISO strings and Date objects all arrive here. */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

export function fmtDate(v) {
  const d = toDate(v);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v) {
  const d = toDate(v);
  if (!d) return '-';
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export function fmtDay(v) {
  const d = toDate(v);
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* "3 days ago", "in 4 hours" */
export function ago(v) {
  const d = toDate(v);
  if (!d) return '-';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  const fut = mins < 0;
  const m = Math.abs(mins);
  let out;
  if (m < 1) return 'just now';
  if (m < 60) out = m + (m === 1 ? ' minute' : ' minutes');
  else if (m < 1440) { const h = Math.round(m / 60); out = h + (h === 1 ? ' hour' : ' hours'); }
  else if (m < 43200) { const dd = Math.round(m / 1440); out = dd + (dd === 1 ? ' day' : ' days'); }
  else { const mo = Math.round(m / 43200); out = mo + (mo === 1 ? ' month' : ' months'); }
  return fut ? 'in ' + out : out + ' ago';
}

export function daysOld(v) {
  const d = toDate(v);
  if (!d) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* First-response deadline. Counts from when the report landed. */
export function dueAt(c) {
  const created = toDate(c.created);
  if (!created) return null;
  const hrs = SLA_HOURS[c.priority || c.urgency] || SLA_HOURS.Standard;
  return new Date(created.getTime() + hrs * 3600000);
}

export function slaState(c) {
  if (c.status && c.status !== 'open') return { key: 'done', label: 'Closed' };
  if (c.firstActionedAt) return { key: 'met', label: 'Answered' };
  const due = dueAt(c);
  if (!due) return { key: 'none', label: '-' };
  const left = due.getTime() - Date.now();
  if (left < 0) return { key: 'over', label: 'Overdue by ' + ago(due).replace(' ago', '') };
  if (left < 6 * 3600000) return { key: 'soon', label: 'Due in ' + ago(due).replace('in ', '') };
  return { key: 'ok', label: 'Due ' + fmtDate(due) };
}

export const stageName = n => (STAGES[(Number(n) || 1) - 1] || STAGES[0]).name;

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

export const rupees = n => 'Rs ' + Number(n || 0).toLocaleString('en-IN');

/* Reference numbers. Format stays compatible with the public site:
   ICH-<year>-<division code><6 characters>. Six characters make an accidental
   collision, or a guessed reference, very unlikely. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function makeRef(division, codes) {
  const code = codes[division] || 'GN';
  let tail = '';
  const rnd = new Uint32Array(6);
  (self.crypto || window.crypto).getRandomValues(rnd);
  for (let i = 0; i < 6; i++) tail += ALPHABET[rnd[i] % ALPHABET.length];
  return 'ICH-' + new Date().getFullYear() + '-' + code + tail;
}

/* Everything the free-text box should match on. */
export function searchBlob(c) {
  return [c.ref, c.division, c.where, c.summary, c.affected, c.name, c.email,
    c.phone, c.office, c.assignedName, c.authority, (c.tags || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();
}

export function download(filename, text, mime) {
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toCSV(rows, columns) {
  const cell = v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = columns.map(c => cell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => cell(c.get(r))).join(',')).join('\n');
  return head + '\n' + body;
}

export function bytes(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

export function debounce(fn, ms) {
  let t;
  return function () {
    clearTimeout(t);
    const args = arguments, self = this;
    t = setTimeout(() => fn.apply(self, args), ms || 220);
  };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
