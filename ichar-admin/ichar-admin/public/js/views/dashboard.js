/* Overview. Answers one question on opening: what needs me today. */

import { listCases, listPledges, mode, session } from '../store.js';
import { el, esc, fmtDate, ago, slaState, daysOld, rupees, toDate } from '../util.js';
import { bars, priorityBadge, stageBadge } from '../ui.js';
import { setHeader, go } from '../app.js';
import { DIVISIONS, OFFICES, STAGES } from '../config.js';

export default {
  async mount(root) {
    const [all, pledges] = await Promise.all([listCases(), listPledges()]);
    const open = all.filter(c => c.status === 'open');
    const mine = open.filter(c => c.assignedTo === session.staff.id);
    const unassigned = open.filter(c => !c.assignedTo);
    const overdue = open.filter(c => slaState(c).key === 'over');
    const emergency = open.filter(c => c.priority === 'Emergency');
    const closedThisMonth = all.filter(c => {
      const d = toDate(c.closedAt);
      return d && d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
    });

    setHeader('Overview', 'Casework at a glance, ' + fmtDate(new Date()));

    root.innerHTML = '';
    const stack = el('<div class="stack"></div>');

    if (mode === 'demo') {
      stack.appendChild(el('<div class="banner demo">Demo mode. These are sample cases stored in this browser, not live data. ' +
        'Paste your Firebase config into <b>public/js/config.js</b> to connect the real database.</div>'));
    }

    /* Headline numbers. Each one is a filtered view of the case list. */
    const metrics = el('<div class="metrics"></div>');
    [
      { n: open.length, label: 'Open files', to: '#/cases?status=open' },
      { n: mine.length, label: 'Assigned to you', to: '#/cases?mine=1' },
      { n: unassigned.length, label: 'Waiting to be routed', to: '#/cases?unassigned=1', alarm: unassigned.length > 0 },
      { n: overdue.length, label: 'Past the response clock', to: '#/cases?sla=over', alarm: overdue.length > 0 },
      { n: emergency.length, label: 'Marked emergency', to: '#/cases?priority=Emergency', alarm: emergency.length > 0 },
      { n: closedThisMonth.length, label: 'Closed this month', to: '#/cases?status=closed' }
    ].forEach(m => {
      const card = el('<button class="metric' + (m.alarm && m.n ? ' alarm' : '') + '" type="button">' +
        '<b>' + m.n + '</b><span class="label">' + esc(m.label) + '</span></button>');
      card.addEventListener('click', () => go(m.to));
      metrics.appendChild(card);
    });
    stack.appendChild(metrics);

    /* The queue that actually needs a person. */
    const attention = open
      .filter(c => !c.assignedTo || slaState(c).key === 'over' || c.priority === 'Emergency')
      .sort((a, b) => {
        const rank = x => (x.priority === 'Emergency' ? 0 : x.priority === 'Urgent' ? 1 : 2);
        return rank(a) - rank(b) || (toDate(a.created) || 0) - (toDate(b.created) || 0);
      })
      .slice(0, 12);

    const queue = el(
      '<section class="panel">' +
      '<div class="panel-head"><h2>Needs attention</h2>' +
      '<span class="small muted">Unrouted, overdue or marked emergency</span></div>' +
      '<div class="panel-body tight"></div></section>'
    );
    const qBody = queue.querySelector('.panel-body');
    if (!attention.length) {
      qBody.appendChild(el('<div class="empty"><b>Nothing is waiting</b>' +
        '<span>Every open file is routed and inside its response clock.</span></div>'));
    } else {
      const table = el('<div class="table-wrap"><table><thead><tr>' +
        '<th>Reference</th><th>Division</th><th>Priority</th><th>Where</th>' +
        '<th>Stage</th><th>Response clock</th><th>With</th>' +
        '</tr></thead><tbody></tbody></table></div>');
      const tb = table.querySelector('tbody');
      attention.forEach(c => {
        const sla = slaState(c);
        const tr = el('<tr>' +
          '<td><span class="ref">' + esc(c.ref) + '</span>' +
          '<span class="line2">' + esc(ago(c.created)) + '</span></td>' +
          '<td>' + esc(c.division || 'Unrouted') + '</td>' +
          '<td>' + priorityBadge(c.priority) + '</td>' +
          '<td><span class="cellclip">' + esc(c.where || '-') + '</span></td>' +
          '<td>' + stageBadge(c.stage, c.status) + '</td>' +
          '<td class="' + (sla.key === 'over' ? 'overdue' : '') + '">' + esc(sla.label) + '</td>' +
          '<td>' + (c.assignedName ? esc(c.assignedName) : '<span class="badge emergency">Unassigned</span>') + '</td>' +
          '</tr>');
        tr.addEventListener('click', () => go('#/case/' + c.id));
        tb.appendChild(tr);
      });
      qBody.appendChild(table);
    }
    stack.appendChild(queue);

    /* Where the work sits. */
    const split = el('<div class="case-grid"></div>');

    const byDivision = el('<section class="panel" style="flex:1 1 320px"><div class="panel-head"><h2>Open files by division</h2></div>' +
      '<div class="panel-body"></div></section>');
    byDivision.querySelector('.panel-body').appendChild(bars(
      DIVISIONS.map(d => ({ label: d, value: open.filter(c => c.division === d).length, key: d })),
      r => go('#/cases?division=' + encodeURIComponent(r.key))
    ));

    const byStage = el('<section class="panel" style="flex:1 1 320px"><div class="panel-head"><h2>Open files by stage</h2></div>' +
      '<div class="panel-body"></div></section>');
    byStage.querySelector('.panel-body').appendChild(bars(
      STAGES.map(s => ({ label: s.n + '. ' + s.name, value: open.filter(c => c.stage === s.n).length, key: s.n })),
      r => go('#/cases?stage=' + r.key)
    ));

    const byOffice = el('<section class="panel" style="flex:1 1 320px"><div class="panel-head"><h2>Open files by office</h2></div>' +
      '<div class="panel-body"></div></section>');
    byOffice.querySelector('.panel-body').appendChild(bars(
      OFFICES.map(o => ({ label: o.replace('Branch Office, ', '').replace('Head Office, ', 'Delhi HQ, '), value: open.filter(c => c.office === o).length, key: o })),
      r => go('#/cases?office=' + encodeURIComponent(r.key))
    ));

    split.appendChild(byDivision);
    split.appendChild(byStage);
    split.appendChild(byOffice);
    stack.appendChild(split);

    /* Age of the open files, so nothing drifts quietly. */
    const buckets = [
      { label: 'Under a week', test: d => d < 7 },
      { label: 'One to four weeks', test: d => d >= 7 && d < 28 },
      { label: 'One to three months', test: d => d >= 28 && d < 90 },
      { label: 'Older than three months', test: d => d >= 90 }
    ].map(b => ({ label: b.label, value: open.filter(c => b.test(daysOld(c.created))).length }));

    const ageing = el('<section class="panel"><div class="panel-head"><h2>How long open files have been open</h2>' +
      '<span class="small muted">Counted from the day the report landed</span></div><div class="panel-body"></div></section>');
    ageing.querySelector('.panel-body').appendChild(bars(buckets));
    stack.appendChild(ageing);

    /* Money, kept light. Finance does the real work in the pledges section. */
    const pledged = pledges.filter(p => p.status !== 'Cancelled');
    const received = pledges.filter(p => p.status === 'Received');
    const money = el('<section class="panel"><div class="panel-head"><h2>Pledges</h2>' +
      '<span class="small muted">From the Donate page</span></div>' +
      '<div class="panel-body"><div class="row">' +
      '<div><span class="label">Pledged</span><div style="font-size:22px;font-weight:700">' + rupees(pledged.reduce((s, p) => s + Number(p.amount || 0), 0)) + '</div><span class="small muted">' + pledged.length + ' pledges</span></div>' +
      '<div><span class="label">Received</span><div style="font-size:22px;font-weight:700">' + rupees(received.reduce((s, p) => s + Number(p.amount || 0), 0)) + '</div><span class="small muted">' + received.length + ' confirmed</span></div>' +
      '<div><span class="label">Awaiting confirmation</span><div style="font-size:22px;font-weight:700">' + (pledged.length - received.length) + '</div><span class="small muted">Finance to reconcile</span></div>' +
      '</div></div></section>');
    stack.appendChild(money);

    root.appendChild(stack);
    return {};
  }
};
