#!/usr/bin/env node
// Change le code équipe de la carte fidélité (4 chiffres, comme le pavé de l'appli).
// Usage : node tools/set-pin.mjs 4821
// Le code n'est jamais stocké en clair : seule son empreinte SHA-256 est écrite dans js/kk-loyalty.js.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pin = process.argv[2];
if (!/^\d{4}$/.test(pin || '')) {
  console.error('Usage : node tools/set-pin.mjs <code à 4 chiffres>');
  process.exit(1);
}

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'kk-loyalty.js');
const src = readFileSync(file, 'utf8');
const salt = (src.match(/salt:\s*'([^']+)'/) || [])[1];
if (!salt) {
  console.error('Sel introuvable dans js/kk-loyalty.js');
  process.exit(1);
}
const hash = createHash('sha256').update(`${salt}:${pin}`).digest('hex');
writeFileSync(file, src.replace(/pinHash:\s*'[0-9a-f]*'/, `pinHash: '${hash}'`));
console.log('Code équipe mis à jour. Pensez à publier la modification.');
