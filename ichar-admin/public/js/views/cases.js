/* The case inbox. Filter, sort, work in bulk, export. */

import { listCases, listStaff, updateCase, createCase, session } from '../store.js';
import { el, esc, fmtDate, ago, slaState, toCSV, download, debounce, toDate, stageName } from '../util.js';
import { priorityBadge, stageBadge, modal, field, readForm, toast, confirmAction } from '../ui.js';
import { setHeader, go, refreshCounts } from '../app.js';
import { DIVISIONS, OFFICES, PRIORITIES, STAGES, CAN, AUTHORITIES, CELLS, PAGE_SIZE } from '../config.js';

const can = what => (CAN[what] || []).indexOf(session.staff.role) >= 0;

export default {
  async mount(root, arg) {
    const params = readParams();
    let all = await listCases();
    let staff = await listStaff();
    let selected = new Set();
    let page = 1;
    let sort = { key: 'created', dir: -1 };

    const state = {
      q: params.q || '',
      division: params.division || '',
      priority: params.priority || '',
      stage: params.stage || '',
      office: params.office || '',
      assigned: params.mine ? session.staff.id : (params.unassigned ? '__none' : (params.assigned || '')),
      status: params.status || 'open',
      sla: params.sla || '',
      from: params.from || '',
      to: params.to || ''
    };

    setHeader('Cases', '', [
      { label: 'Export what I see', onClick: () => exportCsv() },
      can('editCase') ? { label: 'Log a case at the desk', kind: '', onClick: () => deskIntake() } : null
    ].filter(Boolean));

    root.innerHTML = '';
    const wrap = el('<div class="stack"></div>');
    const filterBar = el('<div class="filters"></div>');
    const bulkHolder = el('<div></div>');
    const tableHolder = el('<div></div>');
    const pager = el('<div class="pager"></div>');
    wrap.appendChild(filterBar);
    wrap.appendChild(bulkHolder);
    wrap.appendChild(tableHolder);
    wrap.appendChild(pager);
    root.appendChild(wrap);

    buildFilters();
    render();

    /* ---------- filters ---------- */

    function buildFilters() {
      filterBar.innerHTML = '';
      const search = field({ label: 'Search', name: 'q', value: state.q, placeholder: 'Reference, place, name, words in the report', wide: true });
      search.querySelector('input').addEventListener('input', debounce(e => {
        state.q = e.target.value; page = 1; render();
      }, 240));
      filterBar.appendChild(search);

      const add = (label, name, options) => {
        const f = field({ label: label, name: name, type: 'select', value: state[name], options: options });
        f.querySelector('select').addEventListener('change', e => {
          state[name] = e.target.value; page = 1; render();
        });
        filterBar.appendChild(f);
      };

      add('Division', 'division', [{ value: '', label: 'All divisions' }].concat(DIVISIONS));
      add('Priority', 'priority', [{ value: '', label: 'All priorities' }].concat(PRIORITIES));
      add('Stage', 'stage', [{ value: '', label: 'All stages' }].concat(STAGES.map(s => ({ value: String(s.n), label: s.n + '. ' + s.name }))));
      add('Office', 'office', [{ value: '', label: 'All offices' }].concat(OFFICES));
      add('With', 'assigned', [
        { value: '', label: 'Anyone' },
        { value: '__none', label: 'Not yet assigned' },
        { value: session.staff.id, label: 'Me' }
      ].concat(staff.filter(s => s.id !== session.staff.id).map(s => ({ value: s.id, label: s.name }))));
      add('State', 'status', [
        { value: 'open', label: 'Open' },
        { value: 'closed', label: 'Closed' },
        { value: 'rejected', label: 'Not taken up' },
        { value: '', label: 'Every state' }
      ]);
      add('Response clock', 'sla', [
        { value: '', label: 'Any' },
        { value: 'over', label: 'Overdue' },
        { value: 'soon', label: 'Due within 6 hours' },
        { value: 'met', label: 'Answered' }
      ]);

      const fromF = field({ label: 'Logged from', name: 'from', type: 'date', value: state.from });
      fromF.querySelector('input').addEventListener('change', e => { state.from = e.target.value; page = 1; render(); });
      const toF = field({ label: 'Logged to', name: 'to', type: 'date', value: state.to });
      toF.querySelector('input').addEventListener('change', e => { state.to = e.target.value; page = 1; render(); });
      filterBar.appendChild(fromF);
      filterBar.appendChild(toF);

      const clear = el('<div class="field" style="flex:0 0 auto"><span class="label">&nbsp;</span>' +
        '<button class="btn ghost" type="button">Clear filters</button></div>');
      clear.querySelector('button').addEventListener('click', () => {
        Object.keys(state).forEach(k => state[k] = '');
        state.status = 'open';
        page = 1;
        buildFilters();
        render();
      });
      filterBar.appendChild(clear);
    }

    /* ---------- filtering and sorting ---------- */

    function filtered() {
      const q = state.q.trim().toLowerCase();
      return all.filter(c => {
        if (state.status && c.status !== state.status) return false;
        if (state.division && c.division !== state.division) return false;
        if (state.priority && c.priority !== state.priority) return false;
        if (state.stage && String(c.stage) !== String(state.stage)) return false;
        if (state.office && c.office !== state.office) return false;
        if (state.assigned === '__none' && c.assignedTo) return false;
        if (state.assigned && state.assigned !== '__none' && c.assignedTo !== state.assigned) return false;
        if (state.sla && slaState(c).key !== state.sla) return false;
        if (state.from && (toDate(c.created) || 0) < new Date(state.from + 'T00:00:00')) return false;
        if (state.to && (toDate(c.created) || 0) > new Date(state.to + 'T23:59:59')) return false;
        if (q) {
          const blob = (c.searchBlob || '') + ' ' + [c.ref, c.where, c.summary, c.name, c.email, c.assignedName].join(' ').toLowerCase();
          if (blob.indexOf(q) < 0) return false;
        }
        return true;
      }).sort((a, b) => {
        const get = c => {
          if (sort.key === 'created') return toDate(c.created) || 0;
          if (sort.key === 'priority') return ['Emergency', 'Urgent', 'Standard'].indexOf(c.priority);
          if (sort.key === 'sla') { const d = slaState(c); return d.key === 'over' ? 0 : d.key === 'soon' ? 1 : 2; }
          return String(c[sort.key] || '').toLowerCase();
        };
        const x = get(a), y = get(b);
        if (x < y) return -1 * sort.dir;
        if (x > y) return 1 * sort.dir;
        return 0;
      });
    }

    /* ---------- table ---------- */

    function render() {
      const rows = filtered();
      const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
      if (page > pages) page = pages;
      const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

      setHeader('Cases', rows.length + (rows.length === 1 ? ' file' : ' files') +
        (state.status === 'open' ? ' open' : '') + ' after filters', [
        { label: 'Export what I see', onClick: () => exportCsv(rows) },
        can('editCase') ? { label: 'Log a case at the desk', onClick: () => deskIntake() } : null
      ].filter(Boolean));

      tableHolder.innerHTML = '';
      if (!rows.length) {
        tableHolder.appendChild(el('<div class="table-wrap"><div class="empty"><b>No files match</b>' +
          '<span>Widen the filters, or clear them to see everything again.</span></div></div>'));
        pager.innerHTML = '';
        renderBulk();
        return;
      }

      const th = (key, label) => '<th class="sortable" data-sort="' + key + '">' + label +
        (sort.key === key ? (sort.dir === 1 ? ' \u2191' : ' \u2193') : '') + '</th>';

      const table = el('<div class="table-wrap"><table><thead><tr>' +
        (can('assign') ? '<th style="width:34px"><input type="checkbox" data-all aria-label="Select all on this page"></th>' : '') +
        th('ref', 'Reference') +
        th('division', 'Division') +
        th('priority', 'Priority') +
        th('where', 'Where') +
        th('stage', 'Stage') +
        th('assignedName', 'With') +
        th('sla', 'Response clock') +
        th('created', 'Logged') +
        '</tr></thead><tbody></tbody></table></div>');

      const tb = table.querySelector('tbody');
      slice.forEach(c => {
        const sla = slaState(c);
        const tr = el('<tr' + (selected.has(c.id) ? ' class="sel"' : '') + '>' +
          (can('assign') ? '<td><input type="checkbox" data-pick="' + c.id + '"' + (selected.has(c.id) ? ' checked' : '') + ' aria-label="Select ' + esc(c.ref) + '"></td>' : '') +
          '<td><span class="ref">' + esc(c.ref) + '</span>' +
          (c.anonymous ? '<span class="line2">Anonymous</span>' : '<span class="line2">' + esc(c.name || 'No name given') + '</span>') + '</td>' +
          '<td>' + esc(c.division || 'Unrouted') + (c.cell ? '<span class="line2">' + esc(c.cell) + '</span>' : '') + '</td>' +
          '<td>' + priorityBadge(c.priority) + '</td>' +
          '<td><span class="cellclip">' + esc(c.where || '-') + '</span>' +
          '<span class="line2 cellclip">' + esc((c.summary || '').slice(0, 70)) + '</span></td>' +
          '<td>' + stageBadge(c.stage, c.status) + '</td>' +
          '<td>' + (c.assignedName ? esc(c.assignedName) : '<span class="muted">Unassigned</span>') +
          (c.office ? '<span class="line2">' + esc(c.office.replace('Branch Office, ', '').replace('Head Office, ', '')) + '</span>' : '') + '</td>' +
          '<td class="' + (sla.key === 'over' ? 'overdue' : '') + '"><span class="nowrap">' + esc(sla.label) + '</span></td>' +
          '<td><span class="nowrap">' + esc(fmtDate(c.created)) + '</span><span class="line2">' + esc(ago(c.created)) + '</span></td>' +
          '</tr>');

        tr.addEventListener('click', e => {
          if (e.target.matches('input[type=checkbox]')) return;
          go('#/case/' + c.id);
        });
        const box = tr.querySelector('[data-pick]');
        if (box) box.addEventListener('change', e => {
          if (e.target.checked) selected.add(c.id); else selected.delete(c.id);
          tr.classList.toggle('sel', e.target.checked);
          renderBulk();
        });
        tb.appendChild(tr);
      });

      table.querySelectorAll('[data-sort]').forEach(h => {
        h.addEventListener('click', () => {
          const key = h.dataset.sort;
          if (sort.key === key) sort.dir *= -1;
          else sort = { key: key, dir: key === 'created' ? -1 : 1 };
          render();
        });
      });
      const allBox = table.querySelector('[data-all]');
      if (allBox) allBox.addEventListener('change', e => {
        slice.forEach(c => { if (e.target.checked) selected.add(c.id); else selected.delete(c.id); });
        render();
      });

      tableHolder.appendChild(table);

      pager.innerHTML = '';
      pager.appendChild(el('<span class="small muted">Page ' + page + ' of ' + pages + '</span>'));
      const prev = el('<button class="btn ghost sm"' + (page <= 1 ? ' disabled' : '') + '>Previous</button>');
      const next = el('<button class="btn ghost sm"' + (page >= pages ? ' disabled' : '') + '>Next</button>');
      prev.addEventListener('click', () => { page--; render(); window.scrollTo({ top: 0 }); });
      next.addEventListener('click', () => { page++; render(); window.scrollTo({ top: 0 }); });
      pager.appendChild(prev);
      pager.appendChild(next);

      renderBulk();
    }

    /* ---------- bulk actions ---------- */

    function renderBulk() {
      bulkHolder.innerHTML = '';
      if (!selected.size || !can('assign')) return;
      const bar = el('<div class="bulkbar"><span><b>' + selected.size + '</b> selected</span></div>');
      const act = (label, fn) => {
        const b = el('<button class="btn sm">' + esc(label) + '</button>');
        b.addEventListener('click', fn);
        bar.appendChild(b);
      };
      act('Assign', () => bulkAssign());
      act('Route to an office', () => bulkOffice());
      if (can('changeStage')) act('Move stage', () => bulkStage());
      act('Clear selection', () => { selected.clear(); render(); });
      bulkHolder.appendChild(bar);
    }

    function bulkAssign() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({
        label: 'Assign to', name: 'assignedTo', type: 'select',
        options: [{ value: '', label: 'Nobody, leave in the queue' }].concat(staff.filter(s => s.active !== false).map(s => ({ value: s.id, label: s.name + ' (' + s.office + ')' })))
      }));
      modal({
        title: 'Assign ' + selected.size + ' files',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Assign', kind: '',
          onClick: async () => {
            const v = readForm(form);
            const person = staff.find(s => s.id === v.assignedTo);
            await eachSelected(c => updateCase(c.id, {
              assignedTo: v.assignedTo || null,
              assignedName: person ? person.name : ''
            }, { type: 'assign', body: person ? 'Assigned to ' + person.name + '.' : 'Returned to the queue.' }));
            toast(selected.size + ' files assigned');
            await reload();
          }
        }]
      });
    }

    function bulkOffice() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({ label: 'Office', name: 'office', type: 'select', options: OFFICES }));
      modal({
        title: 'Route ' + selected.size + ' files',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Route', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await eachSelected(c => updateCase(c.id, { office: v.office },
              { type: 'route', body: 'Routed to ' + v.office + '.' }));
            toast(selected.size + ' files routed');
            await reload();
          }
        }]
      });
    }

    function bulkStage() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({
        label: 'Move to stage', name: 'stage', type: 'select',
        options: STAGES.map(s => ({ value: String(s.n), label: s.n + '. ' + s.name }))
      }));
      modal({
        title: 'Move ' + selected.size + ' files',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Move', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await eachSelected(c => updateCase(c.id, {
              stage: Number(v.stage),
              firstActionedAt: c.firstActionedAt || new Date().toISOString()
            }, { type: 'stage', body: 'Moved to ' + stageName(v.stage) + '.', meta: { from: c.stage, to: Number(v.stage) } }));
            toast(selected.size + ' files moved');
            await reload();
          }
        }]
      });
    }

    async function eachSelected(fn) {
      const ids = Array.from(selected);
      for (const id of ids) {
        const c = all.find(x => x.id === id);
        if (c) await fn(c);
      }
    }

    async function reload() {
      all = await listCases();
      selected.clear();
      render();
      refreshCounts();
    }

    /* ---------- desk intake ---------- */

    function deskIntake() {
      const form = el('<div class="stack"></div>');
      const r1 = el('<div class="row"></div>');
      r1.appendChild(field({ label: 'Division', name: 'division', type: 'select', options: DIVISIONS }));
      r1.appendChild(field({ label: 'Priority', name: 'priority', type: 'select', options: PRIORITIES, value: 'Standard' }));
      form.appendChild(r1);
      form.appendChild(field({ label: 'What happened', name: 'summary', type: 'textarea', rows: 5, placeholder: 'What happened, to whom, and who is responsible as far as is known.' }));
      const r2 = el('<div class="row"></div>');
      r2.appendChild(field({ label: 'Where', name: 'where', placeholder: 'Locality, city, state' }));
      r2.appendChild(field({ label: 'When', name: 'when', type: 'date' }));
      form.appendChild(r2);
      form.appendChild(field({ label: 'Who is affected', name: 'affected', placeholder: 'A person, a group, community animals, a locality' }));
      const r3 = el('<div class="row"></div>');
      r3.appendChild(field({ label: 'Reporter', name: 'name', placeholder: 'Leave blank if anonymous' }));
      r3.appendChild(field({ label: 'Email', name: 'email', type: 'email' }));
      r3.appendChild(field({ label: 'Phone', name: 'phone', type: 'tel' }));
      form.appendChild(r3);
      const r4 = el('<div class="row"></div>');
      r4.appendChild(field({ label: 'Authority already approached', name: 'authority', type: 'select', options: AUTHORITIES }));
      r4.appendChild(field({ label: 'Office', name: 'office', type: 'select', options: OFFICES, value: session.staff.office }));
      form.appendChild(r4);
      form.appendChild(field({ label: 'How it reached us', name: 'source', type: 'select', options: ['Telephone', 'Email', 'Walk-in', 'Letter', 'Partner referral'] }));

      modal({
        title: 'Log a case at the desk',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Open the file', kind: '',
          onClick: async () => {
            const v = readForm(form);
            if (!v.summary || v.summary.trim().length < 20) {
              toast('Write a little more about what happened before opening the file', true);
              return 'keep';
            }
            if (!v.where) { toast('Add at least the city', true); return 'keep'; }
            v.anonymous = !v.name;
            const id = await createCase(v);
            toast('File opened');
            await reload();
            go('#/case/' + id);
          }
        }]
      });
    }

    /* ---------- export ---------- */

    function exportCsv(rows) {
      const data = rows || filtered();
      const cols = [
        { label: 'Reference', get: c => c.ref },
        { label: 'Logged', get: c => fmtDate(c.created) },
        { label: 'Division', get: c => c.division },
        { label: 'Cell', get: c => c.cell || '' },
        { label: 'Priority', get: c => c.priority },
        { label: 'Stage', get: c => c.stage + '. ' + stageName(c.stage) },
        { label: 'State', get: c => c.status },
        { label: 'Office', get: c => c.office || '' },
        { label: 'With', get: c => c.assignedName || '' },
        { label: 'Where', get: c => c.where || '' },
        { label: 'Incident date', get: c => c.when || '' },
        { label: 'Affected', get: c => c.affected || '' },
        { label: 'Still happening', get: c => c.ongoing ? 'Yes' : 'No' },
        { label: 'Evidence offered', get: c => (c.evidence || []).join('; ') },
        { label: 'Authority approached', get: c => c.authority || '' },
        { label: 'Anonymous', get: c => c.anonymous ? 'Yes' : 'No' },
        { label: 'Reporter', get: c => c.name || '' },
        { label: 'Email', get: c => c.email || '' },
        { label: 'Phone', get: c => c.phone || '' },
        { label: 'Relation', get: c => c.relation || '' },
        { label: 'May be shared', get: c => c.share ? 'Yes' : 'No' },
        { label: 'Response clock', get: c => slaState(c).label },
        { label: 'Next action', get: c => c.nextAction || '' },
        { label: 'Next action due', get: c => c.nextActionDate || '' },
        { label: 'Outcome', get: c => c.closureOutcome || '' },
        { label: 'Summary', get: c => c.summary || '' }
      ];
      download('ichar-cases-' + new Date().toISOString().slice(0, 10) + '.csv', toCSV(data, cols), 'text/csv');
      toast(data.length + ' rows exported');
    }

    return {};
  }
};

function readParams() {
  const raw = (location.hash.split('?')[1] || '');
  const out = {};
  raw.split('&').filter(Boolean).forEach(pair => {
    const [k, v] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return out;
}
