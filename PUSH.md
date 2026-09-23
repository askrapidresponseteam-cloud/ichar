# Getting this into the repo

Your repo keeps the site files at the root, and Vercel deploys from the root,
so everything in `ichar-site` goes to the top level and the admin portal goes in
as a folder beside it.

```
ichar/                     <- repo root, this is what Vercel serves
  index.html
  ICHAR About.dc.html
  ICHAR-Nav.dc.html
  assets/
  vercel.json              <- new
  .vercelignore            <- new
  robots.txt               <- new
  sitemap.xml              <- new
  ichar-admin/             <- new, excluded from the Vercel deploy
```

## The one command

With `ichar-clean-urls.zip` on the desktop:

```bash
cd ~/Desktop && \
unzip -o ichar-clean-urls.zip -d ichar-bundle && \
git clone https://github.com/askrapidresponseteam-cloud/ichar.git ichar-repo && \
cd ichar-repo && \
cp -R ../ichar-bundle/ichar-site/. . && \
cp -R ../ichar-bundle/ichar-admin ./ichar-admin && \
node verify.mjs && \
git add -A && \
git commit -m "Clean URLs, page titles, sitemap" && \
git push
```

The `verify.mjs` step runs 34 checks and the `&&` chain stops on failure, so a
broken build never reaches the push.

If you already have the repo cloned, skip the `git clone` line and `cd` into
your copy instead.

## Why `/.` and not `/*`

`cp -R ../ichar-bundle/ichar-site/. .` copies hidden files too. With
`ichar-site/*` the shell silently skips `.vercelignore`, the deploy stays at
6.6 MB, and nothing tells you it went wrong.

## Check it after Vercel finishes

```
https://ichar-rho.vercel.app/report
https://ichar-rho.vercel.app/status
https://ichar-rho.vercel.app/ICHAR%20Report%20a%20Violation.dc.html    -> should redirect to /report
```

Open `/report` and confirm the header and footer are there. If they are, the
component runtime is resolving correctly from the clean URL, which is the one
thing worth eyeballing.

## If a clean route 404s

The rewrites point at filenames containing spaces, encoded as `%20`. That is
the correct encoding and it works, but if Vercel ever refuses it, the fallback
is to rename the seven page files and drop the encoding. Rename
`ICHAR About.dc.html` to `about.html` and so on, leave `ICHAR-Nav.dc.html` and
`ICHAR-Footer.dc.html` exactly as they are, and change the destinations:

```json
{ "source": "/about", "destination": "/about.html" }
```

Nothing else changes. Only the nav and footer are fetched by filename, so
renaming pages is safe. The reason the mapping exists at all is that these are
tool exports, and a re-export brings the old filename back.

## Two things to know, since the repo is public

**Never commit `ichar-admin/tools/service-account.json`.** It is a master key to
the Firebase project. `ichar-admin/.gitignore` already blocks it, and git
respects that nested file, but download it only when you need it and delete it
afterwards.

**The Firebase web config is not a secret.** The `apiKey` in
`ichar-admin/public/js/config.js` is a project identifier, not a credential, and
it is meant to ship in the browser. What actually protects the data is
`firestore.rules`. Those being public is fine and normal.

## The uploads folder

`uploads/` holds `ICHAR.pdf`, a screenshot and a second copy of the home page,
about 6 MB in total, and no page on the site links to any of it. It stays in
git but `.vercelignore` keeps it out of the deploy, which takes the site from
6.6 MB to 2.2 MB. If you do link to `uploads/ICHAR.pdf` from somewhere, delete
the `uploads` line from `.vercelignore`.

## Deploying the admin portal

It is in the same repo for convenience but it does not go to Vercel. From
`ichar-admin`, once the project ID and config are filled in:

```
firebase deploy
```

`ichar-admin/DEPLOY.md` has the full setup.

## Before the domain goes live

`robots.txt`, `sitemap.xml` and the canonical tags in each page say
`ichar.org`. Change them to whatever the real domain becomes.
