/* Pledges made on the Donate page. Finance confirms receipt and issues a number. */

import { listPledges, updatePledge, session } from '../store.js';
import { el, esc, fmtDate, rupees, toCSV, download, debounce, toDate } from '../util.js';
import { modal, field, readForm, toast } from '../ui.js';
import { setHeader } from '../app.js';
import { PLEDGE_STATUS, CAN } from '../config.js';

const can = what => (CAN[what] || []).indexOf(session.staff.role) >= 0;

export default {
  async mount(root) {
    let rows = await listPledges();
    let q = '';
    let status = '';

    root.innerHTML = '';
    const wrap = el('<div class="stack"></div>');
    const filters = el('<div class="filters"></div>');
    const holder = el('<div></div>');
    wrap.appendChild(filters);
    wrap.appendChild(holder);
    root.appendChild(wrap);

    const search = field({ label: 'Search', name: 'q', placeholder: 'Reference, name or email', wide: true });
    search.querySelector('input').addEventListener('input', debounce(e => { q = e.target.value; render(); }, 220));
    filters.appendChild(search);

    const st = field({
      label: 'State', name: 'status', type: 'select',
      options: [{ value: '', label: 'All' }].concat(PLEDGE_STATUS)
    });
    st.querySelector('select').addEventListener('change', e => { status = e.target.value; render(); });
    filters.appendChild(st);

    render();

    function shown() {
      const needle = q.trim().toLowerCase();
      return rows.filter(p => {
        if (status && (p.status || 'Pledged') !== status) return false;
        if (!needle) return true;
        return [p.ref, p.name, p.email, p.designation].join(' ').toLowerCase().indexOf(needle) >= 0;
      });
    }

    function render() {
      const list = shown();
      const total = list.reduce((s, p) => s + Number(p.amount || 0), 0);
      const received = list.filter(p => p.status === 'Received').reduce((s, p) => s + Number(p.amount || 0), 0);

      setHeader('Pledges', list.length + ' pledges, ' + rupees(total) + ' promised and ' + rupees(received) + ' confirmed', [
        { label: 'Export to CSV', onClick: () => exportCsv(list) }
      ]);

      holder.innerHTML = '';
      if (!list.length) {
        holder.appendChild(el('<div class="table-wrap"><div class="empty"><b>No pledges here</b>' +
          '<span>Pledges made on the Donate page appear as soon as they are submitted.</span></div></div>'));
        return;
      }

      const table = el('<div class="table-wrap"><table><thead><tr>' +
        '<th>Reference</th><th>Amount</th><th>Frequency</th><th>Towards</th>' +
        '<th>Donor</th><th>Pledged</th><th>State</th><th>Receipt</th>' +
        '</tr></thead><tbody></tbody></table></div>');
      const tb = table.querySelector('tbody');

      list.forEach(p => {
        const tr = el('<tr>' +
          '<td><span class="ref">' + esc(p.ref) + '</span></td>' +
          '<td class="nowrap"><b>' + esc(rupees(p.amount)) + '</b></td>' +
          '<td>' + esc(p.frequency || 'One-time') + '</td>' +
          '<td><span class="cellclip">' + esc(p.designation || '-') + '</span></td>' +
          '<td>' + esc(p.name || '-') + '<span class="line2">' + esc(p.email || '') + '</span></td>' +
          '<td class="nowrap">' + esc(fmtDate(p.created)) + '</td>' +
          '<td><span class="badge ' + (p.status === 'Received' ? 'green solid' : p.status === 'Cancelled' ? 'standard' : 'ink') + '">' +
          esc(p.status || 'Pledged') + '</span></td>' +
          '<td>' + esc(p.receiptNo || '-') + '</td>' +
          '</tr>');
        if (can('managePledges')) tr.addEventListener('click', () => edit(p));
        else tr.style.cursor = 'default';
        tb.appendChild(tr);
      });
      holder.appendChild(table);
    }

    function edit(p) {
      const form = el('<div class="stack"></div>');
      form.appendChild(el('<div class="banner">' + esc(p.name || 'Anonymous') + ' pledged ' + esc(rupees(p.amount)) +
        ' ' + esc((p.frequency || 'One-time').toLowerCase()) + ' towards ' + esc(p.designation || 'general work') + '.</div>'));
      form.appendChild(field({ label: 'State', name: 'status', type: 'select', options: PLEDGE_STATUS, value: p.status || 'Pledged' }));
      form.appendChild(field({ label: 'Receipt number', name: 'receiptNo', value: p.receiptNo || '', placeholder: 'R/2026/001' }));
      form.appendChild(field({ label: 'Note for finance', name: 'note', type: 'textarea', rows: 3, value: p.note || '' }));

      modal({
        title: p.ref,
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save', kind: '',
          onClick: async () => {
            const v = readForm(form);
            const patch = { status: v.status, receiptNo: v.receiptNo, note: v.note };
            if (v.status === 'Received' && !p.receivedOn) patch.receivedOn = new Date().toISOString();
            await updatePledge(p.id, patch);
            rows = await listPledges();
            render();
            toast('Pledge updated');
          }
        }]
      });
    }

    function exportCsv(list) {
      const cols = [
        { label: 'Reference', get: p => p.ref },
        { label: 'Pledged on', get: p => fmtDate(p.created) },
        { label: 'Amount', get: p => p.amount },
        { label: 'Frequency', get: p => p.frequency },
        { label: 'Towards', get: p => p.designation },
        { label: 'Donor', get: p => p.name },
        { label: 'Email', get: p => p.email },
        { label: 'State', get: p => p.status || 'Pledged' },
        { label: 'Receipt', get: p => p.receiptNo || '' },
        { label: 'Received on', get: p => p.receivedOn ? fmtDate(p.receivedOn) : '' }
      ];
      download('ichar-pledges-' + new Date().toISOString().slice(0, 10) + '.csv', toCSV(list, cols), 'text/csv');
      toast(list.length + ' rows exported');
    }

    return {};
  }
};
