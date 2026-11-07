// Έλεγχος αναλλοίωτων της λογικής (<script id="logic"> του index.html).
// Τρέξιμο: node test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');
const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!m) throw new Error('δεν βρέθηκε το <script id="logic">');
const mod = { exports: {} };
new Function('module', 'globalThis', m[1])(mod, globalThis);
const B = mod.exports;

let pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.error('FAIL:', msg); } }

const evalJs = js => Function('"use strict"; return (' + js + ')')();

for (let tier = 1; tier <= 4; tier++) {
  let last = '', kinds = {};
  for (let n = 0; n < 500; n++) {
    const q = B.genQuestion(tier, last); last = q.expr;
    const tag = `t${tier}#${n} ${q.expr}`;
    kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    ok(q.tier === tier, tag + ' tier');
    ok(Array.isArray(q.opts) && q.opts.length === 4, tag + ' 4 options');
    ok(q.opts.every(o => typeof o === 'number' && Number.isFinite(o)), tag + ' numeric finite');
    ok(new Set(q.opts.map(o => String(o))).size === 4, tag + ' unique options');
    ok(new Set(q.labels).size === 4, tag + ' unique labels');
    ok(q.labels.every(l => l && !/NaN|undefined|Infinity/.test(l)), tag + ' labels clean');
    ok(q.opts.filter(o => Math.abs(o - evalJs(q.js)) < 1e-9).length === 1, tag + ' exactly one correct (by eval)');
    ok(Math.abs(q.opts[q.correct] - evalJs(q.js)) < 1e-9, tag + ' correct index equals value');
    ok(q.opts.every(o => o >= 0), tag + ' no negatives');
    if (!q.dec) ok(q.opts.every(Number.isInteger), tag + ' integers in non-decimal question');
    if (tier <= 3) ok(q.opts.every(Number.isInteger), tag + ' tiers1-3 integers only');
    ok(typeof q.explain === 'string' && q.explain.length > 5 && !/NaN|undefined/.test(q.explain), tag + ' explain');
    ok(typeof q.expr === 'string' && !/NaN|undefined/.test(q.expr), tag + ' expr');
    if (q.kind === 'prio') {
      ok(q.trap !== null && q.opts.includes(q.trap) && q.trap !== q.ans, tag + ' priority-ignored trap present');
    }
    if (q.kind === 'mult') {
      const [a, b] = q.js.split('*').map(Number);
      ok(a >= 2 && a <= 12 && b >= 2 && b <= 12, tag + ' table range');
    }
    if (q.kind === 'div') {
      const [a, b] = q.js.split('/').map(Number);
      ok(a % b === 0 && b <= 12 && a / b <= 12, tag + ' exact division within 12');
    }
    if (tier === 1) ok(evalJs(q.js) <= 100 && q.opts.every(o => o <= 200), tag + ' within 100');
    if (tier === 2 && q.kind === 'round') ok(evalJs(q.js) <= 1000, tag + ' within 1000');
  }
  console.log(`tier ${tier}: kinds`, kinds);
}
// όλα τα είδη ερωτήσεων κάθε επιπέδου εμφανίζονται
{
  const want = { 1: ['add', 'sub', 'comp'], 2: ['mult', 'div', 'round'], 3: ['prio', 'paren', 'pow10', 'comp1000'], 4: ['decAdd', 'decMul', 'percent', 'mixed'] };
  for (const t in want) { const seen = new Set(); for (let i = 0; i < 500; i++) seen.add(B.genQuestion(+t).kind); want[t].forEach(k => ok(seen.has(k), `tier ${t} produces kind ${k}`)); }
}
// γνωστές μορφοποιήσεις και εμφάνιση
ok(B.fmt(1000) === '1.000' && B.fmt(0.5) === '0,5' && B.fmt(1234.25) === '1.234,25' && B.fmt(7) === '7', 'fmt');
// προτεραιότητα: το 3+4×5 δίνει 23 με παγίδα 35
{
  let found = false;
  for (let i = 0; i < 4000 && !found; i++) { const q = B.generators.prio(); if (q.js === '3+4*5') { found = true; ok(q.ans === 23 && q.opts.includes(35), '3+4*5 → 23, παγίδα 35'); } }
}
// ανάβαση επιπέδων & βαθμολογία
ok(B.sprintTier(1, 0) === 1 && B.sprintTier(1, 6) === 2 && B.sprintTier(1, 100) === 4 && B.sprintTier(3, 6) === 4, 'sprintTier');
ok(B.scoreFor(1) === 10 && B.scoreFor(2) === 10 && B.scoreFor(3) === 15 && B.scoreFor(9) === 15, 'scoreFor');
ok(B.starsFor(15, 0) === 3 && B.starsFor(14, 0) === 2 && B.starsFor(12, 2) === 2 && B.starsFor(12, 5) === 1 && B.starsFor(9, 0) === 0 && B.starsFor(20, 1) === 2, 'starsFor');
ok(B.SPRINT.start === 60 && B.SPRINT.bonus === 3 && B.SPRINT.cap === 90, 'sprint constants');

// μονομαχία: τυχαίες ακολουθίες — ποτέ διπλός πόντος ανά ερώτηση, κλείδωμα, τέλος στους 10
for (let g = 0; g < 2000; g++) {
  const s = B.duelNew(10); let items = 0;
  while (!s.over && items < 500) {
    const before = s.scores[0] + s.scores[1];
    const taps = 1 + Math.floor(Math.random() * 8);
    for (let t = 0; t < taps; t++) {
      const p = Math.random() < 0.5 ? 0 : 1, c = Math.random() < 0.4;
      const wasLocked = s.locked[p], wasResolved = s.resolved;
      const r = B.duelTap(s, p, c);
      if (wasLocked || wasResolved) ok(r === 'ignored', 'lockout/resolved tap ignored');
      ok(s.scores[0] + s.scores[1] - before <= 1, 'ένας πόντος το πολύ ανά ερώτηση');
    }
    ok(!(s.locked[0] && s.locked[1]) || s.resolved, 'και οι δύο κλειδωμένοι ⇒ λυμένη');
    B.duelNext(s); items++;
  }
  ok(s.over && (s.scores[s.winner] === 10) && s.scores[1 - s.winner] <= 10, 'ο αγώνας τελειώνει στους 10');
  ok(B.duelNext(s) === false, 'δεν συνεχίζει μετά το τέλος');
  ok(B.duelTap(s, 0, true) === 'ignored', 'ignored μετά το τέλος');
}
{ // ρητά σενάρια
  const s = B.duelNew(10);
  ok(B.duelTap(s, 0, false) === 'locked', 'λάθος κλειδώνει');
  ok(B.duelTap(s, 0, true) === 'ignored' && s.scores[0] === 0, 'κλειδωμένος δεν παίρνει πόντο ακόμη και σωστά');
  ok(B.duelTap(s, 1, true) === 'point' && s.scores[1] === 1, 'ο άλλος παίρνει τον πόντο');
  ok(B.duelTap(s, 0, true) === 'ignored' && s.scores[0] === 0, 'μετά τον πόντο, κανείς άλλος');
  B.duelNext(s);
  ok(B.duelTap(s, 0, false) === 'locked' && B.duelTap(s, 1, false) === 'both-wrong' && s.resolved && s.scores[0] + s.scores[1] === 1, 'και οι δύο λάθος ⇒ κανείς πόντος');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
