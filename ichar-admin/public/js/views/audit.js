/* Every change to a file, in order, against a name. Read only by design. */

import { listAudit } from '../store.js';
import { el, esc, fmtDateTime, debounce, toCSV, download } from '../util.js';
import { toast } from '../ui.js';
import { setHeader } from '../app.js';

const READABLE = {
  'case.create': 'opened a file',
  'case.update': 'changed a file',
  'case.note': 'added to the record',
  'case.delete': 'deleted a file',
  'pledge.update': 'updated a pledge',
  'staff.save': 'changed a staff record'
};

export default {
  async mount(root) {
    const rows = await listAudit();
    let q = '';

    setHeader('Activity log', rows.length + ' entries held', [
      { label: 'Export to CSV', onClick: () => exportCsv() }
    ]);

    root.innerHTML = '';
    const wrap = el('<div class="stack"></div>');
    const filters = el('<div class="filters"></div>');
    const holder = el('<div></div>');

    const search = el('<div class="field wide"><label class="label">Search</label>' +
      '<input type="search" placeholder="Reference, person or action"></div>');
    search.querySelector('input').addEventListener('input', debounce(e => { q = e.target.value; render(); }, 220));
    filters.appendChild(search);

    wrap.appendChild(filters);
    wrap.appendChild(holder);
    root.appendChild(wrap);
    render();

    function shown() {
      const needle = q.trim().toLowerCase();
      if (!needle) return rows;
      return rows.filter(r => [r.byName, r.action, r.targetRef, r.detail].join(' ').toLowerCase().indexOf(needle) >= 0);
    }

    function render() {
      const list = shown();
      holder.innerHTML = '';
      if (!list.length) {
        holder.appendChild(el('<div class="table-wrap"><div class="empty"><b>Nothing recorded yet</b>' +
          '<span>Entries appear here as soon as anyone changes a file.</span></div></div>'));
        return;
      }
      const table = el('<div class="table-wrap"><table><thead><tr>' +
        '<th>When</th><th>Who</th><th>What</th><th>File</th><th>Detail</th>' +
        '</tr></thead><tbody></tbody></table></div>');
      const tb = table.querySelector('tbody');
      list.forEach(r => {
        tb.appendChild(el('<tr style="cursor:default">' +
          '<td class="nowrap">' + esc(fmtDateTime(r.at)) + '</td>' +
          '<td>' + esc(r.byName || '-') + '</td>' +
          '<td>' + esc(READABLE[r.action] || r.action) + '</td>' +
          '<td><span class="ref">' + esc(r.targetRef || '-') + '</span></td>' +
          '<td><span class="cellclip">' + esc(r.detail || '') + '</span></td>' +
          '</tr>'));
      });
      holder.appendChild(table);
    }

    function exportCsv() {
      const cols = [
        { label: 'When', get: r => fmtDateTime(r.at) },
        { label: 'Who', get: r => r.byName },
        { label: 'Action', get: r => r.action },
        { label: 'File', get: r => r.targetRef },
        { label: 'Detail', get: r => r.detail }
      ];
      download('ichar-activity-' + new Date().toISOString().slice(0, 10) + '.csv', toCSV(shown(), cols), 'text/csv');
      toast('Exported');
    }

    return {};
  }
};
