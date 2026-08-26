/**
 * Phase 3E-10: the cast stays asymmetric, and the engine never repairs a low
 * trait. phase-3e-conversation.md 17.12 and 17.0.
 *
 *   node src/engine/social.test.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { socialWeight, AXES } from './social.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const read = (id) => JSON.parse(readFileSync(join(ROOT, 'characters', id, 'character.json'), 'utf8'));

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

/** Every situation the ranking can be in, enumerated rather than sampled. */
const SITUATIONS = [];
for (const withStranger of [false, true]) {
  for (const quietRounds of [0, 1, 2, 3]) {
    for (const lastSpeakerWasMe of [false, true]) {
      SITUATIONS.push({ withStranger, quietRounds, lastSpeakerWasMe });
    }
  }
}

const CAST = ['grandma-01', 'man-01', 'brother-02', 'boy-01', 'girl-01',
              'shopkeeper-01', 'pastor-01', 'gentleman-01', 'grandpa-01',
              'woman-01', 'brother-01'];
const social = new Map(CAST.map((id) => [id, read(id).social]));

// The vector is authored data and must stay complete.
for (const id of CAST) {
  const v = social.get(id);
  check(!!v, `${id} carries no social vector`);
  for (const axis of AXES) {
    check(typeof v?.[axis] === 'number' && v[axis] >= 0 && v[axis] <= 1,
      `${id}.${axis} is ${v?.[axis]}`);
  }
}

// Pure: same inputs, same answer, and nothing is mutated.
{
  const traits = { ...social.get('grandma-01') };
  const before = JSON.stringify(traits);
  const s = { withStranger: true, quietRounds: 2, lastSpeakerWasMe: false };
  const a = socialWeight(traits, s);
  const b = socialWeight(traits, { ...s });
  check(a === b, 'the same inputs produced two answers');
  check(JSON.stringify(traits) === before, 'the vector was mutated');
  check(typeof a === 'number' && Number.isFinite(a), `the weight is ${a}`);
  check(typeof socialWeight(traits) === 'number', 'a bare call did not work');
}

// 17.12  星さん outranks 渡辺 under every otherwise-equal condition.
{
  const hers = social.get('grandma-01');
  const his = social.get('man-01');
  const beaten = SITUATIONS.filter((s) => socialWeight(hers, s) <= socialWeight(his, s));
  check(beaten.length === 0,
    `渡辺 matched or outranked 星さん in ${beaten.length} of ${SITUATIONS.length} situations`);

  // And the gap is not a rounding artefact.
  const worst = Math.min(...SITUATIONS.map((s) => socialWeight(hers, s) - socialWeight(his, s)));
  check(worst > 20, `their closest situation differs by only ${worst}`);
}

// タタ speaks less readily than 菅野, under equal opportunity.
{
  const tata = social.get('brother-02');
  const kanno = social.get('boy-01');
  const beaten = SITUATIONS.filter((s) => socialWeight(tata, s) >= socialWeight(kanno, s));
  check(beaten.length === 0, `タタ matched or outranked 菅野 ${beaten.length} times`);
}

// 草野 is curious without becoming a driver: high curiosity, low initiative,
// so she must not float to the top of an open floor.
{
  const kyoko = social.get('girl-01');
  check(kyoko.curiosity >= 0.6, `草野's curiosity is ${kyoko.curiosity}`);
  const louder = CAST.filter((id) => id !== 'girl-01'
    && socialWeight(social.get(id), { quietRounds: 0 }) > socialWeight(kyoko, { quietRounds: 0 }));
  check(louder.length >= 4,
    `only ${louder.length} of the cast start a conversation more readily than 草野`);
}

// A low trait is a permission not to act. Nothing compensates for it: 渡辺 must
// stay at the bottom however long the silence runs.
{
  const order = (s) => CAST.slice()
    .sort((a, b) => socialWeight(social.get(b), s) - socialWeight(social.get(a), s));
  for (const quietRounds of [0, 1, 2, 3, 8]) {
    const last = order({ quietRounds }).at(-1);
    check(last === 'man-01',
      `after ${quietRounds} quiet rounds the least eligible is ${last}`);
  }
}

// Inhibition bites harder with a stranger than with somebody known.
{
  for (const id of CAST) {
    const v = social.get(id);
    if (v.socialInhibition < 0.3) continue;
    const known = socialWeight(v, { withStranger: false });
    const stranger = socialWeight(v, { withStranger: true });
    check(stranger < known, `${id} is no more hesitant with a stranger than a friend`);
  }
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  the vector is complete and in range; the weight is pure; 星さん');
  console.log('    outranks 渡辺 in every otherwise-equal situation and he stays');
  console.log('    last however long the silence runs; 草野 is curious without');
  console.log('    becoming a driver; hesitation bites harder with a stranger');
}
process.exitCode = problems.length ? 1 : 0;
