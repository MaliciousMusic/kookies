#!/usr/bin/env node
// Remplace l'adresse du site dans tous les fichiers SEO (canonical, Open Graph, JSON-LD, sitemap, robots, llms.txt).
// Usage : node tools/set-domain.mjs https://www.kookies-clermont.fr
//         node tools/set-domain.mjs https://utilisateur.github.io/kookies   (GitHub Pages sans domaine)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const next = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[a-z0-9._-]+)*$/i.test(next)) {
  console.error('Usage : node tools/set-domain.mjs https://www.mon-domaine.fr');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'robots.txt', 'sitemap.xml', 'llms.txt'];
const canonical = (readFileSync(join(root, 'index.html'), 'utf8').match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
if (!canonical) {
  console.error('Adresse actuelle introuvable (balise canonical de index.html).');
  process.exit(1);
}
const current = canonical.replace(/\/+$/, '');

let total = 0;
for (const f of FILES) {
  const p = join(root, f);
  const src = readFileSync(p, 'utf8');
  const count = src.split(current).length - 1;
  if (count) {
    writeFileSync(p, src.split(current).join(next));
    total += count;
    console.log(`${f} : ${count} remplacement(s)`);
  }
}
console.log(`${current} → ${next} (${total} remplacement(s))`);
