import { describe, expect, it } from "vitest";
import { hashBarberPin, validateBarberPin, verifyBarberPin } from "../lib/auth/barber-pin";

describe("barber access code validation", () => {
  it("accepts 8+ characters with letters, digits, and symbols", () => {
    expect(validateBarberPin("Tanal@123")).toBe("Tanal@123");
    expect(validateBarberPin("aB3$xYz!")).toBe("aB3$xYz!");
    expect(validateBarberPin("رمز-سري-123")).toBe("رمز-سري-123");
  });

  it("rejects values shorter than 8 or containing whitespace", () => {
    expect(() => validateBarberPin("1234")).toThrow();
    expect(() => validateBarberPin("Tanal@1")).toThrow();
    expect(() => validateBarberPin("Tanal 123")).toThrow();
    expect(() => validateBarberPin("a".repeat(65))).toThrow();
  });

  it("stores codes as hashes and verifies without exposing plaintext", async () => {
    const hash = await hashBarberPin("Tanal@123");

    expect(hash).not.toBe("Tanal@123");
    await expect(verifyBarberPin("Tanal@123", hash)).resolves.toBe(true);
    await expect(verifyBarberPin("Wrong@123", hash)).resolves.toBe(false);
  });

  it("returns false (not throws) when the submitted code is malformed", async () => {
    const hash = await hashBarberPin("Tanal@123");
    await expect(verifyBarberPin("123", hash)).resolves.toBe(false);
  });
});
