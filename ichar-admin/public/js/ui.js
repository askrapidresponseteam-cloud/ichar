/* Reusable interface pieces. Everything returns plain DOM. */

import { esc, el, qs } from './util.js';

/* ---------- toasts ---------- */

let toastWrap;
export function toast(message, bad) {
  if (!toastWrap) {
    toastWrap = el('<div class="toast-wrap" aria-live="polite"></div>');
    document.body.appendChild(toastWrap);
  }
  const t = el('<div class="toast' + (bad ? ' bad' : '') + '">' + esc(message) + '</div>');
  toastWrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 320);
  }, bad ? 5200 : 3200);
}

/* ---------- modal ---------- */

export function modal(opts) {
  const back = el('<div class="modal-back" role="dialog" aria-modal="true"></div>');
  const box = el(
    '<div class="modal">' +
    '<div class="modal-head"><h2>' + esc(opts.title) + '</h2>' +
    '<button class="btn ghost sm" data-x>Close</button></div>' +
    '<div class="modal-body"></div>' +
    '<div class="modal-foot"></div>' +
    '</div>'
  );
  const body = qs('.modal-body', box);
  const foot = qs('.modal-foot', box);

  if (typeof opts.body === 'string') body.innerHTML = opts.body;
  else if (opts.body) body.appendChild(opts.body);

  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  (opts.actions || []).forEach(a => {
    const b = el('<button class="btn ' + (a.kind || 'ghost') + '">' + esc(a.label) + '</button>');
    b.addEventListener('click', async () => {
      if (!a.onClick) return close();
      b.disabled = true;
      try {
        const keep = await a.onClick({ close, body, button: b });
        if (keep !== 'keep') close();
      } finally { b.disabled = false; }
    });
    foot.appendChild(b);
  });

  qs('[data-x]', box).addEventListener('click', close);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  back.appendChild(box);
  document.body.appendChild(back);

  const first = body.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 40);
  return { close, body };
}

export function confirmAction(opts) {
  return new Promise(resolve => {
    modal({
      title: opts.title,
      body: '<p style="margin:0;line-height:1.6">' + esc(opts.message) + '</p>',
      actions: [
        { label: opts.cancelLabel || 'Cancel', onClick: () => resolve(false) },
        {
          label: opts.confirmLabel || 'Confirm',
          kind: opts.danger ? 'danger' : '',
          onClick: () => resolve(true)
        }
      ]
    });
  });
}

/* ---------- badges ---------- */

export function priorityBadge(p, solid) {
  const key = String(p || 'Standard').toLowerCase();
  return '<span class="badge ' + key + (solid ? ' solid' : '') + '">' + esc(p || 'Standard') + '</span>';
}

export function stageBadge(stage, status) {
  if (status === 'closed') return '<span class="badge green solid">Closed</span>';
  if (status === 'rejected') return '<span class="badge standard solid">Not taken up</span>';
  if (status === 'merged') return '<span class="badge standard">Merged</span>';
  const names = ['Received', 'Documentation', 'Legal action', 'Follow-through'];
  const n = Math.min(4, Math.max(1, Number(stage) || 1));
  return '<span class="badge ink' + (n >= 3 ? ' solid' : '') + '">' + names[n - 1] + '</span>';
}

export function divisionBadge(d) {
  const short = { 'Human Rights': 'Human', 'Animal Rights': 'Animal', 'Environmental Rights': 'Environment' };
  return '<span class="badge standard">' + esc(short[d] || d || 'Unrouted') + '</span>';
}

/* ---------- form builder ---------- */

export function field(opts) {
  const id = 'f_' + Math.random().toString(36).slice(2, 8);
  let control;
  if (opts.type === 'select') {
    const options = (opts.options || []).map(o => {
      const value = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      const sel = String(value) === String(opts.value == null ? '' : opts.value) ? ' selected' : '';
      return '<option value="' + esc(value) + '"' + sel + '>' + esc(label) + '</option>';
    }).join('');
    control = '<select id="' + id + '" name="' + esc(opts.name || '') + '">' + options + '</select>';
  } else if (opts.type === 'textarea') {
    control = '<textarea id="' + id + '" name="' + esc(opts.name || '') + '" rows="' + (opts.rows || 4) +
      '" placeholder="' + esc(opts.placeholder || '') + '">' + esc(opts.value || '') + '</textarea>';
  } else if (opts.type === 'checkbox') {
    return el('<label class="check"><input type="checkbox" name="' + esc(opts.name || '') + '"' +
      (opts.value ? ' checked' : '') + '><span>' + esc(opts.label) + '</span></label>');
  } else {
    control = '<input id="' + id + '" type="' + (opts.type || 'text') + '" name="' + esc(opts.name || '') +
      '" value="' + esc(opts.value == null ? '' : opts.value) + '" placeholder="' + esc(opts.placeholder || '') + '">';
  }
  return el('<div class="field' + (opts.wide ? ' wide' : '') + '">' +
    '<label class="label" for="' + id + '">' + esc(opts.label) + '</label>' + control +
    (opts.hint ? '<span class="small muted">' + esc(opts.hint) + '</span>' : '') +
    '</div>');
}

export function readForm(root) {
  const out = {};
  root.querySelectorAll('input, select, textarea').forEach(i => {
    if (!i.name) return;
    out[i.name] = i.type === 'checkbox' ? i.checked : i.value;
  });
  return out;
}

export function loading(text) {
  return el('<div class="loading"><span class="spinner"></span><span>' + esc(text || 'Loading') + '</span></div>');
}

export function empty(title, line, action) {
  const box = el('<div class="empty"><b>' + esc(title) + '</b><span>' + esc(line || '') + '</span></div>');
  if (action) {
    const b = el('<div style="margin-top:16px"><button class="btn sm">' + esc(action.label) + '</button></div>');
    b.firstElementChild.addEventListener('click', action.onClick);
    box.appendChild(b);
  }
  return box;
}

/* Horizontal bar chart, used on the dashboard. */
export function bars(rows, onPick) {
  const max = Math.max(1, ...rows.map(r => r.value));
  const wrap = el('<div class="bars"></div>');
  rows.forEach(r => {
    const pct = Math.round((r.value / max) * 100);
    const row = el(
      '<div class="bar-row">' +
      '<span class="small">' + esc(r.label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%' +
      (r.color ? ';background:' + r.color : '') + '"></span></span>' +
      '<span class="n">' + r.value + '</span>' +
      '</div>'
    );
    if (onPick) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => onPick(r));
    }
    wrap.appendChild(row);
  });
  return wrap;
}
