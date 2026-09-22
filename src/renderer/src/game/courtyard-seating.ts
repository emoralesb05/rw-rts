export type SeatRequest = { id: string; previous?: number; preferred: number };

/** Reserve existing seats first, then fill vacancies without displacing peers. */
export function assignCourtyardSeats(requests: readonly SeatRequest[]) {
  const seats = new Map<string, number>();
  const occupied = new Set<number>();
  for (const request of requests) {
    const seat = request.previous;
    if (
      seat !== undefined &&
      Number.isInteger(seat) &&
      seat >= 0 &&
      !occupied.has(seat)
    ) {
      seats.set(request.id, seat);
      occupied.add(seat);
    }
  }
  for (const request of requests) {
    if (seats.has(request.id)) continue;
    let seat = Number.isFinite(request.preferred)
      ? Math.max(0, Math.floor(request.preferred))
      : 0;
    if (occupied.has(seat)) {
      seat = 0;
      while (occupied.has(seat)) seat++;
    }
    seats.set(request.id, seat);
    occupied.add(seat);
  }
  return seats;
}
