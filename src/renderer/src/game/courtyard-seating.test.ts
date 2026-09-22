import { expect, it } from "vitest";
import { assignCourtyardSeats } from "./courtyard-seating";
import { courtyardSlot } from "./realm-landmarks";

it("allocates unique destinations even when thirty agents prefer six seats", () => {
  const seats = assignCourtyardSeats(
    Array.from({ length: 30 }, (_, i) => ({ id: String(i), preferred: i % 6 }))
  );
  expect(new Set(seats.values()).size).toBe(30);
  const positions = [...seats.values()].map((seat) => courtyardSlot(seat));
  expect(new Set(positions.map((p) => `${p.x}:${p.y}`)).size).toBe(30);
});

it("does not reshuffle seated agents when activity priority changes or a peer arrives", () => {
  const initial = assignCourtyardSeats([
    { id: "a", preferred: 0 },
    { id: "b", preferred: 0 },
  ]);
  const next = assignCourtyardSeats([
    { id: "new", preferred: 0 },
    { id: "b", preferred: 0, previous: initial.get("b") },
    { id: "a", preferred: 1, previous: initial.get("a") },
  ]);
  expect(next.get("a")).toBe(initial.get("a"));
  expect(next.get("b")).toBe(initial.get("b"));
  expect(next.get("new")).toBe(2);
});

it("reuses vacated seats and recovers duplicate or invalid claims", () => {
  expect([
    ...assignCourtyardSeats([
      { id: "a", preferred: 0, previous: 1 },
      { id: "b", preferred: 0, previous: 1 },
      { id: "c", preferred: NaN, previous: -1 },
    ]).values(),
  ]).toEqual([1, 0, 2]);
});
