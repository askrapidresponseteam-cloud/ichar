# ICHAR Casework

A case management portal for the reports that arrive from the ICHAR website.
It is a static site plus Firebase. There is no build step and no framework, so
what you deploy is what is in the folder.

## The one command

With the Firebase CLI installed and your project ID in `.firebaserc`:

```
firebase deploy
```

That publishes the portal, the Firestore rules, the indexes and the storage
rules together. Full first-time setup is in `DEPLOY.md`.

## Try it before connecting anything

Open `public/index.html` through any local server and sign in with
`chair@ichar.org` and any password. While `public/js/config.js` still holds the
`PASTE_...` placeholders the portal runs on 34 sample cases held in your
browser, so you can click through every screen before touching Firebase.

```
cd public && python3 -m http.server 8080
```

Then go to `http://localhost:8080`.

## What is in it

**Overview.** Open files, what is assigned to you, what has not been routed,
what has passed its response clock, what is marked emergency, and what closed
this month. Every number is a link into a filtered case list. Below that,
breakdowns by division, stage, office and age, so nothing sits quietly for
three months.

**Cases.** One table with ten filters, sortable columns, and bulk assign, route
and stage changes. Free text search covers the reference, the place, the
narrative, the reporter and the officer. Export gives you exactly the rows you
are looking at. Reports that arrive by telephone or at the desk can be logged
here by hand, and they join the same queue.

**The case file.** The report as it was submitted, never overwritten. Then the
stage workflow, routing, the reporter's details, papers attached to the file,
and one chronological record of every note, filing, call and stage change with
a name and a time against each. Closing asks for an outcome and for the line
the reporter will read. The whole file prints, or downloads as plain text for a
brief.

**Pledges.** What came in from the Donate page, with a state and a receipt
number for finance to reconcile.

**Staff.** Five roles, described below. **Activity log.** Every change, in
order, which cannot be edited or deleted by anyone.

## How a report becomes a case

```
  Website form
      |
      v
  cases/{id}          the report exactly as submitted, plus staff fields
      |
      +--> caseStatus/{ref}    public mirror, no personal data
      |
      +--> cases/{id}/timeline    every action, append only
      |
      +--> cases/{id}/files       papers, held in Storage
```

The reporter sees only the mirror. It carries the division, the office, the
place, the dates, the stage and the line an officer wrote. It does not carry
the narrative, the name, the email or the phone number, so a reference in the
wrong hands gives nothing away.

## The four stages

They are the same four the public tracker shows, so the portal and the site can
never disagree:

1. **Received.** Logged and routed to a division and office.
2. **Documentation.** Facts verified, provisions identified, missing material
   requested.
3. **Legal action.** Complaint, FIR support, petition or representation filed.
4. **Follow-through.** Compliance monitored, compensation tracked, outcome
   recorded.

Recording a filing moves a file to stage 3 on its own, because a filing is what
that stage means.

## The response clock

Counted from the moment the report lands, not from when someone opens it:

| Reported as | First reply due within |
| ----------- | ---------------------- |
| Emergency   | 24 hours               |
| Urgent      | 72 hours               |
| Standard    | 7 days                 |

The clock stops at the first note, call or stage change. Overdue files are red
on the overview and can be filtered in the case list. Change the hours in
`public/js/config.js` under `SLA_HOURS`.

## Roles

| Role | What it opens |
| ---- | ------------- |
| Administrator | Everything, including staff, deletion and the activity log |
| Director | Reads every office, assigns, closes files, reconciles pledges |
| Legal officer | Works the files, moves stages, records filings and notes. Cannot close |
| Intake | Logs, triages and routes. Cannot move past Documentation or close |
| Read only | Reads and exports, changes nothing |

Roles are enforced twice: the interface hides what a role cannot do, and the
Firestore rules refuse it even if someone calls the database directly.

## Files

```
firebase.json            hosting, rules and index wiring
firestore.rules          who may read and write what
firestore.indexes.json   composite indexes
storage.rules            papers on a case, staff only

public/                  the portal itself, deployed as is
  index.html             shell and sign in
  css/app.css            the whole visual system
  js/config.js           >>> your Firebase config and the domain model <<<
  js/store.js            data layer, Firestore with a demo fallback
  js/app.js              sign in, navigation, routing
  js/util.js             dates, references, response clock, CSV
  js/ui.js               modals, toasts, badges, form fields
  js/views/              overview, cases, case file, pledges, staff, log

website/                 what changes on the public site
  ichar-firebase.js      drop into assets/, connects the forms
  INTEGRATION.md         exact before and after for the three forms

tools/
  bootstrap.mjs          creates the first administrator

functions/               optional, needs the Blaze plan
  index.js               rebuilds the public mirror, alerts on emergencies
```

## Changing the domain

Everything the council might reorganise lives in `public/js/config.js`:
divisions, cells, offices, priorities, the response clock, stage names and the
default line the reporter reads at each stage, filing types, closure outcomes
and role permissions. Change it there and both the portal and the exports
follow. If you change divisions or priorities, change the matching list in
`firestore.rules` too, or the new values will be refused at the database.

## Notes on the design

**The submission is never edited.** Staff fields sit alongside the report, so
the file always shows what was actually said at intake. If an officer corrects
something, it goes in the record as a note, dated and attributed.

**References changed shape.** The site generated four digits after the division
code, which is 9,000 possibilities per division per year. Those collide, and
they can be guessed. The portal and the patched form use six characters from a
32 character alphabet instead, so `ICH-2026-HR7K3M9P`. The visible format is
otherwise unchanged.

**The case list loads up to 800 recent files and filters in the browser.** At
the council's scale this is faster than a round trip per filter change, and it
avoids a composite index for every combination. If the archive passes a few
thousand open files, move the filters into Firestore queries using the indexes
already declared.

**The activity log is append only, enforced in the rules.** Nobody, including
an administrator, can edit or delete an entry through the portal.
