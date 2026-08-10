import { describe, expect, it } from "vitest";
import { absoluteBrowserUrl } from "../lib/public-url";

describe("public browser URLs", () => {
  it("uses the production origin that is open in the browser", () => {
    expect(absoluteBrowserUrl("/dashboard/login", "https://salon.example.com")).toBe(
      "https://salon.example.com/dashboard/login",
    );
  });

  it("repairs an internal localhost URL while preserving its login path", () => {
    expect(
      absoluteBrowserUrl("https://localhost:3000/dashboard/login", "https://salon.example.com"),
    ).toBe("https://salon.example.com/dashboard/login");
  });

  it("still supports localhost during local development", () => {
    expect(absoluteBrowserUrl("dashboard/login", "http://localhost:3000")).toBe(
      "http://localhost:3000/dashboard/login",
    );
  });
});
