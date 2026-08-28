/**
 * Phase 3E — does anybody's own prose require a recognition their data denies?
 *
 *   node src/engine/knows-audit.test.js
 *
 * Case 10 of phase-3e-brain-grounding-and-interject.md §6, kept as a standing
 * check rather than a one-off reading. The reviewed answer is the table below;
 * each required edge carries the sentence in that character's own `self.md`
 * that requires it, so rewriting the prose out from under the audit fails here
 * instead of silently making the table a lie.
 *
 * §5.1 bounds this hard. An edge belongs here only when the character's OWN
 * self.md plainly requires them to already recognise somebody. Not because a
 * bible says so, not because they share a room, and NOT because the other side
 * knows them - `knows` is observer-private and asymmetric on purpose.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const card = (id) => JSON.parse(readFileSync(join(ROOT, 'characters', id, 'character.json'), 'utf8'));
const self = (id) => readFileSync(join(ROOT, 'characters', id, 'self.md'), 'utf8');

/**
 * Reviewed 2026-08-27 against every LLM character's self.md.
 * `because` must appear verbatim in that file.
 */
const REQUIRED = {
  'grandma-01': [
    ['woman-01', '孫女來的時候我牽著她一起走'],
    ['brother-01', '辰ちゃん吃得多'],
    ['brother-02', 'タタちゃん吃得少'],
    ['dog-01', '他們家那隻狗叫ハナ'],
    ['pastor-01', '森牧師是那間教會的牧師之一，我認識他很久了'],
    ['grandpa-01', '小野さん也常來喫茶ひだまり']
  ],
  'pastor-01': [['grandma-01', '我認識星さん很久了']],
  'shopkeeper-01': [
    ['grandma-01', '星さん常來，我認識她很久了'],
    ['brother-01', '哥哥叫辰ちゃん'],
    ['brother-02', '弟弟叫タタちゃん'],
    ['dog-01', '他們家那隻狗叫ハナ'],
    ['boy-01', '菅野さん是常客']
  ],
  // The gap the first real Brain run turned up. He is NOT her grandson - her
  // granddaughter is woman-01, and 「おばあちゃん」 is what any child on that
  // street calls an elderly neighbour. He plainly knows her all the same.
  'brother-01': [
    ['grandma-01', 'おばあちゃん一直給我東西吃'],
    ['brother-02', 'タタ是我弟弟'],
    ['dog-01', 'ハナ是我們家的狗']
  ],
  'brother-02': [
    ['grandma-01', 'おばあちゃん的茶要溫的不要燙的'],
    ['brother-01', 'タツ是我哥哥'],
    ['dog-01', 'ハナ是我們家的狗']
  ],
  'girl-01': [['boy-01', '菅野先輩也在社團']],
  'boy-01': [['girl-01', '草野さん也在社團']],
  'gentleman-01': [['shopkeeper-01', '澄子お嬢さん我從她還很小的時候就看著了']],
  'grandpa-01': [
    ['grandma-01', '星さん我認識'],
    ['shopkeeper-01', '這裡的姑娘叫澄子さん'],
    ['brother-01', '哥哥叫辰ちゃん'],
    ['brother-02', '弟弟叫タタちゃん'],
    ['dog-01', '他們家的狗叫ハナ']
  ],
  'woman-01': [['grandma-01', '星のおばあちゃん是我外婆']]
};

/**
 * Deliberate emptiness, not an oversight. 渡辺 is the only character in the
 * cast with no `knows` at all, and his own sheet is what says so.
 */
const DELIBERATE = {
  'man-01': '可是我一個名字都不知道'
};

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

const cast = readdirSync(join(ROOT, 'characters'))
  .filter((id) => existsSync(join(ROOT, 'characters', id, 'character.json')))
  .filter((id) => card(id).brain === 'llm');

check(cast.length >= 11, `the test premise is wrong: ${cast.length} LLM characters`);

// Every LLM character is either audited or explicitly excused. A new one added
// without a reading lands here rather than slipping through.
for (const id of cast) {
  check(REQUIRED[id] || DELIBERATE[id], `${id} has never been audited`);
}

for (const [id, edges] of Object.entries(REQUIRED)) {
  const knows = new Map((card(id).knows ?? []).map((k) => [k.who, k.as]));
  const prose = self(id);
  for (const [who, because] of edges) {
    check(prose.includes(because),
      `${id}'s self.md no longer says "${because}" - the audit needs redoing`);
    check(knows.has(who),
      `${id}'s own prose requires recognising ${who}, and knows does not`);
  }
}

for (const [id, because] of Object.entries(DELIBERATE)) {
  check(self(id).includes(because),
    `${id}'s self.md no longer says "${because}" - the exception needs redoing`);
  check((card(id).knows ?? []).length === 0,
    `${id} is recorded as knowing nobody on purpose, and now knows somebody`);
}

// The kinship correction, held as data rather than as a comment: 辰 calls her
// おばあちゃん and is not her grandson, so the label must not be a family word
// on either side. Her granddaughter is the one she calls 孫女.
{
  const hers = new Map((card('grandma-01').knows ?? []).map((k) => [k.who, k.as]));
  check(hers.get('woman-01') === '孫女', `her granddaughter is recorded as ${hers.get('woman-01')}`);
  check(hers.get('brother-01') === '辰ちゃん',
    `she calls the neighbour's boy ${hers.get('brother-01')}`);
  for (const boy of ['brother-01', 'brother-02']) {
    const label = new Map((card(boy).knows ?? []).map((k) => [k.who, k.as])).get('grandma-01');
    check(label === 'おばあちゃん', `${boy} calls her ${label}`);
    check(!self(boy).includes('外婆') && !self(boy).includes('祖母'),
      `${boy}'s own prose claims her as family`);
  }
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK  every LLM character is audited or explicitly excused; nobody');
console.log('    is required by their own prose to recognise somebody their');
console.log('    data denies; 渡辺 knows nobody on purpose; and the two boys');
console.log('    call 星さん おばあちゃん without being her grandchildren');
