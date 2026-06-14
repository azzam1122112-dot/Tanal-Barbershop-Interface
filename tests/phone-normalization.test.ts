import { describe, expect, it } from "vitest";
import { normalizeSaudiPhone } from "../lib/phone/saudi-phone";

describe("Saudi phone normalization", () => {
  it("normalizes 05xxxxxxxx to 9665xxxxxxxx", () => {
    expect(normalizeSaudiPhone("0501234567")).toBe("966501234567");
  });

  it("normalizes +9665xxxxxxxx to 9665xxxxxxxx", () => {
    expect(normalizeSaudiPhone("+966501234567")).toBe("966501234567");
  });

  it("normalizes 5xxxxxxxx to 9665xxxxxxxx", () => {
    expect(normalizeSaudiPhone("501234567")).toBe("966501234567");
  });

  it("rejects invalid numbers", () => {
    expect(() => normalizeSaudiPhone("12345")).toThrow("رقم الجوال السعودي غير صحيح");
  });
});
