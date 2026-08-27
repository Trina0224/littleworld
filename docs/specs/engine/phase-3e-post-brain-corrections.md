# Phase 3E — Corrections after the first real Brain run

**Status: binding. Wins where it conflicts with `phase-3e-conversation.md`,
`phase-3e-implementation-structure.md`, or `phase-3e-tuning.md`.**
**Applied 2026-08-27**, from `docs/notes/pre-3f-brain-findings.md`.

Three things a scripted participant could never have shown, because a scripted
participant does not read its package and does not write real sentences. Each
was found by six calls to a real model in a clean context, and each is now a
rule in the engine rather than a note.

---

## 1. A line is as long as the person

`speechLimit` was one number for the whole cast. It is now a **fallback and a
ceiling**; each character's budget comes from `talkativeness`:

```text
budget = round(30 + 420 * talkativeness)

渡辺 0.15 ->  93      澄子 0.50 -> 240      辰 0.85 -> 387
タタ 0.15 ->  93      小野 0.65 -> 303      星さん 0.90 -> 408
ユキ 0.30 -> 156      菅野 0.60 -> 282      ユキちゃん 0.95 -> 429
```

0.5 lands on 240, which is what the old flat number really was: the average
person's budget applied to everybody. It truncated 星さん mid-word on her first
real turn and would never have bound on 渡辺 at all.

Binding rules:

- The budget **is stated in the Brain's private stable prefix**. A limit the
  model cannot see is a limit it cannot respect.
- It is **still enforced**, because `LLM OUTPUT = PROPOSAL`.
- An over-budget line is **cut at the end of a sentence**, never mid-word. If
  the line contains no sentence end within budget, it is cut hard as a last
  resort.
- The trim writes `speech_trimmed` to **audit**. Silent shortening is forbidden
  in both directions: the world must be able to say what it dropped.

## 2. One breath, one volume, at most two acts

An utterance may carry more than one act. Answering a neighbour and calling the
dog in the same sentence is **one thing said**, not two, and the first real run
produced exactly that — smuggled into a `reply`, so the dog was never called.

**Fact shape.** `speech_said.to` is a **list** of everybody the line is aimed
at, empty for a remark to the room. Perception, the addressee ranking, the
cross-zone handoff and the transcript all read that one shape.

**The Brain's contract.** `picks: [...]` carries the list; `pick` remains the
shorthand for a single act.

**Refused, each with its own reason:**

| refusal | why |
|---|---|
| more than `actLimit` (2) acts | a breath is not a paragraph |
| two different scopes in one breath | **an utterance has one volume.** A quiet remark welded to a shout would change who heard the other half |
| two acts aimed at the same person | you cannot both greet and question somebody in one act |
| two acts that ask | the floor holds one open question; two would silently lose one |
| `nothing` alongside anything | saying nothing is not half an act |
| any pick not on the offered menu | a Brain cannot invent a choice — this applies to **every** pick, not the first |

Two *shouts* in one breath are legal and reach two rooms:「澄子さん、牧師さん！」
is one thing said. Each named person gets the cross-zone handoff of
`phase-3e-floor-clarifications.md`.

Cafe acts (`order`, `ask_shopkeeper:…`) remain 3F-A. What this settles is the
shape an utterance may have, not the vocabulary.

## 3. The floor yields to waiting

An addressee ranks first and every utterance restarts the round, so two people
answering each other never yield. The first real run had 渡辺 sit through six
rounds at the same table **without being asked once**.

> Being asked and saying no is the design. Never being asked is not silence, it
> is absence.

**Rank is class plus personality**, not class alone. `socialWeight`'s situation
gains `roundsWaited` — rounds spent in the current conversation without once
being *offered* — and the term scales with the character's own eagerness
(`initiative`, `conversationDrive`, minus `socialInhibition`). So 星さん cuts
into an exchange after a few rounds, 澄子 after many, and 渡辺 not at all: his
silence stays his rather than the infrastructure's.

**Waiting is counted from the start of the current conversation**, not from the
floor's first round. A woken floor that treats everybody as having waited since
round zero hands the whole room the maximum bonus at once, and a bonus that
large makes a direct address ignorable.

**Measured, and against intuition.** Over five 3000-tick runs of the full cast,
the step is a **plateau, not a peak**: 140 to 420 per round all give the same
flattened distribution (top3 0.57 against 0.62 with no waiting), so only being
inside the band matters. And **bigger is worse** — by 840 the room is measurably
*less* fair than with no term at all, because it scales with eagerness and so
amplifies whoever was already talking instead of rescuing whoever was not.

This supersedes `phase-3e-tuning.md` §4 only where that file records
`speechLimit` as never binding. It never bound *for a scripted brain*.

---

## What this did NOT change

- **`K = 1`.** One Brain is asked at a time, and elapsed simulation ticks never
  fabricate a decline. The owner latency correction stands.
- **The offered floor.** One per zone; the zone is the session; joining is
  walking in.
- **Hearing physics.** Audibility is still the hard gate, computed at commit and
  carried on the fact.
- **Who may be addressed quietly.** A normal-scope act still reaches only
  somebody in the speaker's own zone. Crossing a zone boundary is `call_across`,
  which is broadcast.

## Still open from the same run

Recorded in `docs/notes/pre-3f-brain-findings.md` §6 and not fixed here:

1. **Grounding — the biggest one left.** The package says where everybody else
   is and nothing about **where the observer is, what they are doing, or what
   time it is**. A Brain asked to speak as a person supplies what a person would
   know: the first run invented a walk from the park and a frayed sleeve, and
   both committed as speech. The hole is where grounding should be.
2. **Episode gists name nobody** — `{"kind":"first_meeting","gist":"met for the
   first time"}`, twice over, is worse than saying nothing.
3. **`knows` needs auditing against each `self.md`** — `brother-01` has no entry
   for his own grandmother.
