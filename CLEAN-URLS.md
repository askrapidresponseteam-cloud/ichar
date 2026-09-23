# Clean URLs for the ICHAR site

Before:

```
https://ichar-rho.vercel.app/ICHAR%20Home.dc.html
https://ichar-rho.vercel.app/ICHAR%20Report%20a%20Violation.dc.html
```

After:

```
https://ichar-rho.vercel.app/
https://ichar-rho.vercel.app/report
```

## The one command

Copy `vercel.json`, `.vercelignore`, `robots.txt` and `sitemap.xml` into the
site folder, then from that folder:

```
node clean-urls.mjs . && node verify.mjs && vercel --prod
```

That rewrites the links, checks every route and every internal link, and
deploys. If the check fails, nothing is deployed.

To see what the link rewrite would change without touching anything:

```
node clean-urls.mjs . --check
```

## The routes

| Page | URL |
| ---- | --- |
| Home | `/` |
| About | `/about` |
| The Council | `/council` |
| What We Act On | `/divisions` |
| Report a Violation | `/report` |
| Track an Application | `/status` |
| Donate | `/donate` |
| Policies | `/policies` |

The slugs are not invented. The nav already labels every page this way, with
`<dc-import name="ICHAR-Nav" active="report">`, so the markup and the URLs now
agree.

Fragments still work, so `/divisions#animal` and `/status#ICH-2026-HR7K3M9P`
both land where they should.

## Why the files are not renamed

The component runtime in `support.js` fetches the shared nav and footer by
their exact file names:

```js
const url = COMPONENT_DIR + "/" + encodeURIComponent(name) + ".dc.html";
```

So `ICHAR-Nav.dc.html` and `ICHAR-Footer.dc.html` have to keep their names, or
every page loses its header and footer.

The page files could have been renamed, but they are tool exports. Re-export
one page and the old name comes back, and the site breaks until someone
remembers to rename it again. Mapping the URLs in `vercel.json` instead means
an export can be dropped straight in and it keeps working.

## Two settings that matter more than they look

**`trailingSlash: false`.** The pages load `./support.js` and the runtime
fetches `./ICHAR-Nav.dc.html`, both relative to the page URL. At `/report`
those resolve to `/support.js` and `/ICHAR-Nav.dc.html`, which is right. At
`/report/` they would resolve to `/report/support.js` and 404, and every page
would lose its script and its nav. Do not change this.

**`cleanUrls: false`.** Vercel's own clean URL feature strips `.html` from
every file, including the nav and footer, and redirects the `.html` form to the
stripped one. The runtime fetch would then take a redirect on every single page
load. The explicit rewrites do the same job without touching the component
files.

## What else is in here

**Redirects from every old URL**, permanent, so links already shared keep
working. That matters most for `/status`: anyone who filed a report was given a
tracking link, and those must not break.

**Titles and descriptions.** The exported pages had no `<title>` at all, so
every tab and every search result read as a bare URL. Each page now has a
title, a description, a canonical link, a favicon and Open Graph tags. The
script only adds them where a title is missing, so it will not fight with
anything you set by hand.

**`.vercelignore`.** `ICHAR Home (standalone).html` is 2 MB and
`ICHAR Home -offline-src-.html` is another 52 KB, and both are copies of the
home page that a search engine would happily index as duplicates. Ignoring
them, the `.thumbnail` file and the `uploads` folder takes the deploy from
6.6 MB to 2.2 MB.

**`robots.txt` and `sitemap.xml`** listing the eight real pages. Change
`ichar.org` in both to whatever the live domain ends up being, along with the
canonical links the script writes.

## If you re-export a page

Drop the new `.dc.html` file in, then run the two commands again:

```
node clean-urls.mjs . && node verify.mjs
```

The link rewrite is safe to run as often as you like. Running it twice in a row
changes nothing the second time.

## Verifying

`verify.mjs` reads `vercel.json` and serves the site under those exact rules,
then checks that all eight routes return a page, that the old URLs redirect,
that the nav and footer still resolve from a clean URL, that every internal
link on every page works, that no page still links to a `.dc.html` URL, and
that every page has a title. Thirty four checks, all passing on this build.

It needs nothing installed.

## House style: no long dashes

`clean-urls.mjs` also replaces every em dash, en dash and other long dash with a
plain hyphen, in the page copy, in the inline scripts and in `support.js`. The
original export had 97 of them, mostly in body copy such as "Clearing site data
removes the list - the council's own record is unaffected", and a handful as the
placeholder for an empty field on the tracking page.

It runs as part of the same command as the link rewrite, because an export from
the page builder brings them straight back. Run it after every export and the
site stays in style.

The script itself names the characters it removes as `\u2014` escape sequences,
so it contains no long dash characters of its own.

`support.js` is generated vendor code with a "do not edit" header. The dashes in
it are all in comments, so nothing functional changed, but if you ever replace
that file the script will need to run again.

## Spacing and the display headings

The headings were set in `'Arial Narrow', Impact, 'Arial Black', sans-serif`
with leading as tight as .82 and tracking at -.055em.

None of those three faces exists on iOS or Android. On a phone the stack fell
all the way through to plain Helvetica or Roboto, a normal width face, carrying
sizes and negative tracking that had been measured against a condensed one. That
is why the headings looked correct on the Mac they were designed on and jammed
on a phone. "ENVIRONMENTAL" at the 40px floor came to about 327px in the
fallback face, against 280px of usable width on a 320px screen, so it also ran
off the side.

Three changes, applied by `clean-urls.mjs` and `assets/type.css`:

**Archivo Narrow goes in front of the stack**, requested on the Google Fonts
line the pages already load, so it costs no extra round trip. It is a condensed
grotesque close to Arial Narrow Bold, which is what the design was drawn
against. Every device now draws the headline at the intended width.

**Leading floored at .92**, applied to 126 inline styles. Caps stand about .72em
tall, so .92 leaves a .20em gap between lines. At .82 that gap is .10em, which
is the collapsed look in the screenshot. Anything already at .92 or above was
left alone, so the hierarchy is unchanged.

**`assets/type.css`** handles what an inline style cannot: it opens the leading
further and releases most of the negative tracking below 700px and again below
420px, caps the largest headings on screens under 380px, stops any long word
pushing the page sideways, gives tap targets 44px on touch devices, and lets
wide tables scroll inside themselves.

Run the script after every export and the corrections come back with it.
