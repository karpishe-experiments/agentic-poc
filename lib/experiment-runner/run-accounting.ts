// A run-level estimate from retained operation reservations. An unsettled
// reservation stays a liability even when its operation failed.
export type RunReservation = { role?: string; reservationCount?: number;
  m4Reservation?: { unsettledMicrodollars: number; settledMicrodollars: number | null } | null;
  realImageReservation?: { unsettledMicrodollars: number; settledMicrodollars: number | null } | null };

export function runAccounting(mode: string, operations: RunReservation[], payableText = 0, payableImage = 0) {
  if (mode === "simulated") return { settledMicrodollars: 0, reservedMicrodollars: 0, estimatedTotalMicrodollars: 0, invoiceCostAvailable: false as const };
  if (!["balanced", "real"].includes(mode) || !Number.isSafeInteger(payableText) || payableText < 0 ||
      !Number.isSafeInteger(payableImage) || payableImage < 0) return null;
  let settledMicrodollars = 0;
  let reservedMicrodollars = 0;
  let reservations = 0;
  let imageReservations = 0;
  for (const operation of operations) {
    const image = operation.role === "image";
    if (operation.realImageReservation && (mode !== "real" || !image || operation.m4Reservation) ||
        image && operation.m4Reservation) return null;
    const reservation = image ? operation.realImageReservation : operation.m4Reservation;
    if (!reservation) {
      if ((!image || mode === "real") && (operation.reservationCount ?? 0) > 0) return null;
      continue;
    }
    if (!Number.isSafeInteger(reservation.unsettledMicrodollars) || reservation.unsettledMicrodollars < 0 ||
        reservation.settledMicrodollars !== null && (!Number.isSafeInteger(reservation.settledMicrodollars) || reservation.settledMicrodollars < 0)) return null;
    if (image) imageReservations += 1;
    else reservations += 1;
    settledMicrodollars += reservation.settledMicrodollars ?? 0;
    reservedMicrodollars += reservation.unsettledMicrodollars;
  }
  if (reservations < payableText || mode === "real" && imageReservations < payableImage ||
      !Number.isSafeInteger(settledMicrodollars) || !Number.isSafeInteger(reservedMicrodollars) ||
      !Number.isSafeInteger(settledMicrodollars + reservedMicrodollars)) return null;
  return { settledMicrodollars, reservedMicrodollars,
    estimatedTotalMicrodollars: settledMicrodollars + reservedMicrodollars, invoiceCostAvailable: false as const };
}
