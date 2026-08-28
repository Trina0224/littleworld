# Phase 3E — Brain grounding and interject correction

**Phase labels superseded by `phase-3f.md`** (2026-08-28): what this file calls `3F-A` and `3F-B` are one implemented Phase 3F. Ownership statements below are still accurate; only the phase names changed, and nothing after 3E is 'next' any more.

**Status: binding correction before Phase 3F — IMPLEMENTED 2026-08-27**  
**Result:** `docs/notes/pre-3f-brain-findings-2.md` (§7's second run),
`docs/notes/second-real-brain-run.md` (the transcript). §6's ten cases live in
`src/engine/interject.test.js`, `grounding.test.js` and `knows-audit.test.js`.  
**Created:** 2026-08-27 (`America/Los_Angeles`)  
**Applies after:** `phase-3e-owner-latency-correction.md`, `phase-3e-post-brain-corrections.md`  
**Wins where it conflicts with:** any waiting/ranking rule that allows an unrelated waiting participant to displace a directly addressed listener's immediate response opportunity.

This correction is based on the first real-Brain run and the project owner's restatement of the original simulation semantics.

The first real run found three remaining interface problems that scripted participants could not reveal: the Brain lacks enough grounding to avoid inventing physical state, memory episodes are rendered without a usable subject, and the new waiting bonus solves a real two-person lock by weakening the wrong boundary.

---

## 1. Direct address is a hard response opportunity

If A says something directly to B, and B actually heard the utterance, B gets the next response opportunity before unrelated participants are considered.

```text
A addresses B
B is in speech_said.heardBy
  -> offer B first
```

This is not a fairness score. It is conversational causality.

`roundsWaited`, social personality, initiative, curiosity, or any other ordinary ranking term must **not** cause C to take B's immediate response opportunity away.

The Floor still asks only one Brain at a time. Provider latency remains irrelevant to the fictional order.

### 1.1 B may decline

The rule is an opportunity, not forced speech.

```text
A -> B
ask B

B speaks
  -> commit B
  -> then reevaluate the room

B chooses nothing
  -> resolve the direct-response opportunity
  -> then reevaluate the room
```

A directly addressed character is never required to answer merely because they were addressed.

### 1.2 Why the waiting implementation needs correction

The first real Brain run exposed a genuine problem: A and B can keep addressing each other, resetting the Floor forever, while C at the same table is never even asked.

That problem must be solved without making a waiting C interrupt **before** B has had the chance to answer a sentence explicitly aimed at B.

Therefore the following rule is superseded:

```text
waiting bonus may eventually overtake ADDRESSED
```

The waiting signal may still exist, but not in a way that displaces the immediate addressee.

---

## 2. Interjection belongs at an exchange boundary

After the direct-response opportunity resolves, the Floor reevaluates the other people in the social scene.

Conceptually:

```text
A addresses B
  -> B gets response opportunity

B responds or declines
  -> direct exchange boundary
  -> reevaluate other eligible participants

C has waited / has initiative / has reason to enter
  -> C may receive an interject opportunity
  -> C may speak or choose nothing
```

This keeps two distinct ideas distinct:

```text
response opportunity  = somebody spoke to me
interject opportunity = I have a reason to enter an exchange I was not addressed in
```

The World Engine must not collapse them into one ranking number.

### 2.1 Interjection is optional

A quiet or inhibited character may keep choosing `nothing` forever. The engine's responsibility is to ensure they are not structurally invisible when there is a plausible opportunity to enter.

### 2.2 Interjection should not become round-robin fairness

This correction does **not** require every participant to receive equal airtime.

The cast remains asymmetric. A highly social character should receive interject opportunities sooner/more naturally than a character such as 渡辺. A character with very low social drive may rarely or never choose to use an opportunity.

The goal is:

> being quiet may be the character's decision; being permanently unaskable must not be an accidental consequence of two other people exchanging direct replies.

### 2.3 Existing overheard opportunity stays separate

The cross-zone `why = overheard` mechanism remains unchanged in meaning:

- hearing is not membership;
- a character newly able to hear an active neighboring conversation may receive one bounded optional social opportunity per source social spell;
- no retroactive transcript/perception is created;
- entering the source zone physically makes the actor an ordinary Floor participant.

Do not reuse `overheard` as the name for same-Floor interjection. They are different reasons.

A future implementation may use a distinct internal/visible reason such as `interject`, provided the Brain-facing meaning is clear and the action menu remains engine-authored.

---

## 3. Brain grounding is mandatory dynamic context

The first real Brain run committed invented physical claims because the package omitted facts an ordinary person would know about themselves.

Examples found in the run:

- 星さん claimed she had just walked from the park, although no world fact supported it;
- she claimed 辰's sleeve was frayed, although perception contained no such visual detail.

A Brain asked to inhabit a person will fill a missing self-state with a plausible story. That is an interface defect when the result is committed as public world history.

The dynamic Brain package must therefore include a compact **self grounding** section derived from authoritative world/runtime state.

Minimum fields/concepts:

```text
where I am
  semantic zone / human-readable area

what my body is doing
  standing / seated / walking / working / resting / other deterministic activity

what I am currently occupied with
  current activity name/summary when meaningful

rough fictional time
  enough to distinguish e.g. morning / afternoon / evening, plus day if the simulation exposes it

what I hold / occupy
  held resource, seat/station, or relevant object state when meaningful

why the Floor is asking me now
  addressed / open floor / overheard / interject / other explicit engine reason
```

Use semantic descriptions, not implementation leakage. The model does not need canonical coordinate pairs, internal resource ids, raw tick math, or scheduler state merely to know where it is and what it is doing.

### 3.1 Grounding is observer truth, not omniscience

Grounding may include authoritative facts about the observer's own body/state even when those facts are not sensory observations.

It must not reveal:

- other characters' private state;
- canonical names the observer has not learned;
- author `bible.md` material;
- hidden world facts the observer has no reason to know.

### 3.2 Physical detail must still come from perception

Giving the Brain its own grounding does **not** authorize it to invent new visible detail about somebody else.

The stable answer contract should explicitly communicate a narrow rule equivalent to:

> Treat physical details not present in your grounding/perception as unknown. Do not invent a visible condition, possession, movement history, or recent action merely to make the sentence vivid.

This instruction is a guardrail, not a substitute for supplying the missing self-state.

### 3.3 No fake precision

If the world only knows the character is in `near-table`, say the human-readable equivalent of near table. Do not manufacture a chair number or precise posture not represented in current state.

If the simulation has no meaningful clock mapping beyond a daypart, give a daypart rather than pretending the tick number is a clock time.

---

## 4. Memory episodes must identify their subject safely

A rendered memory such as:

```json
{"kind":"first_meeting","gist":"met for the first time"}
```

is not useful when several such episodes exist and the Brain cannot tell who the episode is about.

Every person-linked episode rendered into a Brain package must include an observer-safe subject representation.

Preferred rendering order:

```text
1. observer-private learned/seeded label, if one exists
2. otherwise a current request-local ref + safe appearance, if the entity is currently representable
3. otherwise a safe remembered appearance/description available to that observer
4. if none can be represented without leaking identity, omit or degrade the episode rather than expose canonical id/name
```

Conceptual examples:

```json
{"kind":"first_meeting","who":"牧師さん","gist":"初めて会った"}
```

or for an unknown person in the current package:

```json
{
  "kind":"first_meeting",
  "who":{"ref":"seen-3","looks":"黒縁眼鏡をかけた若い男性"},
  "gist":"初めて会った"
}
```

The exact JSON field names may follow the existing context schema. The invariant is that the Brain can attach the memory to a person without receiving a canonical entity id or a name it has never learned.

Do not persist request-local `seen-N` refs inside memory storage. Refs are rendering-time transport only.

---

## 5. Audit `self.md` against `character.json.knows`

Run a cast-wide consistency audit across every LLM character.

The question is narrow:

> Does this character's own private `self.md` plainly require them to already recognise a specific entity, while `character.json.knows` says they do not?

Fix clear contradictions only.

Example already found:

```text
brother-01.self.md:
  repeatedly refers to the neighborhood おばあちゃん who feeds him

brother-01.character.json:
  no grandma-01 knows edge
```

That is recognition knowledge and should be seeded.

### 5.1 What the audit must NOT do

Do not turn author intent into character knowledge merely because a relationship appears in `bible.md` or `characters/README.md`.

Do not infer that two characters know each other because:

- the author wants them eventually to meet;
- they share a location;
- one side knows the other;
- a bible describes a potential future scene;
- the relationship would make the story easier.

`knows` remains observer-private and intentionally asymmetric.

### 5.2 Kinship correction

辰 / `brother-01` is **not** 星さん's grandson. The two boys are neighborhood children from the 奥山 family. `おばあちゃん` is their ordinary address for an elderly neighborhood woman.

Any audit/fix must preserve that distinction.

---

## 6. Acceptance tests required before another real-Brain run

Production changes should add focused tests for at least these cases:

```text
1. A directly addresses B; C has a huge waiting/interject score; B is still offered first.
2. B explicitly declines; C may then become the next interject candidate.
3. B answers; only after that committed answer does the Floor reevaluate C.
4. A long A<->B exchange does not make C structurally invisible forever when C has nontrivial social eagerness.
5. A very low-drive C is not forced to speak merely because it has waited.
6. Brain context contains observer self-location, body/activity state and rough fictional time from authoritative state.
7. Context does not expose raw canonical ids/unknown canonical names through grounding.
8. A first_meeting episode can be associated with its subject using observer-safe rendering.
9. The episode renderer never stores or leaks request-local refs as persistent memory.
10. A cast-wide knows audit has no remaining clear self.md/knows contradictions, or explicitly records any deliberate exceptions.
```

Run the full engine suite after the focused tests. Run the existing soak/mutation checks that cover Floor ranking, perception privacy and memory rendering.

---

## 7. Second real-Brain run

After these corrections, run another clean-context manual Brain demo before starting 3F-A.

Keep the same isolation rule:

```text
one character's self.md
+ derived private personality guidance
+ one dynamic private package

NO bible.md
NO other character sheets
NO author/world omniscience
NO carry-over from another Brain request unless it came through world memory/context
```

The second run should specifically observe:

- whether invented physical claims decrease once grounding is present;
- whether a direct A<->B exchange still feels natural;
- whether a third same-Floor participant gets plausible opportunities without interrupting an unanswered direct address;
- whether memory episodes are actually intelligible to the Brain;
- whether corrected `knows` seeds cause natural recognition without leaking extra relationships.

Do not tune for equal airtime. Judge whether the opportunities and decisions make social sense.

---

## 8. Boundary with 3F

These are 3E Brain-interface corrections discovered by using a real Brain. They should be completed before 3F-A so the cafe runtime is not built on top of a known conversation/context defect.

3F-A still owns cafe order/service vocabulary and deterministic shop work.

3F-B still owns provider infrastructure policy such as cancellation, explicit timeout/drop, quotas, retry and concurrency.

3G still owns real provider adapters.

The manual Brain harness remains a validation tool; it is not the scheduler or provider integration.

The binding intent after this correction is:

> **The person explicitly spoken to gets the chance to answer. Other people may enter at a natural boundary. A Brain is grounded in its own actual state, and every private memory it is shown must be understandable without leaking world identity.**