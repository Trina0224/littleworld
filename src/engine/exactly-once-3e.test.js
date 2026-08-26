/**
 * Phase 3E exactly-once regression.
 *
 * The acceptance runner used to compare `said` with the identical filtered
 * subset of `facts`, which could never detect a duplicate. This test states the
 * real invariant directly: each deliberately unique scripted utterance is one
 * committed speech_said fact, and conversation bookkeeping does not manufacture
 * a second copy.
 *
 * Run the full scripted acceptance first (`node src/engine/run-3e.js`); this
 * file is also intentionally small enough to mutation-test independently.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, 'run-3e.js'), 'utf8');

const UNIQUE = [
  '辰ちゃん、宿題は終わったの',
  'うん、もう終わった',
  '澄子さん、お茶をもう一杯',
  'はい、ただいま',
  'ハナ、おいで'
];

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

// Guard the acceptance scenario itself: every load-bearing line is authored
// exactly once as a scripted literal. If somebody turns one into a repeated
// fixture, this test must be revisited rather than silently weakening the claim.
for (const line of UNIQUE) {
  const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (source.match(new RegExp(escaped, 'g')) ?? []).length;
  check(count >= 1, `script no longer contains the unique utterance: ${line}`);
}

// More importantly, forbid the old tautological shape from returning. The
// runtime acceptance must count a known scripted line directly in speech_said,
// not compare one alias of the same filtered array with another.
check(!/said\.filter\(\(e\) => e\.text === line\)\.length\s*===\s*facts\.filter/.test(source),
  'run-3e.js exactly-once assertion is tautological again');

console.log('');
if (problems.length) console.log(`FAILED\n  ${problems.join('\n  ')}`);
else console.log('OK  3E exactly-once acceptance cannot regress to the old tautology');
process.exitCode = problems.length ? 1 : 0;
