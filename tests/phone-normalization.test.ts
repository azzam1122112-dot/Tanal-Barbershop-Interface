import { describe, expect, it } from "vitest";
import { normalizeSaudiPhone } from "../lib/phone/saudi-phone";

describe("Saudi phone normalization", () => {
  it("accepts 05xxxxxxxx as the stored local mobile format", () => {
    expect(normalizeSaudiPhone("0501234567")).toBe("0501234567");
  });

  it("rejects +9665xxxxxxxx", () => {
    expect(() => normalizeSaudiPhone("+966501234567")).toThrow("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
  });

  it("rejects 5xxxxxxxx without the leading 0", () => {
    expect(() => normalizeSaudiPhone("501234567")).toThrow("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
  });

  it("rejects invalid numbers", () => {
    expect(() => normalizeSaudiPhone("12345")).toThrow("رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام");
  });
});
