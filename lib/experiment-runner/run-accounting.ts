// A run-level estimate from retained operation reservations. An unsettled
// reservation stays a liability even when its operation failed.
export type RunReservation = { role?: string; reservationCount?: number;
  m4Reservation?: { unsettledMicrodollars: number; settledMicrodollars: number | null } | null };

export function runAccounting(mode: string, operations: RunReservation[], payableText = 0) {
  if (mode === "simulated") return { settledMicrodollars: 0, reservedMicrodollars: 0, estimatedTotalMicrodollars: 0, invoiceCostAvailable: false as const };
  if (mode !== "balanced" || !Number.isSafeInteger(payableText) || payableText < 0) return null;
  let settledMicrodollars = 0;
  let reservedMicrodollars = 0;
  let reservations = 0;
  for (const operation of operations) {
    const reservation = operation.m4Reservation;
    if (!reservation) {
      if (operation.role !== "image" && (operation.reservationCount ?? 0) > 0) return null;
      continue;
    }
    if (!Number.isSafeInteger(reservation.unsettledMicrodollars) || reservation.unsettledMicrodollars < 0 ||
        reservation.settledMicrodollars !== null && (!Number.isSafeInteger(reservation.settledMicrodollars) || reservation.settledMicrodollars < 0)) return null;
    reservations += 1;
    settledMicrodollars += reservation.settledMicrodollars ?? 0;
    reservedMicrodollars += reservation.unsettledMicrodollars;
  }
  if (reservations < payableText || !Number.isSafeInteger(settledMicrodollars) || !Number.isSafeInteger(reservedMicrodollars) ||
      !Number.isSafeInteger(settledMicrodollars + reservedMicrodollars)) return null;
  return { settledMicrodollars, reservedMicrodollars,
    estimatedTotalMicrodollars: settledMicrodollars + reservedMicrodollars, invoiceCostAvailable: false as const };
}
