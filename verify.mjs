/* Serves the site with the vercel.json rules applied, then checks every route
   and every internal link. Use it before deploying:

     node verify.mjs

   It reads vercel.json, so it tests the rules you are about to ship, not a
   copy of them. */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const PORT = 8099;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.xml': 'application/xml',
  '.txt': 'text/plain'
};

const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0].split('#')[0]);

  const redirect = cfg.redirects.find(r => decodeURIComponent(r.source) === path);
  if (redirect) {
    res.writeHead(redirect.permanent ? 308 : 307, { Location: redirect.destination });
    return res.end();
  }

  const rewrite = cfg.rewrites.find(r => r.source === path);
  if (rewrite) path = decodeURIComponent(rewrite.destination);

  if (path === '/') path = '/index.html';

  const file = join(ROOT, path);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('not found: ' + path);
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise(r => server.listen(PORT, r));
const base = 'http://localhost:' + PORT;

let failures = 0;
function report(label, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok ? '' : '   <<< ' + (extra || '')));
  if (!ok) failures++;
}

/* 1. Every clean route serves a page. */
const routes = ['/', '/about', '/council', '/divisions', '/report', '/status', '/donate', '/policies'];
for (const r of routes) {
  const res = await fetch(base + r, { redirect: 'manual' });
  const body = res.status === 200 ? await res.text() : '';
  report('route ' + r + ' serves a page',
    res.status === 200 && body.includes('<body'), 'status ' + res.status);
  report('route ' + r + ' does not end in .html', !r.endsWith('.html'));
}

/* 2. Old URLs redirect to the clean ones. */
const oldUrls = [
  ['/ICHAR%20Home.dc.html', '/'],
  ['/ICHAR%20About.dc.html', '/about'],
  ['/ICHAR%20Case%20Status.dc.html', '/status'],
  ['/ICHAR%20Report%20a%20Violation.dc.html', '/report'],
  ['/index.html', '/']
];
for (const [from, to] of oldUrls) {
  const res = await fetch(base + from, { redirect: 'manual' });
  report('old url ' + from + ' redirects to ' + to,
    res.status === 308 && res.headers.get('location') === to,
    res.status + ' to ' + res.headers.get('location'));
}

/* 3. The component runtime can still reach the nav and the footer from a
      clean URL. This is what breaks if a trailing slash ever creeps in. */
for (const name of ['ICHAR-Nav', 'ICHAR-Footer']) {
  const fromPage = new URL('./' + encodeURIComponent(name) + '.dc.html', base + '/about').href;
  const res = await fetch(fromPage, { redirect: 'manual' });
  report(name + ' resolves from a clean url', res.status === 200, fromPage + ' gave ' + res.status);
}
report('trailing slashes are off', cfg.trailingSlash === false);
report('cleanUrls is off so component fetches are not redirected', cfg.cleanUrls === false);

/* 4. Every internal link on every page resolves. */
const seen = new Set();
const broken = [];
for (const r of routes) {
  const html = await (await fetch(base + r)).text();
  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1])
    .filter(h => !/^(https?:|mailto:|tel:|data:|#)/.test(h));
  for (const link of links) {
    const target = new URL(link, base + r).pathname;
    if (seen.has(target)) continue;
    seen.add(target);
    const res = await fetch(base + target, { redirect: 'manual' });
    if (res.status >= 400) broken.push(target + ' (on ' + r + ')');
  }
}
report('every internal link resolves', broken.length === 0, broken.slice(0, 6).join(', '));
console.log('       checked ' + seen.size + ' distinct targets');

/* 5. Nothing still points at an old style url. */
let stale = [];
for (const r of routes) {
  const html = await (await fetch(base + r)).text();
  const hits = [...html.matchAll(/["'\\]+((?:\.\/)?ICHAR[^"'\\]*\.dc\.html)/g)]
    .map(m => m[1]).filter(h => !/ICHAR-(Nav|Footer)/.test(h));
  if (hits.length) stale.push(r + ': ' + hits[0]);
}
report('no page still links to a .dc.html url', stale.length === 0, stale.join(', '));

/* 6. Each page has its own title. */
for (const r of routes) {
  const html = await (await fetch(base + r)).text();
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  report('page ' + r + ' has a title', !!m && m[1].trim().length > 3, m ? m[1] : 'none');
}

server.close();
console.log('\n' + (failures ? failures + ' checks failed' : 'All checks passed.'));
process.exit(failures ? 1 : 0);
