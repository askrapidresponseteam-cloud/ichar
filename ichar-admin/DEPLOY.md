# Deploying

About twenty minutes from an empty Firebase project to a working portal.

## Before you start

```
npm install -g firebase-tools
firebase login
```

## 1. Make the Firebase project

In the Firebase console create a project, then turn on three things:

- **Firestore Database.** Start in production mode. Pick `asia-south1`
  (Mumbai) so the data stays in India and the portal is quick from Delhi.
- **Authentication.** Enable **Email/Password** for staff, and **Anonymous**
  for the public forms. Anonymous sign in is what lets a reporter file without
  making an account, and it is what the security rules check.
- **Storage.** Same region. This holds the papers attached to a case.

## 2. Point the code at it

In `.firebaserc`, replace `PASTE_PROJECT_ID` with your project ID.

In `public/js/config.js`, replace the `firebaseConfig` block with the one from
**Project settings > Your apps > Web**. As soon as a real project ID is there,
demo mode switches off and the portal talks to Firestore.

Paste the same config into `website/ichar-firebase.js`.

## 3. Deploy

```
firebase deploy
```

This publishes the portal, the Firestore rules, the indexes and the storage
rules in one go. The URL it prints at the end is the portal.

To publish only part of it later:

```
firebase deploy --only hosting     # the portal
firebase deploy --only firestore   # rules and indexes
firebase deploy --only storage     # storage rules
```

## 4. Create the first administrator

The portal refuses an account that has no staff record, which leaves a new
project locked. Break in once, either way.

**With the script**, which also creates the sign-in account:

Download a service account key from **Project settings > Service accounts >
Generate new private key**, save it as `tools/service-account.json`, then:

```
cd tools
npm install
node bootstrap.mjs --email you@ichar.org --password "a long passphrase" --name "Your Name"
```

Add `--demo` to write three sample cases as well.

Delete `tools/service-account.json` afterwards, or keep it somewhere private.
It is a master key to the project and it is already in `.gitignore`.

**By hand**, if you would rather not download a key:

1. Authentication > Users > Add user. Enter an email and password.
2. Copy the user's UID.
3. Firestore > Start collection > `staff`. Document ID is that UID. Fields:

   | Field | Type | Value |
   | ----- | ---- | ----- |
   | name | string | Your Name |
   | email | string | you@ichar.org |
   | role | string | admin |
   | office | string | Head Office, New Delhi |
   | active | boolean | true |

Sign in at the portal URL. Everyone after this can be added from the Staff
section, though each person still needs an Authentication account first.

## 5. Connect the website

Follow `website/INTEGRATION.md`. Three small edits to the existing pages, plus
one script tag. The forms keep their current wording and steps.

## 6. Check it end to end

1. File a test report on the site. Note the reference.
2. It should be at the top of the case list, unrouted.
3. Route it, assign it, move it to Documentation, change the line the reporter
   reads.
4. Put the reference into the tracker on the site. The new stage and the new
   line should be there.
5. Sign out. Open the portal again and confirm it asks for a password.

## Optional extras

**Cloud Functions**, for emergency email alerts and a server-rebuilt public
mirror. Needs the Blaze plan.

```
cd functions && npm install && cd ..
firebase deploy --only functions
```

Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `ALERT_TO` and `PORTAL_URL` under
Functions > Configuration in the console. Without a mail server the function
still keeps the mirror in step, and simply logs emergencies instead of mailing.

**App Check.** Once reports start arriving, turn on App Check with reCAPTCHA v3
and enforce it on Firestore. Anonymous sign in stops casual scripted spam, App
Check stops the determined kind. It needs no change to the forms.

**A custom domain.** Hosting > Add custom domain, for something like
`casework.ichar.org`.

## Costs

On the free Spark plan: 50,000 document reads, 20,000 writes and 1 GiB of
storage a day. Loading the case list is roughly one read per case, so a few
officers working all day on a few hundred files sits well inside it. Cloud
Functions and outbound email need Blaze, which is pay as you go and will be
close to nothing at this volume.

## If something goes wrong

**The portal loads but stays on the sign in screen.** The account has no staff
record, or `active` is false. Check `staff/{uid}` in Firestore.

**Missing or insufficient permissions.** The rules are doing their job. Check
the role on your staff document, and that `firebase deploy --only firestore`
actually ran.

**Reports do not appear.** Confirm Anonymous sign in is enabled, and that the
config in `website/ichar-firebase.js` matches the project. The browser console
on the site will show the write being refused.

**The query requires an index.** Firestore prints a link that creates it. Add
it to `firestore.indexes.json` as well so it survives the next deploy.
