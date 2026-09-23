/* Who may open the portal, and what each of them can do. */

import { listStaff, saveStaff, mode, session } from '../store.js';
import { el, esc, fmtDate } from '../util.js';
import { modal, field, readForm, toast, confirmAction } from '../ui.js';
import { setHeader } from '../app.js';
import { ROLES, ROLE_LABEL, OFFICES } from '../config.js';

export default {
  async mount(root) {
    let rows = await listStaff();

    setHeader('Staff', rows.filter(s => s.active !== false).length + ' people can sign in', [
      { label: 'Add someone', onClick: () => addPerson() }
    ]);

    render();

    function render() {
      root.innerHTML = '';
      const stack = el('<div class="stack"></div>');

      stack.appendChild(el('<div class="banner">Adding someone here gives them a staff record. They also need a ' +
        'Firebase Authentication account with the same user ID before they can sign in. ' +
        'Create the account under Authentication in the Firebase console, then paste its user ID below.</div>'));

      const table = el('<div class="table-wrap"><table><thead><tr>' +
        '<th>Name</th><th>Email</th><th>Role</th><th>Office</th><th>Access</th><th>User ID</th>' +
        '</tr></thead><tbody></tbody></table></div>');
      const tb = table.querySelector('tbody');

      rows.slice().sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(s => {
        const tr = el('<tr>' +
          '<td><b>' + esc(s.name || '-') + '</b></td>' +
          '<td>' + esc(s.email || '-') + '</td>' +
          '<td>' + esc(ROLE_LABEL[s.role] || s.role || '-') + '</td>' +
          '<td>' + esc(s.office || '-') + '</td>' +
          '<td>' + (s.active === false
            ? '<span class="badge standard">Switched off</span>'
            : '<span class="badge green">Can sign in</span>') + '</td>' +
          '<td><span class="mono small">' + esc(s.id) + '</span></td>' +
          '</tr>');
        tr.addEventListener('click', () => editPerson(s));
        tb.appendChild(tr);
      });

      stack.appendChild(table);

      stack.appendChild(el('<section class="panel"><div class="panel-head"><h2>What each role can do</h2></div>' +
        '<dl class="deflist">' +
        '<dt>Administrator</dt><dd>Everything, including staff, deletion and the activity log.</dd>' +
        '<dt>Director</dt><dd>Reads every office, assigns work, closes files, reconciles pledges.</dd>' +
        '<dt>Legal officer</dt><dd>Works the files, moves stages, records filings and notes. Cannot close.</dd>' +
        '<dt>Intake</dt><dd>Logs, triages and routes reports. Cannot move a file past documentation or close it.</dd>' +
        '<dt>Read only</dt><dd>Reads the files and exports. Changes nothing.</dd>' +
        '</dl></section>'));

      root.appendChild(stack);
    }

    function form(s) {
      const box = el('<div class="stack"></div>');
      box.appendChild(field({
        label: 'Firebase user ID', name: 'id', value: s ? s.id : '',
        hint: s ? 'Fixed once created.' : 'Copy it from Authentication in the Firebase console.'
      }));
      if (s) box.querySelector('input[name=id]').disabled = true;
      box.appendChild(field({ label: 'Name', name: 'name', value: s ? s.name : '' }));
      box.appendChild(field({ label: 'Work email', name: 'email', type: 'email', value: s ? s.email : '' }));
      const r = el('<div class="row"></div>');
      r.appendChild(field({
        label: 'Role', name: 'role', type: 'select', value: s ? s.role : 'legal',
        options: ROLES.map(x => ({ value: x, label: ROLE_LABEL[x] }))
      }));
      r.appendChild(field({ label: 'Office', name: 'office', type: 'select', value: s ? s.office : OFFICES[0], options: OFFICES }));
      box.appendChild(r);
      box.appendChild(field({ label: 'Can sign in', name: 'active', type: 'checkbox', value: s ? s.active !== false : true }));
      return box;
    }

    function addPerson() {
      const f = form(null);
      modal({
        title: 'Add someone',
        body: f,
        actions: [{ label: 'Cancel' }, {
          label: 'Add', kind: '',
          onClick: async () => {
            const v = readForm(f);
            if (!v.id || !v.name) { toast('A user ID and a name are needed', true); return 'keep'; }
            await saveStaff(v.id, {
              name: v.name, email: v.email, role: v.role, office: v.office,
              active: v.active, createdAt: new Date().toISOString()
            });
            rows = await listStaff();
            render();
            toast(v.name + ' added');
          }
        }]
      });
    }

    function editPerson(s) {
      const f = form(s);
      modal({
        title: s.name,
        body: f,
        actions: [{ label: 'Cancel' }, {
          label: 'Save', kind: '',
          onClick: async () => {
            const v = readForm(f);
            if (s.id === session.staff.id && v.role !== 'admin') {
              const ok = await confirmAction({
                title: 'Change your own role',
                message: 'You are about to take administrator rights away from yourself. You will lose the staff and activity sections at once.',
                confirmLabel: 'Do it anyway', danger: true
              });
              if (!ok) return 'keep';
            }
            await saveStaff(s.id, { name: v.name, email: v.email, role: v.role, office: v.office, active: v.active });
            rows = await listStaff();
            render();
            toast('Saved');
          }
        }]
      });
    }

    return {};
  }
};
