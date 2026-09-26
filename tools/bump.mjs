#!/usr/bin/env node
// Estampille les CSS et JS de index.html (?v=AAAAMMJJhhmmss) avant chaque publication.
// GitHub Pages garde les fichiers 10 minutes en cache : sans ça, un téléphone pourrait
// mélanger la nouvelle page et d'anciens scripts.
// Usage : node tools/bump.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
let n = 0;
const out = readFileSync(file, 'utf8').replace(/(href|src)="((?:css|js)\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g, (m, attr, path) => {
  n++;
  return `${attr}="${path}?v=${stamp}"`;
});
writeFileSync(file, out);
console.log(`${n} fichier(s) estampillé(s) v=${stamp}`);
