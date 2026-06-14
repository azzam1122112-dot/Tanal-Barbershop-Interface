import { describe, expect, it } from "vitest";
import { hashBarberPin, validateBarberPin, verifyBarberPin } from "../lib/auth/barber-pin";

describe("barber PIN validation", () => {
  it("accepts 4 or 6 numeric digits", () => {
    expect(validateBarberPin("1234")).toBe("1234");
    expect(validateBarberPin("123456")).toBe("123456");
  });

  it("rejects values shorter than 4, longer than 6, or non-numeric", () => {
    expect(() => validateBarberPin("123")).toThrow();
    expect(() => validateBarberPin("12345")).toThrow();
    expect(() => validateBarberPin("1234567")).toThrow();
    expect(() => validateBarberPin("12a4")).toThrow();
  });

  it("stores PINs as hashes and verifies without exposing plaintext", async () => {
    const hash = await hashBarberPin("1234");

    expect(hash).not.toBe("1234");
    await expect(verifyBarberPin("1234", hash)).resolves.toBe(true);
    await expect(verifyBarberPin("4321", hash)).resolves.toBe(false);
  });
});
