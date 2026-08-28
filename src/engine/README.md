# World Engine — Phases 3A, 3C, 3D, 3E and 3F

Plain ES modules, no dependencies, no build step. They run under Node today and
in the browser later without change; only the scenario runner touches a host
API, to read the spec files from disk.

```bash
python3 docs/specs/world/navgrid-derive.py    # once, after the painted maps change
node src/engine/run-3a.js
node src/engine/nav.test.js
node src/engine/days.test.js
node src/engine/loop.test.js
node src/engine/perception.test.js
node src/engine/memory.test.js
node src/engine/meeting-boundary.test.js
node src/engine/perception-held-limit.test.js
node src/engine/floors.test.js
node src/engine/floor-rounds.test.js
node src/engine/floors-address-decline.test.js
node src/engine/floor-brain.test.js
node src/engine/exactly-once-3e.test.js
node src/engine/animals.test.js
node src/engine/social.test.js
node src/engine/social.test.js
node src/engine/run-3c.js          # shows what a Brain would actually be handed
node src/engine/run-3e.js          # a scripted afternoon, and the fifteen 3E acceptance items
```

| File | |
|---|---|
| `clock.js` | integer ticks, and which day they fall in |
| `rng.js` | seeded random numbers |
| `resources.js` | the states a claimable thing can be in |
| `events.js` | the two streams |
| `attendance.js` | who is here today |
| `loop.js` | one tick, in the order the spec says |
| `hearing.js` | how far a voice carries |
| `zones.js` | which semantic area a position is in |
| `perception.js` | the sensory boundary between the world and one Brain |
| `placement.js` | semantic destination in, physical position out |
| `memory.js` | what a character remembers, and the context a Brain receives |
| `floors.js` | one offered conversational floor per zone |
| `animals.js` | what a deterministic actor does when spoken to |
| `social.js` | the ten-axis vector, turned into a number |
| `nav.js` | A* over the painted walkable map |
| `world.js` | authoritative state, resources, reservations, movement |
| `activity.js` | the Activity Runtime |
| `view.js` | facts → what a renderer draws, and replay |
| `run-3a.js` | the scripted scenario, and the checks it has to pass |
| `nav.test.js` | the one navigation property that is easy to lose |
| `days.test.js` | days, absence, and the schedule that must not move |
| `loop.test.js` | the tick order, and that perception in it moves no fact |
| `perception.test.js` | every leak the 3C spec asks to be proved impossible |
| `memory.test.js` | that a memory is the rememberer's and nobody else's, and accrues from the loop |
| `meeting-boundary.test.js` | that knowing of somebody is not having met them |
| `perception-held-limit.test.js` | that a refused context takes nothing with it |
| `floors.test.js` | which zones are conversations, and who may answer from where |
| `floor-rounds.test.js` | who is asked, who speaks, and when the room goes quiet |
| `floors-address-decline.test.js` | that saying no to somebody settles what they asked |
| `floor-brain.test.js` | what a Brain is shown, and what it is allowed to pick |
| `exactly-once-3e.test.js` | that one decision becomes one utterance, once |
| `animals.test.js` | that 辰's dog comes when he calls, and mostly not otherwise |
| `social.test.js` | that the cast stays asymmetric and nothing repairs a low trait |
| `run-3c.js` | the 3C acceptance scenario, printed |
| `run-3e.js` | a scripted afternoon: the 3E acceptance list, printed |

## The tick

`phase-3c-perception.md` §2 defines the canonical tick order, and for a while
nothing implemented it: every scenario open-coded its own loop and perception was
called by hand in a demo. `loop.js` is now the one place that owns it.

```
1  advance the integer world clock      6  refresh perception for each present agent
2  advance deterministic movement       7  accumulate private memory from what was perceived
3  advance deterministic activities     8  advance each zone's conversation floor
4  update reservations / presence       9  decide whether any agent needs a Brain wakeup
5  commit the resulting world facts    10  dispatch those requests asynchronously
```

Steps 1–9 never wait for inference. **Step 10 is not here** — it belongs to the
scheduler in 3F, and `onWakeup` is where it attaches. The contract is already
enforced by the shape: the hook is handed a list and its return value is
discarded, so there is nothing for a future implementer to await. `loop.test.js`
proves it by running the same scenario twice with a hook that returns a promise,
and comparing both streams.

**Step 7 is a stage, not a courtesy.** Memory accumulation was called by hand in
tests first, which is exactly the gap perception was in before this file existed:
a thing that works in the scenario that thought about it and silently does not
run anywhere else. `createLoop({world, runtime, perception, memory})` owns it,
and a loop handed memory without perception is refused rather than left to record
nothing and look busy. Its position is load-bearing: after 6 because it reads
what perception just refreshed, and before 8 because building a Brain context
**drains** the perception queue — memory reads that queue without draining it,
and reading first is what makes *remembered exactly once* true however rarely a
Brain is woken.

Steps 4 and 5 are not separate calls — reservations move because an activity step
moved them, facts commit as they happen. They are named anyway because they are
real stages of the tick even where no line corresponds to them.

**Wiring perception in cannot change a fact,** because perception only ever reads
the two streams. Memory is the same claim one step narrower: it is private, so it
appends to **audit** and never to facts — step 7 leaves the recording a renderer
or a replay reads byte for byte identical, and gains the `memory_written` lines
that make a run explicable.

That is a claim, so it is asserted: the same scenario runs with and without
perception and the fact *and* audit streams are compared byte for
byte — over a run that covers movement, reservation, occupancy, release, speech,
day boundaries and activity transitions, so the comparison is evidence rather
than a coincidence of two empty logs.

`speech_said` is a fact, so `view.js` carries it: an utterance shows for a fixed
number of **ticks**, never milliseconds, so a bubble expires at the same instant
live and in replay.

**It also carries who heard it.** How far a voice carries is world physics, so it
lives in `hearing.js` and `world.hearing` is the only place that answers — 3E
needs the same question in two more places, and two implementations of one rule
is where drift hides. `world.say` stamps `heardBy` on the fact while everybody is
still standing where they were standing, because nothing downstream can work it
out afterwards: it depends on positions at that tick, and recovering those means
replaying movement, which is re-simulation. Perception reads the field and throws
if it is missing; it now only decides what a *near miss* looks like, because
seeing somebody speak is not hearing the words. `hearingRange` and `soundRange`
therefore left perception's `DEFAULTS`, and world physics wins over any
perception config — a package that contradicted the recorded audience would be a
package about a different world.

## Perception (3C)

> **The World Engine determines what an agent can perceive. The Agent Brain
> determines what those perceptions mean.**

Four decisions carry it.

**The server knows who; the model is told what it looks like.** Even when the
engine is certain an entity is `pastor-01`, the model-visible observation says
only *身材高瘦、帶明顯西洋輪廓的中年男子…*. Recognition belongs to the character —
to its own self sheet and memory — not to the world's eyes, and that is what
permits uncertainty and honest mistakes. Sanitising is an **allowlist**: the
model-visible object is rebuilt field by field, so a field added to the internal
record later cannot leak by being forgotten.

**Refs point, they do not name — and they are transport, not storage.** Inside one
delivered context the same entity is always the same `seen-N`, so a Brain can say
*approach seen-2* without ever being handed an id. Numbering follows the order the
model reads, never entity id — if `seen-1` always meant "alphabetically first", the
numbering would itself be an identity leak paid out slowly.

A ref is valid for one request and its answer. Anything that outlives that round
trip — an action target, a memory — is **canonicalised at commit**: `canonicalize()`
resolves every ref in the reply to its entity, and the entity is what gets stored.
So memory never holds a ref and never depends on an epoch surviving. The epoch
cache is a transport window; the test shrinks it to a single entry, evicts
everything, and proves a committed record is untouched. A ref that is stale at
commit is reported, never repaired by guessing at somebody nearby.

**A context can be withdrawn without consuming anything.** Building a context
takes that observer's queued events *provisionally*; `settle(epochId, {delivered})`
either drops them or puts them back in `seq` order. Answered and failed both
count as delivered — nobody is told the same old sentence again on a retry — and
only a context that was never used gives its events back. That exists because a
context can be built and then never spoken from: the person walks out of the zone
before answering, or the floor is revoked under them. Without it their queue
would have been drained for a turn they never took, and a sentence addressed to
them would simply vanish. (The first draft justified it by a batch of three
offers where only the highest-ranked speaks; the owner's latency correction
replaced batching with one offer at a time, and the mechanism survived the change
because cancellation needs it just as much as losing does.)

`settle` is deliberately **not** `releaseEpoch`. Refs are a transport cache that
may be dropped at any moment or never; the queued events are what an agent is
owed, and `held` is bounded by `heldLimit` rather than by `epochHistory` for the
reason 3C already learned about refs. A caller that never settles is a bug, not a
load, so exceeding the limit throws — **before** the epoch is created and the
queue is drained, because the first version of that guard threw afterwards and
so left the observer's events held under an epochId the caller never received.
Unreachable forever: the exact failure this step exists to prevent, inside the
check meant to detect it. A refused `contextFor` is now a true no-op, and
`perception-held-limit.test.js` asserts it by name — and `perception.test.js` asserts
`heldCount()` is zero at the end, which is what makes the contract enforceable
rather than merely stated. The limit itself is now measured rather than picked:
four contexts, one per open floor, was the most ever outstanding across three
full-cast runs, so eight is headroom that still catches a leak within a few
offers. `queueLimit` came down from forty to sixteen by the same measurement —
see *Tuning the constants* under 3E. 3D needed no change at all: memory reads the queue
with a cursor and never drains it, so a restored event cannot be ingested twice.

**A queue, because perception and delivery run at different speeds.** Sensory
state refreshes every tick; a Brain wakes rarely. A sentence spoken two hundred
ticks before the next wakeup is still there. It is not memory and not a message
broker: once an event reaches a successfully built context it counts as
delivered even if inference later fails, so nobody is told the same old
utterance again on every retry. A direct address is never displaced from the
queue by ordinary visual noise.

**Own failure is the one thing taken from audit.** A failed attempt changed
nothing, so it is not a fact and cannot be derived from the fact stream at all.
It reaches the agent that attempted it and nobody else, at any distance. That
*narrows* the audit stream's contract rather than widening it — before this it
had no defined consumer inside the simulation, and the spec quietly needed one.

Zones come from `docs/specs/world/zones.json`, and `zones.js` re-evaluates the
polygons rather than shipping a packed map: a byte per cell is ~300 KB base64
against a few hundred bytes of polygon. Two implementations of one containment
rule is where drift hides, so the JSON carries a 300-position sample the Python
assigned and the test asserts the JS reproduces all of it.

### What the tests prove

Every property in `phase-3c-perception.md` §14 and the clarifications §6, each
one asserted rather than promised. The leak tests run against the **real**
character files: a test with invented appearance strings would still pass if the
engine started reading `bible.md`, so the check that matters takes real sentences
out of a real bible and a real self sheet and asserts none of them appear.

Eight more came from 3E-2 and all eight bite: a withdrawn context keeping the
events anyway, a delivered one giving them back, restoring in queue order rather
than `seq` order, restoring past the queue limit, settling twice, settling with
no verdict, and letting unsettled contexts pile up silently. The eighth — removing
the held store entirely — crashes on the first `settle` in the file with
*settle() for an epoch that was never built*, which is loud but is a crash rather
than a clean failure; recorded rather than contorted around.

Three of these first caught nothing and needed the tests sharpened: the ordering
and queue-limit ones because the restored queue was empty, and the no-verdict one
because the following line threw and killed the run before the failure printed.

Seven more came from 3E-1 and all seven bite: `say` stamping an empty audience
(*A stood beside the speaker and heard nothing*), the speaker listed as their own
audience, a carrying voice that does not carry, an unsorted `heardBy`, perception
recomputing instead of reading the record (*perception ignored the committed
audience and recomputed it*), tolerating a fact with no `heardBy`, and ignoring
the hearing range entirely.

That fifth one needed a deliberately artificial test, and it is worth saying why:
a recomputation normally agrees with the record, so nothing would show. The test
plants a fact whose audience contradicts the geometry — the far listener in, the
near one out — and asserts perception follows the record. Artificial, and exactly
the divergence a committed answer exists to prevent.

Fifteen mutations were run to confirm the assertions bite — including making
perception append a fact, dropping step 6 from the loop, letting the loop observe
what the wakeup hook returned, and stopping the speech bubble from expiring — — leaking `entityId` into
the visible entry, hearing without distance, broadcasting `own_action_failed` to
bystanders, never marking events delivered, dropping protected events from the
queue, sourcing appearance from `self.md`, canonicalising without recursing,
guessing at a stale ref instead of reporting it, making `canonicalize` a no-op,
and making `releaseEpoch` do nothing. All fifteen failed the suite. One earlier
form of the wakeup mutation hung instead of failing, because returning before the
clock advanced left the run unable to finish; it was replaced with one that fails
cleanly, and the assertion was strengthened to compare audit as well as facts.

## Conversation floors (3E)

> **The zone is the conversation.** Joining is walking in and leaving is walking
> out, both of which the engine already does and already commits.

That replaced a session object with a lifecycle, membership, joins and
tick-based idle detection — and dissolved the problem that killed the first
design, because *silence* becomes a round of offers with no taker rather than a
tick count that is shorter than a single model call.

**A zone qualifies for a floor** when two LLM actors stand in it, or one and an
addressable animal, or one holding a heard direct address that has nowhere else
to be answered. That third clause is the cross-zone case: hearing crosses zone
edges, so 星さん at the near table can call 澄子 at the counter, and 澄子 may be
the only person there. The counter qualifies temporarily and closes again the
moment the address resolves — a one-person floor must never become permanent, or
she is polled forever.

**One utterance is one fact in one zone.** The target's zone gets an
opportunity, never a copy. `speech_said` carries `zone` alongside `heardBy` and
for the same reason: which room it was spoken in depends on where the speaker
stood at that tick, and recovering that later means re-running containment
against replayed movement.

**The transcript is derived, not stored.** A per-zone index of positions in the
fact stream is appended at ingestion and never cleared when a floor is
destroyed, so a zone that empties and fills again reads back exactly what it
read before. The rebuild-from-facts property is true by construction rather than
by maintenance — there is no second copy to keep in step.

**The floor is offered to one character at a time, and it waits.** A round asks
the highest-ranked eligible character — addressee first, then an overhearer being
nudged, then everybody else by weight with a hash tie-break. If they decline, it
asks the next. A full pass in which everyone declined is one quiet round, and
`quietLimit` of those puts the floor to sleep.

**A Brain that has not answered is not silence.** The floor waits for the
decision it actually asked for, however long the provider takes; the rest of the
world keeps ticking meanwhile. Elapsed simulation ticks never turn a slow model
into an implicit decline — that was a tick deadline shorter than an ordinary
model call, which is precisely the failure the session object was thrown away
for, put back in a new place. Provider timeout, retry and drop are 3F-B's, and
when 3F-B drops a request that is an explicit scheduler outcome rather than a
timer hidden in here.

An earlier version asked three at once and let **rank** rather than arrival
decide the speaker, so that provider latency could be hidden behind parallel
generation. That optimisation is withdrawn (`phase-3e-owner-latency-correction.md`):
Simulation is *allowed* to take real time to generate history, and Replay is the
audience-facing pacing layer, so the whole apparatus — counterfactual utterances,
`floor_lost`, rank-versus-arrival races — was paying for a problem the
architecture had already deleted.

**What does invalidate a pending request is the world changing under it.** A
character who walked out of the zone is not still thinking about its floor, so
the offer is cancelled, its perception context is settled as never used, and the
round carries on with whoever is still there. Without that the floor waits
forever and the whole zone stops conversing — which it did, until a probe found
it: nought utterances in twenty-five ticks after somebody left mid-request, and
twenty-four after the fix. That is also what the provisional-delivery API is
still for, now that a normal sequential resolution simply settles as delivered.

**Waking is a declared property of the fact type**, in `events.js` where facts
are defined, defaulting to false. A whitelist kept by the consumer is a list the
next runtime forgets to update, and it fails in the expensive direction: one new
café fact quietly polling every Brain within earshot. Seats wake a floor and
stations do not — they are one thing to a reservation on purpose, so the
difference has to be drawn here, and 澄子 claiming her workstation is exactly the
machinery this excludes. Waking starts a new social spell.

**The Brain selects; it never authors.** An offer carries the choices the engine
just produced — `reply:seen-2`, `ask:seen-2`, `address_group`, `call_across:seen-4`,
`nothing` — and a reply that names anything else is refused. So an act, a scope,
an id or a coordinate cannot be invented: the engine validates against the list it
supplied, and an invalid choice is impossible by construction. **Transport comes
from the act**, never from the reply; a model that could set `scope` would
gradually make every conversation scene-wide. Text is truncated rather than
rejected, and discarded for a choice that carries no speech — a model that ran
long, or helpfully added a sentence to `nothing`, has not malfunctioned. A
refusal is audit, changes nothing, and reaches only the actor that attempted it.

**A transcript is the observer's own.** What they heard, and either on their floor
or spoken by or to them — so a conversation survives a zone boundary while the
one next door stays out and arrives as perception, which is what it is. Speakers
render by an ordered fallback: the observer's private label, else the current ref
plus a description, and never a canonical name or an entity id. That join lives
in `buildContext`, the one place holding both the refs and this observer's
memory, which is why `floors.js` never sees a memory store.

**A question is the one stake the engine owns.** `ask` marks a debt only if the
target heard it, the debt lives on the asker's floor, and it raises the asker on
later rounds — while the person who owes the answer is already first as the
addressee. An answer settles it from whichever floor it is made on, and the two
drifting out of earshot drops it. Whether the reply actually answered the
question is semantics, and the engine stays out of it.

**Speaking to the dog needs no new mechanism.** The Brain picks `call_over`,
`praise` or `shoo` from the menu; the words go out as ordinary speech aimed at
her and the *act* is what the world executes, so the engine never reads the
prose. Audibility is a hard gate in front of the compliance roll — the same
`canHear` with `dog-01` as the observer — so a call she could not hear is
ignored for a physical reason rather than a bad roll, and uncertainty comes from
a hash of `(seed, tick, speaker, act, animal)` rather than the shared rng, for
the reason `attendance.js` already learned.

The asymmetry costs nothing and nobody wrote it: **辰 calls and she comes better
than 80% of the time; 星さん calls and it is under 35%** — because
`bonds.familiarity` is 1.0 for the two brothers and absent for everyone else.
The test asserts the character file still says so, or it would be measuring its
own arithmetic. **An ignored call is a fact too**: a dog visibly not coming is
information about the caller.

**`socialWeight` is a pure function, injected rather than imported.** The floor
ranking takes it as a parameter, so the store never learns what a personality is
and the asymmetry test never needs a floor. It enumerates every situation the
ranking can be in rather than sampling: 星さん outranks 渡辺 in all sixteen and
by more than a rounding artefact, タタ never outranks 菅野, 草野 stays curious
without becoming a driver, and **渡辺 remains the least eligible however long
the silence runs** — which is the point. A low trait is a permission not to act,
not a defect for a scheduler to repair.

**Company is not a conversation.** The nudge is refused to somebody already in a
live conversation — and reading that as *refused to anybody with company* left
two people sitting quietly together permanently inert beside a party they could
hear. A soak found it: the far table went dormant at tick 3, heard 204 lines of
the park over the next 400, and was never asked again. 熊田 and 小野 are exactly
the pair the mechanism exists for. The test is deliberately not pinned to which
of them gets the nudge — the table is 64 units from one park speaker and 71 from
the other, so naming the winner would pin the geometry rather than the rule.

The nudge is also **spent when it is granted, not when the offer is built**. By
then the floor has been woken or created for it and no longer looks like
somewhere nobody was talking, so spending it there makes the answer depend on
the order two questions are asked in — which it did, for one round, at 29 nudges
in a sixty-line conversation.

**Nudge suppression lives on the source zone's social spell**, not on the target
floor that happens to be showing the nudge. A cross-zone overhearer gets one
*should I go over?* per conversation, and the target's temporary floor may be
created and destroyed any number of times in between without resetting that. The
spell is what ends it, and the spell belongs to the room the conversation is in.

### The acceptance run

`run-3e.js` is a scripted afternoon at the near table, and it prints what
happened:

```
t=  1  near-table   normal    辰ちゃん、宿題は終わったの
t=  2  near-table   normal    うん、もう終わった
t=  3  near-table   broadcast 澄子さん、お茶をもう一杯
t=  4  near-table   normal    いいお天気ね
t=  5  cafe-counter broadcast はい、ただいま
t=  9  near-table   normal    ハナ、おいで
t=  9  (ハナ)        call_over complied
```

Fifteen offers produced nine utterances — one offer at a time, each waited for.
**渡辺 was asked and allowed to decline**, every time. 澄子 heard every word from
her counter, was nudged **once** in the whole conversation, and said nothing
until she was called by name — and when she answered she *called back across*,
because she was not standing at their table and the menu therefore never offered
her a reply into it. ハナ came when 辰 called her, and would mostly not have for
anyone else.

**Scripted, not mocked.** Every choice is written in the file. A stand-in that
*decided* would make the run pass for reasons the run does not control, and 3E is
about session mechanics rather than about judgement (clarifications §17.0). The
script reacts to committed facts rather than to its own claims, because a claim
that did not become an utterance did not happen — a mistake the first version of
it made and the fact stream caught.

All fifteen items of `phase-3e-conversation.md` §17 are asserted there, and
**live and replay produce an identical frame every tick** — the live view fed
facts as they are emitted, the replay view fed the same facts through `view.js`
alone, which now also carries `animal_responded` so a dog coming or visibly not
coming survives into a recording.

### What the tests prove

One hundred and eighteen mutations, all biting. The fifteen most recent come from the first real
Brain run and the three changes it forced: the budget that is the character's
own rather than the cast's, the sentence-boundary cut, a second act silently
dropped, a second act that skips the menu, a second person named who is not owed
an answer, a second person who hears it as somebody else's conversation, a
speaker who records only the first person they addressed, a transcript that
shows only the first name, one breath in two volumes, three acts in one, two
questions in one, waiting that counts for nothing, waiting that is the same for
everybody, waiting that can never overtake an addressee, and a woken floor that
counts everybody as having waited since round zero. Three more were written,
could not be shown to change any behaviour, and led to guards being removed
instead of kept.

Before them, two covering the rule the tuning run turned up (below): arriving in a room is not social, and setting off
wakes the room you left. The second of those first caught nothing, and for an
instructive reason: it was written against `rearmedBy`, which never sees
`move_started` at all because `SOCIAL_FACTS` gates it first. Mutating the branch
proved nothing about a branch that is unreachable. Mutating the whitelist —
which is the real gate — bites on four assertions at once.

Two before them, covering the sequential offer rule the owner's latency
correction restored: a floor that gives up on a Brain that is still thinking, and
a pending request that outlives the person it was waiting for.

Fifty-eight before them. The store: dropping step 8 from the loop, not
stamping the zone, letting an unheard address qualify a zone, letting a pending
address not qualify one, opening a floor for one person alone, refusing one for a
person and their dog, clearing the utterance index when a floor closes, copying
an utterance into the target's zone as well, keying nudge suppression without the
social spell, and reusing a spell when a floor reopens.

The rounds: letting the first answer take the floor (*the floor went to
grandma-01; rank said pastor-01*), letting every claimant speak, counting a
loser's context as delivered (*the loser lost the utterance it was woken for*),
not putting the addressee first, offering the whole batch when there is an
addressee, not counting a taker-less round as quiet, offering from a dormant
floor, never expiring an unanswered offer, waking on any fact at all, waking on a
station as if it were a seat, reusing the spell when a floor wakes, never
spending the overheard nudge, and revoking a temporary floor while it carries the
offer it exists for.

The Brain interface: accepting any act string, guessing at a ref whose round
trip is over, letting the reply choose its own transport, rejecting a long line
instead of truncating it, treating `nothing` as speech, silencing a refusal,
letting an overheard conversation into the transcript, rendering an entity id in
it, rendering a stranger with no ref, keeping a question nobody could hear,
never settling one that was answered, using last tick's addressee for this
tick's offer, and leaving an address pending after it was declined.

Five of those first caught nothing, and each needed a sharper scenario rather
than a different rule: a stale ref that the *menu* check had already refused; a
transport test that only asserted the loud case; a truncation test with no long
line; a stranger who never spoke; and a question whose floor was closing anyway,
so the floor rather than the rule was doing the clearing.

The adapter between the two: never asking memory who is a stranger, guessing at
one when it has no memory to ask, and dropping the floor's situation on the way
through.

The dog and the vector: ignoring familiarity, always complying, rolling for a
call she could not hear, drawing compliance from the shared rng, leaving no fact
when she ignores one, dropping her from the menu, giving her a transcript,
making hesitation the same with a stranger as with a friend, ignoring an axis
the weight claims to read, letting silence compensate for a low drive, and
mutating the vector it was handed.

Three of those first caught nothing. The inaudible call was rolled once and the
hash happened to refuse it anyway — it is now called thirty times. The shared-rng
one passed because two identical runs stay identical either way; the real
property is stability under *what anyone else draws*, so the second run now
draws seven times from the world rng first, which is the shape `days.test.js`
already uses. And the initiative one was hidden behind three other axes that
differ between 星さん and 渡辺; each axis the weight claims to read is now moved
on its own against a flat vector.

The station one first caught nothing: the test fired a made-up resource id, so
the `resource()` lookup already refused it and the `kind` check was doing no
work. It now reserves and occupies the real `cafe-counter` station and the real
`counter-stool-1` beside it, and asserts the two behave differently.

## The cafe, the weather, and the seam (3F)

> **Routine commerce is engine-owned; socially meaningful judgement is
> Brain-owned.** One phase, not an A and a B: `docs/specs/engine/phase-3f.md`
> retired that split because venue knowledge, ambient world knowledge, Brain
> opportunities and provider transport turned out to be one interface boundary
> the moment a real Brain used them.

**The world stays in daylight.** `ambient.js` picks one weather and temperature
per run - deterministically from the seed unless a director says otherwise - and
records it, because a character mentions the weather and replay has to know what
the run was told. The daypart is **authored**, never computed: `ticksPerDay` is
attendance bookkeeping and not the sun, and grounding used to derive a five-part
clock from tick fraction, which meant a long enough run told somebody darkness
had arrived.

**A person standing there knows some things.** The session bootstrap is said
once (`prompt.js`): the handful of mundane facts the mechanics cannot teach a
model, the kind of day it is, and what the cafe sells. Not a memory - writing
「I remember that today was 22°C」 into private storage so the model keeps seeing
it would be a lie about what remembering is - and not a per-turn cost, because
per-turn is what dynamic grounding is for.

**There is no classifier.** `order:<id>` is an engine-authored choice whose item
is resolved against the menu; everything else a customer says to the shopkeeper
is speech, and speech wakes her through the direct-address rule she already had.
That IS the semantic router: one branch executes, the other is a person talking,
and there is nothing in between to be wrong. It is also why an invented curry has
nowhere to enter - the menu is the choice set, so a Brain never learns the menu
from a rejection.

Whether you may order at all is a fact, not a permission list: she has to be able
to hear you at ordinary speaking volume. The far table is 78 units from the
counter against a hearing range of 70, so people sitting there have to call
across or come closer. Nobody wrote that rule; it is the room.

**`cafe.js` finishes what it starts, with nobody's help.** The obligation with
its grace and refresh, the queue, one person's capacity, preparation whose
duration is the critical path rather than the sum, a complex nerikiri shaped by
hand in seven committed steps, the cup carried to the person who ordered it, and
the empty one collected afterwards. In the real-Brain run the tea arrived with
the shopkeeper's Brain silent throughout - a provider outage would not have
changed a fact of it.

Two distinctions the code keeps apart because a mutation showed they were one:
being **at capacity** gates what she can start; having **anything in hand at all**
is what stretches a waiting customer's grace, because pressing somebody to order
while she is already making something is the world nagging on a timer.

**`brain-runtime.js` has no tick budget anywhere in it.** A request stays
outstanding for as many simulation ticks as it takes. Infrastructure may give up
- that is `drop` and `cancel` - but only because something outside the fiction
said so, and `decline()` now records *who* declined, because a character saying
nothing and a dropped request are identical in the fact stream and the audit is
where they stop being the same thing.

### What the integrated run proves

`run-3f.js` is §12's fourteen cases as one scenario rather than fourteen helper
tests: ten simulation days that do not bring on the night, a bootstrap said once
against a turn that carries grounding, an ordinary order that needs nobody's
judgement, five hundred ticks that fabricate no decline, and one seed that is one
afternoon with nothing left held.

Twenty-five mutations, all biting, and three of them found real bugs rather than
confirming a rule. A busy shopkeeper whose customers' grace ran out anyway. An
order that only cleared when its customer left, so an order placed by somebody
who stays all afternoon never cleared at all - unbounded growth wearing the
clothes of a plausible rule, found by a 5000-tick soak. And the one the real
Brain found by refusing to produce a scenario at all: **an obligation coming due
into a room that had already gone quiet**, firing into a sleeping table where
nobody was ever asked. The same shape as arriving in a room not being social - a
rule true in the engine and invisible in the world.

### What the second real Brain run changed

`docs/specs/engine/phase-3e-brain-grounding-and-interject.md` is the binding
correction; `docs/notes/pre-3f-brain-findings-2.md` is what the run that
followed it found.

**Being spoken to is not a score.** The waiting term added after the first run
could grow until it outranked a direct addressee, which turns "somebody spoke to
me" into a number other numbers may beat. It is conversational causality, so
ranking is now **lexicographic**: class first, personality only within a class,
and nothing `socialWeight` returns can cross a boundary. The waiting term is
gone from it entirely.

**The lock it was solving is broken at an exchange boundary instead.** When a
direct-response opportunity resolves - answered or waved away - and nobody on
this floor is still owed one, that is a boundary, and one person who was not
addressed may be offered a way in with `why = interject`. Eligibility is how long
they have sat there against how long they can sit still: 星さん five rounds, 澄子
twenty, 渡辺 thirty. The floor of two rounds is deliberate - being quiet has to
be the character's decision, not the infrastructure's.

The boundary is read **before** the new utterance registers its own addressees,
because the answer somebody has just given is not the address they are still
owed. A line naming two people owes two answers, and the boundary does not open
until both have had their turn.

**A Brain knows where it is.** `grounding.js` supplies the `self` section: the
zone by its human name, the posture the world actually holds (standing, sitting,
walking), the current activity when there is one, a daypart, and the Floor's own
reason for asking. It replaces the raw tick at the head of the package - an
integer tick is arithmetic a Brain can only misread as a clock. Observer truth
and no omniscience; the near table rather than a chair number.

It worked on the sentence that produced the finding. The first run had 星さん
assert that 辰's sleeve was frayed - a visible condition nothing had given her.
The second run turned the same instinct into an offer grounded in her own sheet:
「袖のほつれでも何でもね、わたし縫いますから」.

**A memory says who it is about.** Episodes carry their subject through the same
observer-safe fallback as a transcript line - a learned label, else a current ref
and appearance, else the episode is dropped. Shown as nobody was the defect, so
it is not the fix.

**Two children know the neighbour who feeds them.** A cast-wide audit of every
`self.md` against `knows` found exactly two clear contradictions, both the same
one. `knows-audit.test.js` keeps it standing rather than a one-off reading: each
required edge carries the sentence that requires it, so rewriting the prose fails
the test instead of quietly making the table a lie. 渡辺's empty `knows` is
recorded as deliberate, and the kinship distinction - 辰 is not her grandson - is
held as data.

Thirteen mutations, all biting, including two that found real bugs: the boundary
opening while a second person named in the same breath was still owed an answer,
and an episode-rendering case that was passing vacuously because the observer was
alone and never asked again.

### What the first real Brain changed

`docs/notes/pre-3f-brain-findings.md` is the run; three of its findings are now
in the engine.

**A line is as long as the person.** 240 characters for the whole cast cut 星さん
mid-word on her first real turn — the world committed 「…脱いでお」 and told
nobody — and would never have bound on 渡辺 at all. The budget now comes from
`talkativeness`: 93 for 渡辺, 240 for 澄子, 408 for 星さん. 0.5 lands on 240,
which is what the flat number really was, the average person's budget applied to
everybody. It is stated in the Brain's own prefix and still enforced, because
LLM OUTPUT = PROPOSAL; an over-budget line is cut at the end of a sentence, and
the trim reaches audit rather than happening in silence.

**One breath may carry two acts.** A boy answered the woman at his table and
called the dog in one sentence, smuggled into a `reply`, and the dog was never
called because the engine saw one act. `speech_said.to` is now the list of everybody a
line is aimed at, so perception, the addressee ranking and the transcript all
read one shape whether one person was addressed or two.

The constraint that could not be relaxed is **volume**: an utterance has one
scope, so a quiet remark cannot be welded to a call across the room — either
choice changes who heard the other half. Two acts at the same person, two
questions in one breath (the floor holds one open question), and saying nothing
as half an act are refused too. Two *shouts* in one breath are fine, and reach
two rooms: 「澄子さん、牧師さん！」 is one thing said.

Three guards written alongside those did not survive their own mutations and
were removed rather than kept: a rule against a shout carrying a passenger (the
volume check already covers the mixed case, and two shouts are legitimate), a
duplicate-pick check (the same-person rule refuses anything with a target, and a
repeated remark to the room commits the same single utterance), and a pass over
the addressees inside `rearmedBy` (it cannot reach a room the speaker's zone and
the broadcast audience do not — the menu only offers a quiet act toward somebody
in the speaker's own zone).

**Waiting breaks a two-person lock.** An addressee ranks first and every
utterance restarts the round, so a pair answering each other never yields: the
run had 渡辺 sit through six rounds at the same table without being asked once.
Being asked and saying no is the design; never being asked is not silence, it is
absence. Rank is now class plus personality rather than class alone, and
`socialWeight` counts rounds spent in this conversation without once being
offered — scaled by the character's own eagerness, so 星さん cuts in after a few
exchanges, 澄子 after many, and 渡辺 not at all.

Two things that measurement said and intuition would not have. The step is a
**plateau, not a peak**: anywhere from 140 to 420 per round gives the same
flattened distribution, so only being inside the band matters. And **bigger is
worse**: by 840 the room is measurably less fair than with no waiting at all,
because the term scales with eagerness and so amplifies whoever was already
talking instead of rescuing whoever was not.

Mutation testing caught a bug inside that change. Clearing the waiting on
re-arm was not enough: with the fallback at round zero, a floor that had slept
through forty rounds woke treating everybody as having waited the maximum, and a
bonus that large makes a direct address ignorable. Waiting is counted from the
start of the current conversation, and the scenario that watches for it drives a
long exchange, lets the table sleep, walks somebody in, and asserts the person
spoken to in the new conversation is the one asked next.

One thing the run showed that is not a defect and is worth knowing: **the
addressee is usually offered the floor in the same tick the line is said**,
because `resolve` sets the floor open and `offer` runs immediately after it in
the same pass. Their package therefore carries the line in `conversation` but
not yet in `recentPerceivedEvents`. Memory is unaffected — it reads the queue
with a cursor on the following tick — and the test asserts against the
transcript for the first person named and against perception for the second.

### Tuning the constants

Every number in `floors.js` and `perception.js` had been chosen by argument.
`docs/specs/engine/phase-3e-tuning.md` replaces the argument with three
3,000-tick runs of the full cast, whose scripted brains take the floor with a
probability computed from each character's own `social` vector and aim their
lines at people rather than at the room.

What moved: `transcriptWindow` 12 → 8 (the bottom of the spec's own 8–12 band, a
third off the transcript), `queueLimit` 40 → 16 (median 2–3 events delivered per
offer, p95 13; forty only ever appeared as a four-minute backlog), `heldLimit`
16 → 8 (four was the most ever outstanding, one per open floor). `quietLimit`
stayed at 1 and the measurement is unusually clean: at 2 the world never falls
silent and a conversation becomes a 504-line smear; at 1 there are twenty-nine
conversations of about twenty lines with real quiet between them.

`visibleLimit` stayed at 8, and *why* it stayed is the part worth reading. The
sweep shows no behavioural difference between 4 and 8, which is exactly the kind
of absence this project does not accept as evidence: the scripted brains never
read the list, so the sweep measured cost and nothing else. A knob that changes
what a Brain *sees* cannot be tuned by a brain that does not look.

The run also found two bugs, which is the honest reason to do this at all. A
measured world came out 99% silent because `move_completed` was not social —
`agent_arrived` is only for entering the scene, so nobody walking over to a
sleeping table could wake it. And a sixty-line conversation spent twenty-nine
overheard nudges, because the nudge was spent when the offer was *built*, by
which point the floor had been woken for that very nudge and no longer looked
dormant.

## Memory (3D)

> **What does this character remember about what it has perceived?** — and only
> that. Whether two characters are now friends is a judgement, and it belongs to
> the Brain reading its own memory, not to a number the engine computed.

**`knows` is memory that existed before tick zero.** The seeded knowledge from 3B
is not a second mechanism consulted alongside this one; it is the first entry in
the store. That is what stops there being two answers to *does this character
know that one*. A seeded model has no first-met tick, because a grandmother has
always known the girl from the shop.

**The engine writes encounters; the Brain writes meaning.** Presence, proximity
and whether words passed are recorded deterministically every tick; prose and
learned labels arrive as proposals. So when a provider is down **recognition
keeps working and encounters keep counting** — only the interpretation is
missing. Same invariant as everywhere: the world does not stop being a world
when inference fails.

Stated so it cannot be drifted away from: **the engine writes exactly one kind
of episode, `first_meeting`. Everything else in the list was proposed by the
Brain.** It used to write one per heard utterance, because until 3E gave
conversation a transcript of its own there was nowhere else for a sentence to
live — and the result was that four lines of こんにちは / そうですね cost a sixth
of a character's permanent budget and preserved nothing. What it keeps instead
is structural and one line per person:

```
encounters    distinct meetings
spokenWith    how many of those meetings words passed in
lastSeenTick  while contact holds
```

`spokenWith` is a count and not a judgement — the engine may honestly say *we
have met four times and spoken on two of them*, and may not say what that
amounts to. It lives inside the open encounter, so it needs nothing from 3E, and
`buildContext` renders it as `timesSpoken` because a counter nothing can read is
write-only.

**A meeting opens on proximity, or on a directed utterance that landed. Nothing
else.** Two review passes narrowed this. The first version counted any heard
utterance as a conversation, which gave 星さん conversational history with the
pastor for sitting near him while he talked to 渡辺 — not an over-count but a
different relationship. The second kept overhearing as a *meeting*, and that was
wrong too: **you can hear somebody across a park all afternoon and never have met
them.** So an overheard voice now creates no person model at all, and the rule
sits on the perceived event rather than on anything semantic — `direct_address`
and `own_speech_directed` count, `speech_heard` and `sound_heard` do nothing.

Standing beside a conversation is still a meeting with the people in it, because
standing beside somebody is; that is the proximity rule doing its ordinary work,
not the words. And the code has one set rather than two, which is not a
coincidence to tidy away later: every speech-derived meeting is an exchange,
because the only speech that reaches this layer is speech that passed between the
two.

That needed a new perceived event, because perception was silent about your own
speech and so half of *we have spoken* was unobservable: the person spoken to
knew, and the person who spoke did not. Memory could not fill it in from the
other side — writing into another observer's store from one observer's
perception is exactly the cross-store contamination the phase exists to prevent —
so perception queues `own_speech_directed` to the speaker, and only when the
target is in `heardBy`. **An address nobody heard is not an exchange**, which is
the same audibility gate 3E puts in front of conversational handoff. A remark to
the room, with no `to`, counts for nobody. **The exactly-once cursor did not relax**: it is now what stops a
re-ingested utterance inflating `spokenWith` and dragging `lastSeenTick`
backwards.

**A label belongs to the observer.** What the brothers call the shopkeeper is
theirs; her name is hers. 3B made this structurally hard by an accident worth
keeping — `character.json` carries **no name field at all**, so a label can only
come from the observer's own `knows` or from something heard in the world.
Recognition is joined onto perception in `buildContext`, not inside perception,
because perception may not know who anyone is; the join runs server-side on the
entity behind a ref and the model still never sees an id.

**Asymmetry is free and stays free.** Memory is per observer, so the grandmother
calling her granddaughter 孫女 while the granddaughter calls her おばあちゃん
needs no mechanism, and nothing reconciles the two stores. Ever.

**Memory writes go to audit, never to facts.** It is private, so it is not a
world fact — and audit is already the stream for *why*. The renderer and replay
read facts only and never see it; the offline script pass may read audit, which
is how interiority can reach an audience without touching that rule.

**Length is a per-call cost.** `self.md` is a cached prefix at 0.1×; memory is
the dynamic suffix, re-sent uncached every request. So episodes are bounded and
evicted deterministically — and *deterministic is not the same as correct*:
dropping the oldest is also deterministic and would throw away the thing worth
keeping, so eviction ranks on value first and the test proves a first meeting
survives eighty pieces of ordinary chatter.

**Who has a memory at all is declared.** `minds` is required — inferring it from
`seeds` would leave 渡辺, who knows nobody yet, with no memory; inferring it from
the roster would hand the dog one. There are exactly three doors into the store
and exactly three checks on them (the deterministic tick, `note`, `learnLabel`),
plus a constructor that refuses to seed knowledge for something with no mind.
Deeper belt-and-braces guards were written and then taken out again: a redundant
guard cannot be shown to bite, so removing it is a mutation the suite passes, and
a gate no test can hold is a gate that rots.

`dog-01` gets no store. A deterministic actor's personality is its parameters,
and giving the dog an accumulating past would model a mind it does not have. And
*starting* empty proves nothing — the test spawns the dog in the middle of the
people it would most plausibly grow a past around, has it seen, spoken near and
spoken to for four hundred ticks, and asserts no person model, no episode and no
audit line. The gate is on the observer only: everybody else remembers the dog
perfectly well, which is what makes it a character rather than scenery.

**An encounter is a meeting, not a sample.** Two people who spend the afternoon
at one table met once, so an encounter opens when contact begins, stays open
however long it continues, and closes only after they have been apart for
`separationTicks`. Continuous proximity counts 1; leaving, staying away and
coming back counts 2; stepping away for ten ticks still counts 1. A Brain writing
a note about someone creates the person model and counts **no** meeting —
otherwise encounter timing would depend on which tick the scheduler fired on, and
a character could meet somebody across the park by thinking about them.

**A perceived event is consumed without being taken.** Perception's queue has two
readers with different rights: delivery to a Brain drains it, memory may never.
So memory carries a per-observer cursor over the monotonic `seq` perception
stamps on every queued event. A position in the array cannot work, because the
array is being emptied by somebody else — and the old count-based version
re-ingested the same sentence on every tick until delivery happened to drain it,
which also dragged `lastSeenTick` backwards and made encounters climb by one a
tick. A sentence is now ingested on the tick it is heard and is still waiting in
the queue for a wakeup three hundred ticks later.

### What the tests prove

Every item in `phase-3d-memory.md` §11, now seventeen items rather than eleven.
Twenty mutations confirm they bite. The first five: routing memory writes to
the fact stream, accepting an uncanonicalized ref into storage, giving seeded
knowledge a first-met tick, evicting by age rather than by value, and borrowing a
label from another character's store — that last one fails with *"the pastor
recognised 3 people: 辰ちゃん, 孫女, 星さん"*, which is precisely the leak the
phase exists to prevent.

Eight came out of the review that found the four integration bugs above:

| mutation | fails with |
|---|---|
| drop step 7 from the loop | *two hundred ticks side by side produced no memory* |
| let the loop take memory with no perception | *a loop accepted memory with no perception* |
| never advance the ingestion cursor | *one utterance was remembered 24 times* |
| restore the original `touch()` in full | *an utterance in the queue inflated encounters to 140* |
| remove the mind gate from the tick | *the dog acquired 2 person models · 18 memory writes were made for the dog* |
| never close an encounter | *leaving and coming back counted 1* |
| let a Brain note count as a meeting | *thinking about someone across the park counted 1 meetings* |
| make reading the queue drain it | *memory ate the utterance before the Brain saw it* |

Three further mutations were written and **caught nothing**, and are recorded
because a mutation that passes is not evidence:

- one added a fallback that never fired — nobody's `knows` contains themselves;
- two removed belt-and-braces mind gates that a third gate already covered. Both
  were genuine no-ops, which is the argument for having removed the redundant
  gates rather than the argument for keeping them.

Seven more came from the two reviews that narrowed what a meeting is, and all
seven bite — including overhearing opening one (*overhearing a voice across the
park counted as having met the speaker*):
counting `speech_heard` as an exchange (*overhearing one man address another
counted 1 conversations*), never recording the speaker's own side (*addressing
somebody counted 0*), counting an address nobody heard, counting nothing at all,
counting only one direction, and dropping `speech_heard` from contact
(*hearing a voice 55 units away was not contact at all*).

The distance mattered and the test had to be moved to find it. The bystander
originally stood inside `nearRange`, so proximity opened the encounter and the
speech rule was doing no work either way. Moved to 55 units — outside the near
sweep, inside hearing — it first proved the wrong thing, and then proved the
right one.

Seven more came from 3E-0, the step that removed the per-utterance episode:

| mutation | fails with |
|---|---|
| write an episode per utterance again | *the engine wrote 1 episodes it may not: direct_address* |
| `spokenWith` counts sentences, not meetings | *a second sentence in one meeting counted 1/2* |
| never count `spokenWith` | *hearing someone speak counted 0* |
| a new meeting inherits the last one's `spoke` flag | *a second meeting with words counted 4/1* |
| proximity counts as words | *a silent meeting counted 1 as spoken-with* |
| the cursor never advances | *a third silent meeting counted 63/62* |
| `buildContext` hides `spokenWith` | *spokenWith never reaches the Brain, which makes it write-only* |

The fourth of those needed the test extended before it bit, and the reason is the
recurring one: `spoke` was being reset in two places, so removing either left the
other working. One reset now, when an encounter opens, in the place a mutation
can reach.

The encounter mutation is worth one more line, because it corrected the review's
own reading. Restoring the gap heuristic **alone** changes nothing: while contact
is sampled every tick, "last seen more than a cooldown ago" and an explicit open
encounter are the same predicate. The inflation was never the cooldown — it was
the un-advancing cursor feeding the same stale event tick back in, dragging
`lastSeenTick` backwards so the next tick looked like a fresh meeting after a
long gap. Bugs 2 and 4 were one bug wearing two faces, and only the combined
mutation shows it.

**Nothing outside the slice is here.** See §17.1 of
`docs/specs/engine/world-engine-2.5.md` for why that list is a fence rather than
a to-do. 3C added perception, 3D memory, 3E conversation — and there is still no
scheduler, no provider adapter (not even a mock one), no ray casting, no
model-generated prose, and no engine-computed affinity between characters.

**What 3E leaves for 3F.** The floor store produces offers and reads answers;
who is allowed to be in flight at once, what a provider costs, when to give up
and when to retry are the scheduler's, and nothing here awaits anything. The
café's own acts — ordering, preparation, the counter queue — are 3F-A, and they
will reuse the same menu-and-commit path rather than adding a second one.

## Five things worth knowing before reading the code

**Seats and stations are one thing.** To a reservation they differ in nothing, so
the events say `resource_reserved`, not `seat_reserved`, and carry `kind`. What
an agent does once it holds one is the Activity Runtime's business.

**Cold start is an invariant of `spawn`, not a courtesy of the caller.** An agent
is never observable without an activity.

**A step spends the tick it finishes in.** A five-step activity takes at least
five ticks even when nothing waits, and `restTicks` is the waiting part only.

**"Atomic" reservation means one thing here:** only the World Engine touches
`resource.state`, and it reads and writes without yielding. Two agents cannot
both find the same seat free. That is the whole mechanism, and it holds exactly
as long as the rule does.

**A failed step releases what it holds.** An activity that dies holding a
reservation is how a world runs out of seats an hour into a demonstration.

## Not being here today

This one came from the cast rather than from the engine. Two characters are
defined by turning up only every so often — the old hand from the main shop
looks in every few visits, the retired stationmaster comes every few days
because the place is lively — and the world had no way to say so. An agent
existed or it did not, and there was no day for it to be absent from.

**The roster is who belongs here; presence is who turned up.** Keeping them
apart is the point: an agent who is not here has not stopped existing, it is
somewhere the scene does not show. `world.roster(id, {at, every})` declares the
habit, `beginDay()` settles who is in, and `agent_arrived` / `agent_departed`
carry it to the renderer. `presentIds()` is what the runtime and the movement
step iterate; `agentIds()` still returns everyone.

**A day is integer division and nothing else.** `ticksPerDay` on the clock,
`day = floor(tick / ticksPerDay)`. There are no dates, months or weekdays —
those would be decisions about the world, not about time. `ticksPerDay: 0`
means the world has no days at all, which is what phase 3A was and still is.

**Attendance is a habit, not dice.** Present when the day lands on the agent's
own phase, rather than a per-day coin flip. A coin clusters: a character meant
to appear "every few days" would vanish for a fortnight and then turn up four
days running. And a retired man dropping in every few days is keeping a habit,
so the periodic model is the more truthful one as well as the better behaved.

**Attendance does not draw from the world's rng, and that is the load-bearing
decision.** `createRng` gives a *stream*, and a stream's values depend on how
many times anyone else has drawn from it — so deciding attendance that way
would make adding one character silently reshuffle everybody else's schedule.
`attendance.js` hashes `(seed, agentId)` instead: the same agent on the same day
of the same seed always gets the same answer, whatever else the run contains.
Determinism across a whole run is what the rng is for; this needs stability
under change, which is a different property.

`days.test.js` runs the same world twice, the second time with one extra agent
rostered, and asserts nobody else's days moved. Swapping the hash for
`rng.next()` fails it exactly as predicted:

```
c-every-6 changed schedule when another agent was added: 1 -> 4
```

**Going home gives the seat back.** Everyone in the test sits for longer than a
day lasts, so the boundary always catches somebody mid-rest. The test states it
as an invariant over every frame rather than as a pairing of events — nothing
may ever be held by someone the renderer is not drawing — and deleting the
release in `depart` fails it:

```
t=240: table-near-1 held by c-every-6, who is not in the scene
```

## Walking

`reserve` comes before `approach` on purpose. Walking across a park and only then
discovering someone took the seat is how agents spend an afternoon achieving
nothing; claiming first makes a refusal cost one tick.

The path is solved once, when the move starts, and written into the
`move_started` fact. Replay follows the recorded path and never opens `nav.js`.

**Smoothing is cost-aware, and has to be.** A* charges backstage cells the
multiplier the world spec gives them and routes around them. String pulling then
asks "could I just walk straight from here to there instead" — and if it asks
only about walkability, the answer is yes, straight back through the cells A*
just paid to avoid. The path comes out looking smoother with the weighting
silently discarded. A shortcut is taken only when it is both clear and no more
expensive than the route A* actually chose, compared against the accumulated
cost A* already computed. `nav.test.js` fails on the walkability-only version
and passes on this one.

Speed is a flat 4 world units per tick — about 1.2 m/s where the bench is, which
is a walk. Flat in world units rather than in metres: making it flat in metres
means scaling by the height ramp, which is a refinement rather than a
correctness problem.

`navgrid.json` exists because the engine has no image decoder. The painted maps
are packed one bit per cell, base64, about 75 KB for both layers — small enough
to ship to the browser with the page.

## What the run proves

```
t=  2  brother-01 reserves bench-slot-2   brother-02 is refused, falls to idle
t=  3  brother-01 starts walking, 8 waypoints, arriving t=80
t= 81  sits
t=123  releases
t=150  brother-02 asks again, and gets it
t=248  releases
t=280  world_ended
```

Checked automatically:

- the seat is never occupied twice without a release between;
- the agent refused at t=2 does get it later;
- somebody actually walked;
- **live and replay produce an identical frame every tick** — the live view is
  fed facts as they are emitted, the replay view is fed the same facts read back
  from `docs/runs/3a-bench.json`, and both run the same `view.js`. The Activity
  Runtime does not run during replay at all;
- the same seed produces an identical fact stream. Weak while nothing draws from
  the rng, and in place so it fails the day something does.

The refusal is in the audit stream, not the fact stream: nothing changed, so
there is no fact. The fact stream says the same thing in the only way a renderer
can read — one occupation at a time.

`world_ended` bounds the recording, so a replay runs to the end of the world
rather than to the last thing that happened to occur.
