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

  it("withholds an estimate when paid evidence is missing or invalid", () => {
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1 }], 1)).toBeNull();
    expect(runAccounting("balanced", [], 1)).toBeNull();
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1,
      m4Reservation: { settledMicrodollars: -1, unsettledMicrodollars: 2 } }], 1)).toBeNull();
    expect(runAccounting("balanced", [{ role: "specialist", reservationCount: 1,
      m4Reservation: { settledMicrodollars: Number.MAX_SAFE_INTEGER, unsettledMicrodollars: 1 } }], 1)).toBeNull();
  });
});
