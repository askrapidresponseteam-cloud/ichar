/* One case file. The reported record on the left, the controls on the right,
   and a single chronological record of everything anyone did. */

import {
  getCase, updateCase, listTimeline, addEntry, listStaff,
  listFiles, uploadFile, removeFile, deleteCase, session, mode
} from '../store.js';
import {
  el, esc, fmtDate, fmtDateTime, ago, slaState, dueAt, stageName, bytes, fmtDay, download
} from '../util.js';
import { priorityBadge, stageBadge, modal, field, readForm, toast, confirmAction } from '../ui.js';
import { setHeader, go, refreshCounts } from '../app.js';
import {
  DIVISIONS, OFFICES, PRIORITIES, STAGES, STAGE_PUBLIC_NOTE, CELLS,
  FILING_TYPES, OUTCOMES, AUTHORITIES, CAN
} from '../config.js';

const can = what => (CAN[what] || []).indexOf(session.staff.role) >= 0;

export default {
  async mount(root, id) {
    let c = await getCase(id);
    if (!c) {
      root.innerHTML = '<div class="empty"><b>That file is not here</b>' +
        '<span>The reference may have been closed and removed, or the link is wrong.</span></div>';
      return {};
    }
    let staff = await listStaff();
    let timeline = await listTimeline(id);
    let files = await listFiles(id);
    let tab = 'all';

    render();

    async function refresh() {
      c = await getCase(id);
      timeline = await listTimeline(id);
      files = await listFiles(id);
      render();
      refreshCounts();
    }

    async function patch(fields, entry) {
      await updateCase(id, fields, entry);
      await refresh();
    }

    function render() {
      const sla = slaState(c);
      setHeader(c.ref, (c.division || 'Unrouted') + ' at ' + (c.office || 'no office yet'), [
        { label: 'Back to cases', onClick: () => go('#/cases') },
        { label: 'Print the file', onClick: () => window.print() },
        { label: 'Download the file', onClick: () => exportFile() }
      ]);

      root.innerHTML = '';
      const grid = el('<div class="case-grid"></div>');
      const main = el('<div class="case-main"></div>');
      const side = el('<div class="case-side"></div>');

      /* ---- headline ---- */
      const head = el('<section class="panel"><div class="panel-body" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center">' +
        '<span class="mono" style="font-size:17px">' + esc(c.ref) + '</span>' +
        priorityBadge(c.priority, true) + stageBadge(c.stage, c.status) +
        (c.ongoing && c.status === 'open' ? '<span class="badge emergency"><span class="dot"></span>Still happening</span>' : '') +
        (c.anonymous ? '<span class="badge standard">Anonymous</span>' : '') +
        (c.share ? '<span class="badge plum">Sharing allowed</span>' : '<span class="badge standard">Keep within ICHAR</span>') +
        '<span style="flex:1 1 auto"></span>' +
        '<span class="small ' + (sla.key === 'over' ? 'overdue' : 'muted') + '">' + esc(sla.label) + '</span>' +
        '</div></section>');
      main.appendChild(head);

      /* ---- stage workflow ---- */
      const stages = el('<section class="panel"><div class="panel-head"><h2>Where the case has reached</h2>' +
        '<span class="small muted">The reporter sees this on the tracking page</span></div>' +
        '<div class="stages"></div><div class="panel-body" data-publicnote></div></section>');
      const strip = stages.querySelector('.stages');
      STAGES.forEach(s => {
        const cls = c.stage > s.n ? 'done' : (c.stage === s.n ? 'now' : '');
        const b = el('<button class="stage-step ' + cls + '" type="button">' +
          '<b>' + s.n + '. ' + esc(s.name) + '</b><span>' + esc(s.note) + '</span></button>');
        if (can('changeStage') && c.status === 'open') {
          b.addEventListener('click', () => moveStage(s.n));
        } else {
          b.style.cursor = 'default';
        }
        strip.appendChild(b);
      });
      const noteBox = stages.querySelector('[data-publicnote]');
      noteBox.innerHTML = '<span class="label">What the reporter is told right now</span>' +
        '<p style="margin:8px 0 0;line-height:1.6">' + esc(c.publicNote || STAGE_PUBLIC_NOTE[c.stage - 1]) + '</p>';
      if (can('editCase')) {
        const b = el('<button class="btn ghost sm" style="margin-top:12px">Change this line</button>');
        b.addEventListener('click', () => editPublicNote());
        noteBox.appendChild(b);
      }
      main.appendChild(stages);

      /* ---- the report as it arrived ---- */
      const evidence = (c.evidence || []).length ? c.evidence.join(', ') : 'None indicated';
      const record = el('<section class="panel"><div class="panel-head"><h2>The report as it was made</h2>' +
        '<span class="small muted">' + (c.source === 'website' ? 'Submitted from the website' : 'Logged at the desk') +
        ' ' + esc(ago(c.created)) + '</span></div>' +
        '<dl class="deflist">' +
        row('Incident', c.summary) +
        row('Where', c.where) +
        row('When', c.when ? fmtDate(c.when) : 'Not given') +
        row('Affected', c.affected || 'Not given') +
        row('Still happening', c.ongoing ? 'Yes, the reporter says it is continuing' : 'No') +
        row('Evidence offered', evidence) +
        row('Authority approached', c.authority || 'Not given') +
        row('Relation to the matter', c.relation || 'Not given') +
        row('Logged', fmtDateTime(c.created)) +
        '</dl></section>');
      main.appendChild(record);

      /* ---- reporter ---- */
      const contact = c.anonymous
        ? '<dl class="deflist">' + row('Reporter', 'Reported anonymously. No contact details were given, so nothing can be sent back to them.') + '</dl>'
        : '<dl class="deflist">' +
        row('Name', c.name || 'Not given') +
        row('Email', c.email ? '<a href="mailto:' + esc(c.email) + '?subject=' + encodeURIComponent('ICHAR ' + c.ref) + '">' + esc(c.email) + '</a>' : 'Not given', true) +
        row('Phone', c.phone ? '<a href="tel:' + esc(c.phone.replace(/\s/g, '')) + '">' + esc(c.phone) + '</a>' : 'Not given', true) +
        row('Consent to share', c.share ? 'May be shared with an authority or partner' : 'Kept within ICHAR') +
        '</dl>';
      const who = el('<section class="panel"><div class="panel-head"><h2>Reporter</h2>' +
        (c.anonymous ? '' : '<button class="btn ghost sm" data-contactlog>Log a call or letter</button>') +
        '</div>' + contact + '</section>');
      const clog = who.querySelector('[data-contactlog]');
      if (clog) clog.addEventListener('click', () => logContact());
      main.appendChild(who);

      /* ---- papers ---- */
      const papers = el('<section class="panel"><div class="panel-head"><h2>Papers on the file</h2>' +
        (can('upload') ? '<button class="btn ghost sm" data-add>Attach a paper</button>' : '') +
        '</div><div class="panel-body tight"></div></section>');
      const pBody = papers.querySelector('.panel-body');
      if (!files.length) {
        pBody.appendChild(el('<div class="empty"><b>Nothing attached yet</b>' +
          '<span>Photographs, the FIR copy, medical papers and correspondence belong here.</span></div>'));
      } else {
        const list = el('<div class="filelist"></div>');
        files.forEach(f => {
          const r = el('<div class="filerow">' +
            '<span class="grow"><b>' + esc(f.name) + '</b>' +
            '<span class="line2 small muted">' + esc(bytes(f.size)) + ', added by ' + esc(f.byName || 'staff') + ' ' + esc(ago(f.at)) + '</span></span>' +
            (f.url ? '<a class="btn ghost sm" href="' + esc(f.url) + '" target="_blank" rel="noopener">Open</a>' : '<span class="small muted">Demo only</span>') +
            (can('upload') ? '<button class="btn ghost sm" data-del>Remove</button>' : '') +
            '</div>');
          const d = r.querySelector('[data-del]');
          if (d) d.addEventListener('click', async () => {
            const ok = await confirmAction({
              title: 'Remove this paper', danger: true, confirmLabel: 'Remove',
              message: 'Remove ' + f.name + ' from the file. The removal is recorded in the activity log.'
            });
            if (!ok) return;
            await removeFile(id, f);
            toast('Paper removed');
            await refresh();
          });
          list.appendChild(r);
        });
        pBody.appendChild(list);
      }
      const addBtn = papers.querySelector('[data-add]');
      if (addBtn) addBtn.addEventListener('click', () => pickFile());
      main.appendChild(papers);

      /* ---- record of everything done ---- */
      const filtered = timeline.filter(t => {
        if (tab === 'all') return true;
        if (tab === 'notes') return t.type === 'note';
        if (tab === 'legal') return t.type === 'legal';
        if (tab === 'contact') return t.type === 'contact';
        return t.type === 'stage' || t.type === 'assign' || t.type === 'route' || t.type === 'close' || t.type === 'created';
      });

      const log = el('<section class="panel"><div class="panel-head"><h2>Record of the file</h2>' +
        '<span style="flex:1 1 auto"></span>' +
        (can('addNote') ? '<button class="btn sm" data-note>Add a note</button>' : '') +
        (can('editCase') ? '<button class="btn ghost sm" data-filing>Log a filing</button>' : '') +
        '</div><div class="tabs"></div><div class="timeline"></div></section>');

      const tabs = log.querySelector('.tabs');
      [['all', 'Everything'], ['notes', 'Notes'], ['legal', 'Filings'], ['contact', 'Contact'], ['moves', 'Routing and stages']]
        .forEach(([key, label]) => {
          const t = el('<button class="tab" role="tab" aria-selected="' + (tab === key) + '">' + label + '</button>');
          t.addEventListener('click', () => { tab = key; render(); });
          tabs.appendChild(t);
        });

      const tl = log.querySelector('.timeline');
      if (!filtered.length) {
        tl.appendChild(el('<div class="empty"><b>Nothing recorded here yet</b>' +
          '<span>Notes, filings and calls appear in order, newest first.</span></div>'));
      } else {
        filtered.forEach(t => {
          const meta = t.meta || {};
          const bits = [];
          if (meta.filingType) bits.push(esc(meta.filingType));
          if (meta.authority) bits.push('to ' + esc(meta.authority));
          if (meta.filedOn) bits.push('filed ' + esc(fmtDate(meta.filedOn)));
          if (meta.reference) bits.push('their reference ' + esc(meta.reference));
          if (meta.outcome) bits.push('outcome: ' + esc(meta.outcome));
          if (meta.channel) bits.push(esc(meta.channel));
          tl.appendChild(el('<div class="tl-item">' +
            '<span class="tl-mark ' + esc(t.type) + '"></span>' +
            '<span class="tl-body">' +
            '<span class="who">' + esc(t.byName || 'Staff') + ', ' + esc(fmtDateTime(t.at)) + '</span>' +
            '<span class="txt">' + esc(t.body) + '</span>' +
            (bits.length ? '<span class="tl-meta">' + bits.map(b => '<span>' + b + '</span>').join('') + '</span>' : '') +
            '</span></div>'));
        });
      }
      const nb = log.querySelector('[data-note]');
      if (nb) nb.addEventListener('click', () => addNote());
      const fb = log.querySelector('[data-filing]');
      if (fb) fb.addEventListener('click', () => logFiling());
      main.appendChild(log);

      /* ================= right column ================= */

      /* ---- routing ---- */
      const routing = el('<section class="panel"><div class="panel-head"><h2>Routing</h2></div>' +
        '<div class="panel-body stack"></div></section>');
      const rBody = routing.querySelector('.panel-body');
      const editable = can('editCase') && c.status === 'open';

      const sel = (label, name, options, value, onChange) => {
        const f = field({ label: label, name: name, type: 'select', value: value || '', options: options });
        const node = f.querySelector('select');
        node.disabled = !editable;
        node.addEventListener('change', e => onChange(e.target.value));
        rBody.appendChild(f);
      };

      sel('Division', 'division', [{ value: '', label: 'Not routed yet' }].concat(DIVISIONS), c.division,
        v => patch({ division: v, cell: null }, { type: 'route', body: 'Division set to ' + v + '.' }));

      sel('Cell', 'cell', [{ value: '', label: 'None' }].concat(CELLS[c.division] || []), c.cell,
        v => patch({ cell: v || null }, { type: 'route', body: v ? 'Handed to the ' + v + '.' : 'Cell cleared.' }));

      sel('Office', 'office', [{ value: '', label: 'No office yet' }].concat(OFFICES), c.office,
        v => patch({ office: v }, { type: 'route', body: 'Routed to ' + v + '.' }));

      sel('Priority', 'priority', PRIORITIES, c.priority,
        v => patch({ priority: v }, { type: 'route', body: 'Priority changed to ' + v + '. Reported as ' + (c.urgency || 'Standard') + '.' }));

      sel('With', 'assignedTo',
        [{ value: '', label: 'Unassigned' }].concat(staff.filter(s => s.active !== false).map(s => ({ value: s.id, label: s.name }))),
        c.assignedTo,
        v => {
          const p = staff.find(s => s.id === v);
          patch({ assignedTo: v || null, assignedName: p ? p.name : '' },
            { type: 'assign', body: p ? 'Assigned to ' + p.name + '.' : 'Returned to the queue.' });
        });

      if (editable && !c.assignedTo) {
        const take = el('<button class="btn block">Take this case</button>');
        take.addEventListener('click', () => patch(
          { assignedTo: session.staff.id, assignedName: session.staff.name },
          { type: 'assign', body: session.staff.name + ' took the case.' }
        ));
        rBody.appendChild(take);
      }
      side.appendChild(routing);

      /* ---- next action ---- */
      const next = el('<section class="panel"><div class="panel-head"><h2>Next action</h2></div>' +
        '<div class="panel-body stack"></div></section>');
      const nBody = next.querySelector('.panel-body');
      if (c.nextAction || c.nextActionDate) {
        const late = c.nextActionDate && new Date(c.nextActionDate + 'T23:59:59') < new Date();
        nBody.appendChild(el('<div>' +
          '<p style="margin:0 0 6px;line-height:1.55">' + esc(c.nextAction || 'No action written down') + '</p>' +
          '<span class="small ' + (late ? 'overdue' : 'muted') + '">' +
          (c.nextActionDate ? (late ? 'Was due ' : 'Due ') + esc(fmtDate(c.nextActionDate)) : 'No date set') + '</span></div>'));
      } else {
        nBody.appendChild(el('<p class="small muted" style="margin:0">Nothing planned. Write down what has to happen next so the file does not drift.</p>'));
      }
      if (editable) {
        const b = el('<button class="btn ghost block">' + (c.nextAction ? 'Change the next action' : 'Set the next action') + '</button>');
        b.addEventListener('click', () => setNextAction());
        nBody.appendChild(b);
      }
      side.appendChild(next);

      /* ---- response clock ---- */
      const due = dueAt(c);
      const clock = el('<section class="panel"><div class="panel-head"><h2>Response clock</h2></div>' +
        '<dl class="deflist">' +
        row('Reported as', c.urgency || 'Standard') +
        row('First reply due', due ? fmtDateTime(due) : '-') +
        row('First reply made', c.firstActionedAt ? fmtDateTime(c.firstActionedAt) : 'Not yet') +
        row('Standing', sla.label) +
        '</dl></section>');
      side.appendChild(clock);

      /* ---- closing ---- */
      const closing = el('<section class="panel"><div class="panel-head"><h2>Closing</h2></div>' +
        '<div class="panel-body stack"></div></section>');
      const cBody = closing.querySelector('.panel-body');
      if (c.status === 'open') {
        cBody.appendChild(el('<p class="small muted" style="margin:0">A file stays open until compliance is confirmed or the matter is formally ended.</p>'));
        if (can('closeCase')) {
          const b = el('<button class="btn block">Close this file</button>');
          b.addEventListener('click', () => closeCase());
          cBody.appendChild(b);
          const nb2 = el('<button class="btn ghost block">Record that we cannot take it up</button>');
          nb2.addEventListener('click', () => closeCase(true));
          cBody.appendChild(nb2);
        } else {
          cBody.appendChild(el('<p class="small muted" style="margin:0">Only a director or an administrator can close a file.</p>'));
        }
      } else {
        cBody.appendChild(el('<div>' +
          '<span class="label">' + (c.status === 'closed' ? 'Closed' : 'Not taken up') + '</span>' +
          '<p style="margin:6px 0 0;line-height:1.55"><b>' + esc(c.closureOutcome || '-') + '</b></p>' +
          (c.closureNote ? '<p style="margin:6px 0 0;line-height:1.55">' + esc(c.closureNote) + '</p>' : '') +
          '<span class="small muted">' + esc(fmtDateTime(c.closedAt)) + '</span></div>'));
        if (can('closeCase')) {
          const b = el('<button class="btn ghost block">Reopen the file</button>');
          b.addEventListener('click', async () => {
            const ok = await confirmAction({
              title: 'Reopen this file',
              message: 'The reporter will see the case as live again on the tracking page.',
              confirmLabel: 'Reopen'
            });
            if (!ok) return;
            await patch({ status: 'open', closedAt: null, publicNote: STAGE_PUBLIC_NOTE[c.stage - 1] },
              { type: 'stage', body: 'File reopened.' });
            toast('File reopened');
          });
          cBody.appendChild(b);
        }
      }
      if (can('deleteCase')) {
        const d = el('<button class="btn ghost block" style="color:var(--signal);border-color:var(--signal)">Delete permanently</button>');
        d.addEventListener('click', async () => {
          const ok = await confirmAction({
            title: 'Delete this file', danger: true, confirmLabel: 'Delete it',
            message: 'This removes the record and the public tracking entry for ' + c.ref + '. It cannot be undone. Close the file instead if you only want it out of the queue.'
          });
          if (!ok) return;
          await deleteCase(id);
          toast('File deleted');
          go('#/cases');
        });
        cBody.appendChild(d);
      }
      side.appendChild(closing);

      grid.appendChild(main);
      grid.appendChild(side);
      root.appendChild(grid);
    }

    /* ---------- actions ---------- */

    function moveStage(n) {
      if (n === c.stage) return;
      const form = el('<div class="stack"></div>');
      form.appendChild(el('<p class="small muted" style="margin:0">Moving from ' + esc(stageName(c.stage)) +
        ' to ' + esc(stageName(n)) + '. The reporter sees the new stage and the line below.</p>'));
      form.appendChild(field({
        label: 'What the reporter is told', name: 'publicNote', type: 'textarea', rows: 3,
        value: STAGE_PUBLIC_NOTE[n - 1]
      }));
      form.appendChild(field({
        label: 'Internal note, not shown to the reporter', name: 'note', type: 'textarea', rows: 3,
        placeholder: 'Why the file has moved.'
      }));
      modal({
        title: 'Move to ' + stageName(n),
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Move the file', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await patch({
              stage: n,
              publicNote: v.publicNote,
              firstActionedAt: c.firstActionedAt || new Date().toISOString()
            }, { type: 'stage', body: 'Moved to ' + stageName(n) + '.' + (v.note ? '\n' + v.note : ''), meta: { from: c.stage, to: n } });
            toast('Moved to ' + stageName(n));
          }
        }]
      });
    }

    function editPublicNote() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({
        label: 'What the reporter reads on the tracking page', name: 'publicNote',
        type: 'textarea', rows: 4, value: c.publicNote || STAGE_PUBLIC_NOTE[c.stage - 1],
        hint: 'Keep it plain and true. Never put names of officials or case strategy here.'
      }));
      modal({
        title: 'Change what the reporter is told',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save the line', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await patch({ publicNote: v.publicNote }, { type: 'status', body: 'Public line updated.' });
            toast('The tracking page now shows the new line');
          }
        }]
      });
    }

    function addNote() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({ label: 'Note', name: 'body', type: 'textarea', rows: 5, placeholder: 'What you found, what was said, what it means for the file.' }));
      modal({
        title: 'Add a note',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save the note', kind: '',
          onClick: async () => {
            const v = readForm(form);
            if (!v.body.trim()) { toast('Write something first', true); return 'keep'; }
            await addEntry(id, { type: 'note', body: v.body.trim() });
            if (!c.firstActionedAt) await updateCase(id, { firstActionedAt: new Date().toISOString() });
            toast('Note saved');
            await refresh();
          }
        }]
      });
    }

    function logFiling() {
      const form = el('<div class="stack"></div>');
      const r = el('<div class="row"></div>');
      r.appendChild(field({ label: 'What was filed', name: 'filingType', type: 'select', options: FILING_TYPES }));
      r.appendChild(field({ label: 'Filed on', name: 'filedOn', type: 'date', value: fmtDay(new Date()) }));
      form.appendChild(r);
      form.appendChild(field({ label: 'Before which authority', name: 'authority', type: 'select', options: AUTHORITIES.filter(a => a !== 'No one yet').concat(['Other']) }));
      form.appendChild(field({ label: 'Their reference number', name: 'reference', placeholder: 'Diary number, FIR number, receipt number' }));
      form.appendChild(field({ label: 'What it says', name: 'body', type: 'textarea', rows: 4, placeholder: 'The relief asked for, and on what provision.' }));
      modal({
        title: 'Log a filing',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save the filing', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await addEntry(id, {
              type: 'legal',
              body: v.body || (v.filingType + ' filed.'),
              meta: { filingType: v.filingType, authority: v.authority, filedOn: v.filedOn, reference: v.reference }
            });
            if (c.stage < 3) {
              await updateCase(id, { stage: 3, publicNote: STAGE_PUBLIC_NOTE[2] },
                { type: 'stage', body: 'Moved to Legal action because a filing was made.', meta: { from: c.stage, to: 3 } });
            }
            toast('Filing recorded');
            await refresh();
          }
        }]
      });
    }

    function logContact() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({ label: 'How', name: 'channel', type: 'select', options: ['Telephone call', 'Email', 'Message', 'In person', 'Letter'] }));
      form.appendChild(field({ label: 'What was said', name: 'body', type: 'textarea', rows: 4, placeholder: 'What the reporter told you, and what you told them.' }));
      modal({
        title: 'Log contact with the reporter',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save', kind: '',
          onClick: async () => {
            const v = readForm(form);
            if (!v.body.trim()) { toast('Write what was said', true); return 'keep'; }
            await addEntry(id, { type: 'contact', body: v.body.trim(), meta: { channel: v.channel } });
            if (!c.firstActionedAt) await updateCase(id, { firstActionedAt: new Date().toISOString() });
            toast('Contact logged');
            await refresh();
          }
        }]
      });
    }

    function setNextAction() {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({ label: 'What happens next', name: 'nextAction', value: c.nextAction || '', placeholder: 'Collect the medical papers and write to the station' }));
      form.appendChild(field({ label: 'By when', name: 'nextActionDate', type: 'date', value: c.nextActionDate || '' }));
      modal({
        title: 'Next action',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: 'Save', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await patch({ nextAction: v.nextAction, nextActionDate: v.nextActionDate },
              { type: 'note', body: 'Next action: ' + v.nextAction + (v.nextActionDate ? ' by ' + fmtDate(v.nextActionDate) : '') });
            toast('Next action saved');
          }
        }]
      });
    }

    function closeCase(rejected) {
      const form = el('<div class="stack"></div>');
      form.appendChild(field({
        label: 'Outcome', name: 'closureOutcome', type: 'select',
        options: rejected ? OUTCOMES.slice(4) : OUTCOMES
      }));
      form.appendChild(field({
        label: 'What happened, for the record', name: 'closureNote', type: 'textarea', rows: 4,
        placeholder: 'What was obtained, or why the file ends here.'
      }));
      form.appendChild(field({
        label: 'What the reporter is told', name: 'publicNote', type: 'textarea', rows: 3,
        value: rejected
          ? 'This matter falls outside what the council can take up. The file has been closed and no further action will be taken in your name.'
          : 'The matter has been concluded and the file is closed. Write to intake if anything changes.'
      }));
      modal({
        title: rejected ? 'Record that we cannot take it up' : 'Close this file',
        body: form,
        actions: [{ label: 'Cancel' }, {
          label: rejected ? 'Record it' : 'Close the file', kind: '',
          onClick: async () => {
            const v = readForm(form);
            await patch({
              status: rejected ? 'rejected' : 'closed',
              closureOutcome: v.closureOutcome,
              closureNote: v.closureNote,
              publicNote: v.publicNote,
              closedAt: new Date().toISOString(),
              stage: rejected ? c.stage : 4
            }, { type: 'close', body: (rejected ? 'Not taken up. ' : 'File closed. ') + v.closureOutcome + (v.closureNote ? '\n' + v.closureNote : ''), meta: { outcome: v.closureOutcome } });
            toast(rejected ? 'Recorded' : 'File closed');
          }
        }]
      });
    }

    function pickFile() {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.addEventListener('change', async () => {
        const list = Array.from(input.files || []);
        if (!list.length) return;
        for (const f of list) {
          if (f.size > 25 * 1024 * 1024) { toast(f.name + ' is over 25 MB and was skipped', true); continue; }
          toast('Uploading ' + f.name);
          try { await uploadFile(id, f); } catch (e) { toast('Could not upload ' + f.name, true); }
        }
        if (mode === 'demo') toast('Demo mode records the file name only, nothing is stored');
        await refresh();
      });
      input.click();
    }

    /* Plain-text copy of the whole file, for an offline bundle or a court brief. */
    function exportFile() {
      const lines = [];
      const push = (k, v) => lines.push(k.padEnd(22) + (v == null ? '' : String(v)));
      lines.push('ICHAR CASE FILE');
      lines.push('='.repeat(64));
      push('Reference', c.ref);
      push('Division', c.division);
      push('Cell', c.cell || '-');
      push('Office', c.office);
      push('Priority', c.priority + ' (reported as ' + (c.urgency || 'Standard') + ')');
      push('Stage', c.stage + '. ' + stageName(c.stage));
      push('State', c.status);
      push('With', c.assignedName || 'Unassigned');
      push('Logged', fmtDateTime(c.created));
      lines.push('');
      lines.push('THE REPORT');
      lines.push('-'.repeat(64));
      push('Where', c.where);
      push('When', c.when || 'Not given');
      push('Affected', c.affected || 'Not given');
      push('Still happening', c.ongoing ? 'Yes' : 'No');
      push('Evidence offered', (c.evidence || []).join(', ') || 'None indicated');
      push('Authority approached', c.authority || '-');
      lines.push('');
      lines.push(c.summary || '');
      lines.push('');
      lines.push('REPORTER');
      lines.push('-'.repeat(64));
      if (c.anonymous) {
        lines.push('Reported anonymously.');
      } else {
        push('Name', c.name || 'Not given');
        push('Email', c.email || 'Not given');
        push('Phone', c.phone || 'Not given');
        push('Relation', c.relation || '-');
        push('Consent to share', c.share ? 'Yes' : 'No');
      }
      lines.push('');
      lines.push('RECORD OF THE FILE');
      lines.push('-'.repeat(64));
      timeline.slice().reverse().forEach(t => {
        lines.push('[' + fmtDateTime(t.at) + '] ' + (t.byName || 'Staff') + ' - ' + t.type);
        lines.push('  ' + String(t.body || '').replace(/\n/g, '\n  '));
        const m = t.meta || {};
        Object.keys(m).forEach(k => { if (m[k]) lines.push('  ' + k + ': ' + m[k]); });
        lines.push('');
      });
      if (files.length) {
        lines.push('PAPERS ON THE FILE');
        lines.push('-'.repeat(64));
        files.forEach(f => lines.push('- ' + f.name + ' (' + bytes(f.size) + ', ' + fmtDate(f.at) + ')'));
        lines.push('');
      }
      if (c.status !== 'open') {
        lines.push('CLOSURE');
        lines.push('-'.repeat(64));
        push('Outcome', c.closureOutcome);
        push('Closed', fmtDateTime(c.closedAt));
        lines.push(c.closureNote || '');
      }
      lines.push('');
      lines.push('Printed ' + fmtDateTime(new Date()) + ' by ' + session.staff.name + '.');
      lines.push('Confidential. Contains personal information held by ICHAR.');
      download(c.ref + '.txt', lines.join('\n'), 'text/plain');
    }

    return {};
  }
};

function row(label, value, raw) {
  return '<dt>' + esc(label) + '</dt><dd>' + (raw ? value : esc(value == null || value === '' ? '-' : value)) + '</dd>';
}
