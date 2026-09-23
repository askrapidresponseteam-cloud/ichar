# Wiring the website to the portal

Right now the site keeps everything in `localStorage`, so a report only exists
in the browser that made it. Three small edits move that into Firestore, where
the portal can see it. The forms themselves do not change: same steps, same
questions, same wording.

## 1. Copy the bridge file

Copy `ichar-firebase.js` into the site at `assets/ichar-firebase.js`, and paste
your Firebase web config into the top of it. It is the same config the portal
uses.

Load it on every page that has a form or the tracker. In `index.html`, just
before the closing `</body>`:

```html
<script type="module" src="assets/ichar-firebase.js"></script>
```

## 2. Report a Violation

File: `ICHAR Report a Violation.dc.html`

**Delete** the two helpers that are no longer used, `makeRef` and `store`.

**Replace** the whole submit handler, from `on(submit, 'click', () => {` down to
its closing `});`, with this:

```js
    on(submit, 'click', async () => {
      const m = validate(4) || validate(2) || validate(1);
      if (m) { setError(m); return; }

      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = 'Sending';

      const out = await window.ICHAR.submitReport({
        division: state.division,
        urgency: state.urgency,
        where: val('where'),
        when: val('when'),
        summary: val('summary'),
        affected: val('affected'),
        ongoing: field('ongoing').checked,
        evidence: evidence(),
        authority: val('authority'),
        anonymous: anon.checked,
        name: val('name'),
        email: val('email'),
        phone: val('phone'),
        relation: val('relation'),
        share: field('share').checked
      });

      submit.disabled = false;
      submit.textContent = label;

      const ref = out.ref;
      q('[data-ref]').textContent = ref;
      q('[data-refmeta]').textContent = state.division + ' \u00b7 ' + state.urgency.toLowerCase() +
        ' \u00b7 logged ' + new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      q('[data-track]').setAttribute('href', '/status#' + ref);

      if (!out.stored) {
        setError('Your reference is ' + ref + ', but it did not reach the council record. ' +
          'Write to info.ichar@gmail.com with this reference so intake can log it.');
      }

      form.parentNode.style.display = 'none';
      done.style.display = 'block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
```

Two things change for the reporter. The reference is now six characters after
the division code instead of four digits, which makes it very hard to guess
someone else's. And if the send fails they are told, instead of being handed a
reference that exists nowhere.

## 3. Case Status

File: `ICHAR Case Status.dc.html`

**Replace** the `find` function with this:

```js
    const find = async refRaw => {
      const ref = String(refRaw || '').trim().toUpperCase();
      if (!ref) { fail('Enter the reference number you were given.'); return; }
      if (ref === DEMO.ref) { render(DEMO); return; }
      fail('Looking up ' + ref);
      const rec = await window.ICHAR.lookupCase(ref);
      if (rec) render(rec);
      else fail('No application with that reference was found. Check the number, or write to ' +
        'intake and we will look it up in the council record.');
    };
```

**And** one line inside `render`, so the reporter reads what the officer
actually wrote on the file rather than a fixed sentence:

```js
      q('[data-r-next]').textContent = rec.publicNote || NEXT[stage - 1];
```

The tracker shows the division, the office, the place, the dates, the stage and
the line staff wrote. It does not show the narrative, the reporter's name or any
contact detail, so a stray reference in the wrong hands gives nothing away.

## 4. Donate

File: `ICHAR Donate.dc.html`

**Replace** the block that starts `const ref = 'ICH-P-'` and the `try { ... }`
that writes to `ichar.pledges` with:

```js
      const designation = q('[data-designation]').value;
      const out = await window.ICHAR.submitPledge({
        amount: amt, frequency: state.frequency, designation: designation,
        name: name, email: email
      });
      const ref = out.ref;
      const summary = rupees(amt) + (state.frequency === 'Monthly' ? ' monthly' : ' one-time') + ' \u00b7 ' + designation;
```

and change the handler to `on(q('[data-submit]'), 'click', async () => {`.

## 5. A note on the tracking link

The line above points the reporter at `/status#REFERENCE`, the clean URL. If you
have not applied the clean URL change to the site yet, use
`ICHAR%20Case%20Status.dc.html#` instead, and switch it when you do. The
redirects in `vercel.json` cover the old form either way.

## 6. Turn on anonymous sign in

In the Firebase console, open **Authentication > Sign-in method** and enable
**Anonymous**. The website signs in this way behind the scenes so that a report
can be written without asking the reporter to make an account. The security
rules use it to tell a real browser session from a script.

The reporter never sees a sign-in prompt.

## 7. Check it end to end

1. Open the site, file a test report, note the reference.
2. Open the portal. The file should be at the top of the case list, unrouted.
3. Route it, assign it, move it to Documentation and change the line the
   reporter reads.
4. Go back to the site, put the reference into the tracker. The new stage and
   the new line should be there.

## A note on abuse

Anonymous sign in stops casual scripted spam but not a determined attacker.
Before the site gets busy, turn on **App Check** with reCAPTCHA v3 in the
Firebase console and enforce it on Firestore. It needs no change to the forms,
only the App Check snippet in `ichar-firebase.js`, and it is the single most
useful thing you can add once reports start arriving.
