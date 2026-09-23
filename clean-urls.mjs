/* Turns the ICHAR site's links into clean paths, and gives each page a title.

   Run it from the folder that holds the site:

     node clean-urls.mjs .

   It changes two things in the HTML files:

   1. Every internal link becomes a clean path. "ICHAR%20About.dc.html#offices"
      becomes "/about#offices". Fragments are kept.
   2. Each page gets a <title>, a description and a favicon link, because the
      exported pages have none. Pages with a title already are left alone.

   It does not rename any file. The component runtime fetches the nav and the
   footer by their exact file names, and a renamed export would have to be
   renamed again every time the pages are exported, so the file names stay and
   vercel.json does the mapping.

   Safe to run twice. Nothing changes on the second run. */

import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2] || '.';
const check = process.argv.includes('--check');

/* The slugs come from the nav itself, which already labels each page:
   <dc-import name="ICHAR-Nav" active="about"> and so on. */
const PAGES = [
  { file: 'ICHAR Home.dc.html', path: '/', title: null },
  { file: 'index.html', path: '/', title: null },
  {
    file: 'ICHAR About.dc.html', path: '/about',
    title: 'About ICHAR - International Council for Human & Animal Rights',
    description: 'Who ICHAR is, how the council is built, and the offices that carry its work across India.'
  },
  {
    file: 'ICHAR Council.dc.html', path: '/council',
    title: 'The Council - ICHAR',
    description: 'The governing council, the executive secretariat and the bodies that keep ICHAR accountable.'
  },
  {
    file: 'ICHAR Divisions.dc.html', path: '/divisions',
    title: 'What We Act On - ICHAR',
    description: 'The human rights, animal rights and environmental rights divisions, the law each one pleads, and how a case moves.'
  },
  {
    file: 'ICHAR Report a Violation.dc.html', path: '/report',
    title: 'Report a Violation - ICHAR',
    description: 'File a report with ICHAR in about five minutes. It can be made anonymously.'
  },
  {
    file: 'ICHAR Case Status.dc.html', path: '/status',
    title: 'Track an Application - ICHAR',
    description: 'Enter the reference you were given at intake to see where your application has reached.'
  },
  {
    file: 'ICHAR Donate.dc.html', path: '/donate',
    title: 'Donate - ICHAR',
    description: 'Fund documented case work, legal filings and field documentation.'
  },
  {
    file: 'ICHAR Policies.dc.html', path: '/policies',
    title: 'Policies - ICHAR',
    description: 'Privacy, terms and accessibility.'
  }
];

/* Every spelling of a link that appears in the exported HTML and in the
   inline scripts, encoded and plain. */
function linkForms(file) {
  const enc = encodeURIComponent(file).replace(/%2F/g, '/');
  const spaced = file.replace(/ /g, '%20');
  return Array.from(new Set([file, spaced, enc, './' + file, './' + spaced, './' + enc]));
}

const replacements = [];
PAGES.forEach(p => {
  linkForms(p.file).forEach(form => replacements.push([form, p.path]));
});
/* Longest first, so "ICHAR Home.dc.html" is never eaten by a shorter match. */
replacements.sort((a, b) => b[0].length - a[0].length);

function rewriteLinks(html) {
  let out = html;
  replacements.forEach(([from, to]) => {
    /* Only inside a quoted attribute or a quoted string, so prose is untouched. */
    const q = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp('(["\'])' + q + '(#[^"\']*)?\\1', 'g'),
      (m, quote, frag) => quote + to + (frag || '') + quote);
    /* Bundled exports carry the same links inside escaped quotes. */
    out = out.replace(new RegExp('\\\\"' + q + '(#[^"\\\\]*)?\\\\"', 'g'),
      (m, frag) => '\\"' + to + (frag || '') + '\\"');
  });
  /* "/#offices" would jump to the home page, so keep same page fragments bare. */
  return out;
}

function addHead(html, page) {
  if (!page.title) return html;
  if (/<title[^>]*>[^<]/i.test(html)) return html;

  const head = [
    '<title>' + page.title + '</title>',
    '<meta name="description" content="' + page.description + '">',
    '<meta name="theme-color" content="#05065d">',
    '<link rel="icon" type="image/webp" href="/assets/ichar-logo-400.webp">',
    '<link rel="canonical" href="https://ichar.org' + page.path + '">',
    '<meta property="og:title" content="' + page.title + '">',
    '<meta property="og:description" content="' + page.description + '">',
    '<meta property="og:type" content="website">'
  ].join('\n');

  return html.replace(/<meta name="viewport"[^>]*>/i, m => m + '\n' + head);
}

let changed = 0;
const files = readdirSync(dir).filter(f => f.endsWith('.html'));

files.forEach(f => {
  const full = join(dir, f);
  const before = readFileSync(full, 'utf8');
  const page = PAGES.find(p => p.file === f);
  let after = rewriteLinks(before);
  if (page) after = addHead(after, page);

  if (after !== before) {
    changed++;
    if (check) {
      console.log('would change  ' + f);
    } else {
      if (!existsSync(join(dir, '.backup'))) mkdirSync(join(dir, '.backup'));
      copyFileSync(full, join(dir, '.backup', basename(f)));
      writeFileSync(full, after);
      console.log('updated  ' + f);
    }
  } else {
    console.log('unchanged  ' + f);
  }
});

console.log('\n' + changed + ' of ' + files.length + ' files ' + (check ? 'would change' : 'changed'));
if (!check && changed) console.log('Originals copied into .backup/');
