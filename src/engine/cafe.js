/**
 * The cafe as routine commerce.
 *
 * Implements docs/specs/engine/phase-3f.md §6 and §7 with
 * phase-3c-venue-interactions.md and cafe-menu-1960.md. The boundary that
 * decides every question in this file:
 *
 *   ROUTINE COMMERCE IS ENGINE-OWNED; SOCIALLY MEANINGFUL JUDGEMENT IS
 *   BRAIN-OWNED.
 *
 * So the runtime never reads prose to work out what somebody ordered. A Brain
 * picks `order:<id>` out of choices this file authored; anything else it says to
 * the shopkeeper is speech, and speech wakes her through the ordinary
 * direct-address rule. That IS the semantic router: one branch executes, the
 * other is a person talking, and there is no classifier in between to be wrong.
 *
 * The second real Brain run invented 「ここのカレー」 because a person sitting in
 * a cafe knows roughly what the cafe sells and no menu ever reached the Brain.
 * The fix is knowledge, not a prohibition: the menu is in the session bootstrap
 * and the legal orders are in the turn's choices, so an invented item has
 * nowhere to enter.
 */

export const DEFAULTS = {
  // Etiquette, not a game mechanic (venue-interactions §1). Long enough that it
  // never fires on somebody passing through.
  graceTicks: 400,
  refreshTicks: 1800,
  // She is one person. Work that can overlap does overlap - a sweet is shaped
  // while the tea steeps - so capacity is the number of things in hand, and the
  // order's duration is its critical path rather than the sum (menu §2).
  capacity: 2,
  handlingTicks: 20,        // taking the order, plating, setting it down
  serveTicks: 40,           // carrying it over
  // Who is exempt. The two boys and the dog are not customers.
  exempt: ['brother-01', 'brother-02', 'dog-01']
};

/** Zones where sitting down makes somebody a customer. */
const CAFE_ZONES = new Set(['cafe-counter', 'near-table', 'far-table']);

export function createCafe(world, zones, { menu, attendant, config = {} } = {}) {
  if (!menu) throw new Error('createCafe needs the menu it is allowed to sell');
  if (!attendant) throw new Error('createCafe needs to know who is behind the counter');
  const cfg = { ...DEFAULTS, ...config };
  const exempt = new Set(cfg.exempt);

  const byId = new Map(menu.items.map((i) => [i.id, i]));
  const available = () => menu.items.filter((i) => i.available !== false);

  // customerId -> { since, state, orderedAt }
  const visits = new Map();
  // orderId -> { id, customer, item, placedAt, startedAt, readyAt, servedAt, step }
  const orders = new Map();
  let nextOrder = 0;

  const zoneOf = (id) => {
    const at = world.agents.get(id)?.at;
    return at ? zones.at(at[0], at[1]) : null;
  };
  const inCafe = (id) => CAFE_ZONES.has(zoneOf(id));

  /** Orders she currently has in hand. One person, bounded work. */
  const inHand = () => [...orders.values()].filter((o) => o.startedAt !== null && !o.servedAt);
  /** No room to start anything else. */
  const atCapacity = () => inHand().length >= cfg.capacity;
  /**
   * Doing anything at all. A different question from capacity, and the one the
   * obligation asks: pressing a second customer to order while she is already
   * making something is the world nagging on a timer, so her having work in hand
   * - or an order waiting to be started - stretches everybody's grace.
   */
  const working = () => [...orders.values()].some((o) => !o.servedAt);

  function visit(id) {
    let v = visits.get(id);
    if (!v) { v = { since: world.tick, state: 'settling', orderedAt: null }; visits.set(id, v); }
    return v;
  }

  return {
    config: cfg,
    menu,
    attendant,

    /** What this run is selling, for the Brain session bootstrap (§6). */
    catalogue() {
      return available().map((i) => ({ id: i.id, name: i.name, price: i.price }));
    },

    item: (id) => byId.get(id) ?? null,
    inCafe,

    /**
     * The legal orders for this character right now, as engine-authored choices.
     * Gated on a fact rather than a rule: you may order if you are in the cafe
     * and she can hear you at ordinary speaking volume. From the far table she
     * cannot, which is why that table has to call across or come closer - the
     * room's geometry decides, not a permission list.
     */
    ordersFor(entityId) {
      if (entityId === attendant || !inCafe(entityId)) return [];
      if (!world.present(attendant)) return [];
      if (!world.hearing.canHear(attendant, entityId, 'normal')) return [];
      return available().map((i) => `order:${i.id}`);
    },

    /**
     * Place one. The router's deterministic branch: the item is known and
     * available, so no Brain is asked to approve it (§7, venue §4.1).
     * Returns `{ refused }` rather than guessing at a near miss (§4.3).
     */
    order(customerId, itemId) {
      const item = byId.get(itemId);
      if (!item || item.available === false) {
        world.log.note(world.tick, 'venue_routed', {
          customer: customerId, action: 'order', item: itemId,
          route: 'refused', reason: 'not on the menu today'
        });
        return { refused: 'not on the menu today' };
      }
      if (!this.ordersFor(customerId).includes(`order:${itemId}`)) {
        world.log.note(world.tick, 'venue_routed', {
          customer: customerId, action: 'order', item: itemId,
          route: 'refused', reason: 'not somewhere an order can be placed'
        });
        return { refused: 'not somewhere an order can be placed' };
      }
      const id = `order-${nextOrder += 1}`;
      orders.set(id, {
        id, customer: customerId, item: item.id, placedAt: world.tick,
        startedAt: null, readyAt: null, servedAt: null, step: 0
      });
      const v = visit(customerId);
      v.state = 'ordered';
      v.orderedAt = world.tick;
      world.log.note(world.tick, 'venue_routed', {
        customer: customerId, action: 'order', item: item.id, route: 'deterministic'
      });
      world.log.fact(world.tick, 'order_placed', {
        order: id, customer: customerId, item: item.id, name: item.name, price: item.price
      });
      return { order: id, item: item.id };
    },

    /**
     * Everything else a customer says to her. Not executed, not parsed: recorded
     * as having gone the other way, because the speech has already woken her
     * through the direct-address rule and she is the one who answers it.
     */
    routeSocial(customerId, topic) {
      world.log.note(world.tick, 'venue_routed', {
        customer: customerId, action: topic, route: 'brain'
      });
    },

    /** What the character is carrying socially: the obligation, in words. */
    obligationFor(entityId) {
      const v = visits.get(entityId);
      if (!v) return null;
      if (v.state === 'order_due') return '你在這裡坐了一陣子了。要待下去的話，該點些什麼，不然就該走了。';
      if (v.state === 'refresh_due') return '杯子早就空了。再點一份，或者也差不多該走了。';
      return null;
    },

    /** Debug/inspection only; never model-visible. */
    visitOf: (id) => visits.get(id) ?? null,
    orderOf: (id) => orders.get(id) ?? null,
    orders: () => [...orders.values()],

    /**
     * One tick of routine service. Runs with the other deterministic activity,
     * before perception, so what she did this tick is visible this tick.
     */
    tick() {
      // --- who is a customer, and for how long ------------------------------
      for (const id of world.presentIds()) {
        if (exempt.has(id) || id === attendant) continue;
        if (!inCafe(id)) { visits.delete(id); continue; }
        const v = visit(id);
        // She is one person: while her hands are full, nobody's grace runs out.
        // Workload shaping, not scripted behaviour (venue §7).
        if (working()) { v.since += 1; continue; }
        if (v.state === 'settling' && world.tick - v.since >= cfg.graceTicks) {
          v.state = 'order_due';
          world.log.fact(world.tick, 'venue_obligation', { customer: id, state: 'order_due' });
        } else if (v.state === 'served' && world.tick - v.orderedAt >= cfg.refreshTicks) {
          v.state = 'refresh_due';
          world.log.fact(world.tick, 'venue_obligation', { customer: id, state: 'refresh_due' });
        }
      }

      // --- start what she has room for, oldest first ------------------------
      for (const o of [...orders.values()].sort((a, b) => a.placedAt - b.placedAt)) {
        if (o.startedAt !== null || atCapacity()) continue;
        const item = byId.get(o.item);
        o.startedAt = world.tick;
        o.readyAt = world.tick + cfg.handlingTicks + item.prepTicks;
        world.log.fact(world.tick, 'preparation_started', {
          order: o.id, item: o.item, name: item.name,
          kind: item.category, until: o.readyAt
        });
      }

      // --- deterministic work, including the shaping steps ------------------
      for (const o of orders.values()) {
        if (o.startedAt === null || o.servedAt) continue;
        const item = byId.get(o.item);
        // Nerikiri is finished to order, by hand, in visible steps. It is not a
        // sweet taken off a shelf, and collapsing it back into one 30-tick
        // action is the thing cafe-menu-1960.md §3 forbids.
        if (item.steps) {
          const per = Math.max(1, Math.floor(item.prepTicks / item.steps.length));
          const done = Math.min(item.steps.length,
            Math.floor((world.tick - o.startedAt - cfg.handlingTicks) / per) + 1);
          while (o.step < done && o.step < item.steps.length) {
            world.log.fact(world.tick, 'preparation_step', {
              order: o.id, item: o.item, step: item.steps[o.step], index: o.step
            });
            o.step += 1;
          }
        }
        if (world.tick >= o.readyAt && !o.ready) {
          o.ready = true;
          world.log.fact(world.tick, 'order_ready', { order: o.id, item: o.item, name: item.name });
        }
        // She carries it over herself. The engine chooses the path exactly as it
        // does for any other activity; the shopkeeper Brain is never asked
        // whether a finished cup should be taken to the person who ordered it.
        if (o.ready && world.tick >= o.readyAt + cfg.serveTicks) {
          o.servedAt = world.tick;
          world.log.fact(world.tick, 'order_served', {
            order: o.id, customer: o.customer, item: o.item, name: item.name
          });
          const v = visits.get(o.customer);
          if (v) { v.state = 'served'; v.orderedAt = world.tick; }
          world.log.fact(world.tick, 'venue_obligation', {
            customer: o.customer, state: 'satisfied'
          });
        }
      }

      // --- clearing up ------------------------------------------------------
      for (const [id, o] of [...orders]) {
        if (o.servedAt && world.tick >= o.servedAt + cfg.handlingTicks
            && !world.present(o.customer)) {
          orders.delete(id);
          world.log.fact(world.tick, 'order_cleared', { order: id, item: o.item });
        }
      }
    }
  };
}
