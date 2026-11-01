import { describe, expect, it } from "vitest";
import { formatOfferNumber, italianOfferYear, nextOfferNumberPreview, withOfferNumberInJson } from "./commercial-offer-number";

describe("commercial offer numbering", () => {
  it("formats the DDC progressive and uses the Italian calendar year", () => {
    expect(formatOfferNumber(42)).toBe("DDC0042");
    expect(nextOfferNumberPreview(41)).toBe("DDC0042");
    // At this instant it is already New Year's Day in Italy.
    expect(italianOfferYear(new Date("2026-12-31T23:30:00.000Z"))).toBe(2027);
    expect(() => formatOfferNumber(0)).toThrow();
    expect(formatOfferNumber(1)).toBe("DDC0001");
    expect(formatOfferNumber(9999)).toBe("DDC9999");
    expect(() => formatOfferNumber(10000)).toThrow();
  });

  it("updates the JSON snapshot without discarding other saved fields", () => {
    const json = withOfferNumberInJson(JSON.stringify({ nome: "preview", note: "Interna", righe: [] }), "DDC0042");
    expect(JSON.parse(String(json))).toEqual({ nome: "DDC0042", note: "Interna", righe: [] });
    expect(withOfferNumberInJson(undefined, "DDC1/2026")).toBeUndefined();
    expect(withOfferNumberInJson("not-json", "DDC1/2026")).toBe("not-json");
  });
});
