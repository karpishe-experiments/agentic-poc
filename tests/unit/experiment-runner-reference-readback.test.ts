import { describe, expect, it } from "vitest";
import { verifyReferenceReadback } from "@/lib/experiment-runner/reference-readback";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const file = (n: number) => ({ type: "image", transfer_method: "local_file", id: id(99),
  reference: `dify-file-ref:${Buffer.from(JSON.stringify({ record_id: id(n) })).toString("base64url")}` });
describe("pinned Dify reference read-back", () => {
  it("compares uploaded record identities in order, not graph identities", () => {
    expect(verifyReferenceReadback([file(1), file(2)], [id(1), id(2)])).toBe(true);
    expect(verifyReferenceReadback([file(2), file(1)], [id(1), id(2)])).toBe(false);
    expect(verifyReferenceReadback([file(1)], [id(1), id(2)])).toBe(false);
    expect(verifyReferenceReadback([file(1), file(1)], [id(1), id(2)])).toBe(false);
    expect(verifyReferenceReadback([], [])).toBe(true);
    expect(verifyReferenceReadback(undefined, [])).toBe(false);
  });
  it("refuses legacy ids, malformed references and remote-file substitutions", () => {
    for (const reference of [id(1), "dify-file-ref:!", "dify-file-ref:e30="]) {
      expect(verifyReferenceReadback([{ ...file(1), reference }], [id(1)])).toBe(false);
    }
    expect(verifyReferenceReadback([{ ...file(1), transfer_method: "remote_url" }], [id(1)])).toBe(false);
  });
});
