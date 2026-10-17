import { describe, expect, it } from "vitest";
import { formatOfferNumber, italianOfferYear, nextOfferNumberPreview, withOfferNumberInJson } from "./commercial-offer-number";

describe("commercial offer numbering", () => {
  it("formats the DDC progressive and uses the Italian calendar year", () => {
    expect(formatOfferNumber(42, 2026)).toBe("DDC42/2026");
    expect(nextOfferNumberPreview(41, new Date("2026-10-17T10:00:00.000Z"))).toBe("DDC42/2026");
    // At this instant it is already New Year's Day in Italy.
    expect(italianOfferYear(new Date("2026-12-31T23:30:00.000Z"))).toBe(2027);
    expect(() => formatOfferNumber(0, 2026)).toThrow();
  });

  it("updates the JSON snapshot without discarding other saved fields", () => {
    const json = withOfferNumberInJson(JSON.stringify({ nome: "preview", note: "Interna", righe: [] }), "DDC42/2026");
    expect(JSON.parse(String(json))).toEqual({ nome: "DDC42/2026", note: "Interna", righe: [] });
    expect(withOfferNumberInJson(undefined, "DDC1/2026")).toBeUndefined();
    expect(withOfferNumberInJson("not-json", "DDC1/2026")).toBe("not-json");
  });
});
