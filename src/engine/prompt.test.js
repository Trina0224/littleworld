/**
 * The private stable prefix. Four rules, each of which a mutation can break:
 * the prefix is stable, it never carries author material, distinct characters
 * come out distinct, and an average trait says nothing at all.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPrefix, personality } from './prompt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (id) => ({
  character: JSON.parse(readFileSync(join(ROOT, 'characters', id, 'character.json'), 'utf8')),
  self: readFileSync(join(ROOT, 'characters', id, 'self.md'), 'utf8'),
  bible: readFileSync(join(ROOT, 'characters', id, 'bible.md'), 'utf8')
});

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

const grandma = load('grandma-01');
const watanabe = load('man-01');
const sumiko = load('shopkeeper-01');

// --- stable means stable -----------------------------------------------------
// A prefix that differs between two builds is a prefix that is never cached, and
// the whole economics of pacing-and-latency 6b rests on it not moving.
check(buildPrefix(grandma.character, grandma.self)
   === buildPrefix(grandma.character, grandma.self),
  'the prefix is not identical between two builds');

// --- author material never reaches a Brain -----------------------------------
// The real bible, not an invented string: a test with a made-up sentence would
// still pass if the loader started opening bible.md.
{
  const prefix = buildPrefix(grandma.character, grandma.self);
  const lines = grandma.bible.split('\n').map((l) => l.trim())
    .filter((l) => l.length > 12 && !l.startsWith('#'));
  check(lines.length > 5, 'the test premise is wrong: the bible has no sentences to check');
  for (const line of lines) {
    if (prefix.includes(line)) { problems.push(`the bible reached the prefix: ${line.slice(0, 24)}`); break; }
  }
  // The blockquote at the top of self.md is written to the author, not the
  // character, and telling a character it is a cache prefix breaks the fiction.
  check(!prefix.includes('快取前綴'), 'the author note reached the character');
  check(prefix.includes('星のおばあちゃん'), 'the test premise is wrong: her own words are missing');
}

// --- distinct characters stay distinct ---------------------------------------
// social-personality 4 forbids flattening everyone into "be engaging".
{
  const her = personality(grandma.character.social);
  const him = personality(watanabe.character.social);
  check(her.length > 0 && him.length > 0, 'somebody got no guidance at all');
  check(!her.some((s) => him.includes(s)),
    'the loudest and the quietest character were told the same thing');
}

// --- an average trait says nothing -------------------------------------------
// Not tidiness: "you are averagely curious" is a sentence that costs tokens and
// biases nothing, and it would dilute the traits that do mean something.
{
  const flat = personality(Object.fromEntries(
    Object.keys(grandma.character.social).map((k) => [k, 0.5])));
  check(flat.length === 0, `a flat vector produced ${flat.length} sentences`);
  // And a real half-and-half character says something about the axes that stand
  // out and nothing about the rest.
  const her = personality(sumiko.character.social);
  check(her.length > 0 && her.length < Object.keys(sumiko.character.social).length,
    `澄子 got ${her.length} sentences of ten axes; she is not extreme on all of them`);
}

// --- the answer contract is stated, once -------------------------------------
{
  const prefix = buildPrefix(grandma.character, grandma.self);
  check(prefix.includes('"pick"') && prefix.includes('nothing'),
    'the prefix never tells the Brain how to answer');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK  the stable prefix is stable, carries no author material,');
console.log('    keeps the loudest and quietest character apart, and says');
console.log('    nothing at all about an average trait');
