import { describe, expect, it } from "vitest";
import { runAccounting } from "@/lib/experiment-runner/run-accounting";

describe("run cost projection", () => {
  it("keeps settled and failed reservations in one run estimate", () => {
    expect(runAccounting("balanced", [
      { role: "specialist", reservationCount: 1, m4Reservation: { settledMicrodollars: 120, unsettledMicrodollars: 0 } },
      { role: "tester", reservationCount: 1, m4Reservation: { settledMicrodollars: null, unsettledMicrodollars: 500 } },
    ], 1)).toEqual({ settledMicrodollars: 120, reservedMicrodollars: 500,
      estimatedTotalMicrodollars: 620, invoiceCostAvailable: false });
  });

  it("shows no paid cost for simulated execution", () => {
    expect(runAccounting("simulated", [{ role: "specialist", reservationCount: 1 }], 0)?.estimatedTotalMicrodollars).toBe(0);
  });

  it("includes Real image charges and unresolved holds without replacing run totals with campaign totals", () => {
    expect(runAccounting("real", [
      { role: "specialist", reservationCount: 1, m4Reservation: { settledMicrodollars: 120, unsettledMicrodollars: 10 } },
      { role: "image", reservationCount: 1, realImageReservation: { settledMicrodollars: 900, unsettledMicrodollars: 0 } },
      { role: "image", reservationCount: 1, realImageReservation: { settledMicrodollars: null, unsettledMicrodollars: 2000 } },
    ], 1, 2)).toEqual({ settledMicrodollars: 1020, reservedMicrodollars: 2010,
      estimatedTotalMicrodollars: 3030, invoiceCostAvailable: false });
  });

  it("withholds Real totals when an image reservation is missing or assigned to the wrong operation", () => {
    expect(runAccounting("real", [], 0, 1)).toBeNull();
    expect(runAccounting("real", [{ role: "image", reservationCount: 1 }], 0, 1)).toBeNull();
    const realImageReservation = { settledMicrodollars: null, unsettledMicrodollars: 100 };
    expect(runAccounting("real", [{ role: "specialist", reservationCount: 1, realImageReservation }])).toBeNull();
    expect(runAccounting("balanced", [{ role: "image", reservationCount: 1, realImageReservation }])).toBeNull();
    expect(runAccounting("real", [{ role: "image", reservationCount: 1, realImageReservation,
      m4Reservation: realImageReservation }], 0, 1)).toBeNull();
    expect(runAccounting("real", [{ role: "image", reservationCount: 1,
      realImageReservation: { settledMicrodollars: 100, unsettledMicrodollars: -1 } }], 0, 1)).toBeNull();
  });

  it("withholds an estimate when paid evidence is missing or invalid", () => {
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1 }], 1)).toBeNull();
    expect(runAccounting("balanced", [], 1)).toBeNull();
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1,
      m4Reservation: { settledMicrodollars: -1, unsettledMicrodollars: 2 } }], 1)).toBeNull();
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1,
      m4Reservation: { settledMicrodollars: Number.MAX_SAFE_INTEGER, unsettledMicrodollars: 1 } }], 1)).toBeNull();
  });
});
