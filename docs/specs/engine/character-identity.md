# Character Identity and Seeded Knowledge — Phase 3B

**Status:** design draft
**Companion to:** `world-engine-2.5.md` (§3 Private Agent Sessions, §6.3 Recognition, §7 Memory)

Phase 3B is mostly a **writing** phase, not a programming one. Its output is a
folder per character, authored by the project owner. The code it needs is a
loader and a set of leak checks, and both are small.

## 1. Why this document exists

An earlier review of the phase plan said "names belong in memory, not in the
identity registry". That is right about one thing and badly wrong about another,
and the difference matters enough to write down.

- Whether **Taro knows the grandmother's name** is per-agent, changes over time,
  and belongs in his private memory. ✔
- Whether **Taro knows his own name** is not memory at all. It is who he is, it
  is true from the first tick, and without it he cannot introduce himself to
  anyone. ✘ — the earlier rule would have left every character unable to say
  who they were.

The project owner put it as a question: *otherwise how does an LLM introduce
itself to anyone?* It cannot, and that is the hole this document closes.

## 2. Three artifacts, not one

| | Written by | Who may read it | Voice |
|---|---|---|---|
| **Bible** | owner (Claude may draft) | the owner and Claude — **no LLM character, ever** | third person, plus direction |
| **Self sheet** | owner (Claude may draft) | **exactly one agent**, as its own identity | first person |
| **Appearance** | owner, from the bible | world truth; anyone who can see the character | third person, no name |

The bible is the source. The self sheet is what that character's private session
is built from. The appearance line is the only part of a character that the
world itself is allowed to state about them.

**The bible is never fed to a model.** It contains direction — *the pastor never
proselytises*, *the shopkeeper is warm but not chatty* — which is a constraint on
the production, not a belief the character holds about themselves. Direction
becomes guardrails in the prompt or rules in the engine; it does not become
self-knowledge.

## 3. What a character folder holds

```text
characters/brother-01/
  character.json     machine facts: id, brain, appearance, seeded recognition
  bible.md           third person. for the owner and for Claude
  self.md            first person. this agent's identity, and nobody else's
```

### 3.1 `character.json`

```json
{
  "id": "brother-01",
  "brain": "llm",
  "appearance": "a stocky boy of about ten in a white tee and a cap, with a navy backpack",
  "sprite": "brother-01",
  "knows": [
    { "who": "brother-02", "as": "Kenji" },
    { "who": "dog-01", "as": "Shiro" }
  ]
}
```

- `brain` is `llm`, `deterministic`, or `none`. The dog is `deterministic`; a
  background adult who never speaks may be `none`.
- `appearance` is **world truth and carries no name**. It is what a stranger
  perceives, and it should match what the sprite actually looks like — it is
  checkable against the art.
- `knows` is the machine-readable half of seeded knowledge: *does this agent
  recognise that one, and under what name*. `as` allows nicknames, and allows
  two characters to call the same person different things.
- `sprite` points at the existing art identity; this file does not restate
  anything already in `pose-matrix.json` or `placements.json`.

### 3.2 `bible.md`

Third person. Everything the owner wants remembered about who this person is,
including the parts a character would never say about themselves, and including
direction. Claude reads it to understand the cast; no character ever does.

### 3.3 `self.md`

First person, present tense. Everything this agent knows at tick zero: its own
name and history, what it wants, and **what it thinks of the people it already
knows**. This file is the `[IDENTITY]` and `[PERSONALITY]` sections of §3.1 —
it is literally the stable, cacheable prefix of every request that agent makes.

## 4. The rule that matters most: seeded knowledge is asymmetric

Do not build one relationship table and render both sides from it. Write both
sides, separately, and let them disagree.

> **brother-01 / self.md**
> Kenji is my little brother. He is scared of dogs and will not admit it — he
> ran away from Shiro yesterday and then said he was looking for Grandma. I
> have not let him forget it.

> **brother-02 / self.md**
> Taro is my big brother. He shows off. I did **not** run away yesterday, I
> went to find Grandma, and he keeps telling everyone the wrong version.

Same event, two accounts, both sincerely held. That disagreement is where
character comes from, and it is also the only thing that gives them something
to talk about.

A symmetric table generates two agents who are both objective, both correct,
and both dull — and who can never argue about yesterday, because their records
are identical.

The same applies everywhere: the shopkeeper's read on a regular, the
grandmother's opinion of the pastor. Each is written from that person's side and
is allowed to be unfair.

## 5. How a name actually travels

The world never announces a name. It states appearance; names move through the
fiction.

```text
brother-01's self sheet   he knows he is Taro
        |
        v
   he says so aloud       a speech fact enters the world
        |
        v
   Perception decides     who was near enough to hear it
        |
        v
   each hearer writes     into their own private memory
```

Until that happens, the man in the dark suit is *a man in a dark suit* to
everyone who has not been told otherwise.

This is also where §7's epistemic types earn their place. A name someone tells
you is a `heard_claim`, not a `known_fact` — **because they can lie**. That
distinction is not over-engineering; it is the reason those types exist.

## 6. Two consequences worth knowing before writing any prose

**The self sheet is the cache prefix.** §3.1 requires the stable prefix to be
byte-for-byte stable. So:

- nothing volatile may appear in `self.md` — no dates, no "today", no current
  state, no tick count;
- editing a character's self sheet invalidates that character's cached prefix.
  Rewriting a personality has a real cost, and it is not zero. This is an
  argument for getting the prose roughly right before the provider is connected,
  not for freezing it forever.

**Length is a budget, not a canvas.** Every token in a self sheet is re-sent on
every decision that character makes, for the whole run. A page of backstory that
never changes anyone's behaviour is a page paid for thousands of times. Write
what shows.

## 7. What the loader does — and what it must not do

The pattern is the same as everywhere else in this project: **the owner writes
the source, and code validates and assembles. Code never invents prose.**

There is no generation step. `self.md` is not derived from `bible.md` by a
model; that would be lossy in exactly the places that matter, and it would make
the owner's writing advisory rather than authoritative.

### Leak checks

These are mechanical and worth having from the first day:

```text
appearance contains no character's name
a self sheet mentions no other character that is absent from its `knows` list
no self sheet is byte-identical to another, or to its own bible
every `knows.who` names a character that exists
every character with brain "llm" has a self sheet
the assembled context for agent A contains no file belonging to agent B
```

The last one is the private-mind invariant of §3, checked rather than trusted.
It is the cheapest possible insurance against the failure mode that would be
hardest to notice: an agent that quietly knows things it was never told.

## 8. Deterministic actors

The dog has no self sheet — a deterministic brain does not read prose. It still
needs `character.json` for its appearance, and it still belongs in the bible,
because the two brothers have opinions about it and those opinions are half the
scene.

## 9. Division of labour

**The owner decides:** who these people are, how they see each other, what must
never happen. That is authorship, and it is not Claude's to do.

**Claude can:** draft first versions to be rewritten, define the file format,
write the loader and the leak checks, and wire the result into the engine.

## 10. Open questions

- whether `self.md` should carry explicit private goals, or whether goals are
  better left to emerge from the prose;
- how a character's knowledge of the *place* (the cafe's prices, where the
  bench is) is seeded — probably shared world knowledge in the prefix rather
  than per character, but that is untested;
- whether appearance should vary with what a character is currently doing
  (seated, working) or stay one fixed line;
- what happens when the owner rewrites a self sheet mid-run — almost certainly
  "restart the run", but it should be stated.
