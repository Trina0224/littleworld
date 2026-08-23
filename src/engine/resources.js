/**
 * Claimable things: seats, and the counter station.
 *
 * They are one kind of thing to the World Engine - something exactly one agent
 * may hold at a time - so the events say `resource`, not `seat`. A seat and a
 * station differ only in what an agent does once it has one, and that is the
 * Activity Runtime's business, not the reservation's.
 */
export const AVAILABLE = 'available';
export const RESERVED = 'reserved';
export const OCCUPIED = 'occupied';

export const SEAT = 'seat';
export const STATION = 'station';
