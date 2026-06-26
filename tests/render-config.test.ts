import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Render deployment configuration", () => {
  it("defines a Render Blueprint with migrations, seed, and health check", () => {
    const renderYamlPath = join(process.cwd(), "render.yaml");
    const renderYaml = readFileSync(renderYamlPath, "utf8");

    expect(existsSync(renderYamlPath)).toBe(true);
    expect(renderYaml).toContain("type: web");
    expect(renderYaml).toContain("runtime: node");
    expect(renderYaml).toContain("npm ci && npm run prisma:generate && npm run build");
    expect(renderYaml).toContain("preDeployCommand: npm run prisma:deploy && npm run prisma:seed");
    expect(renderYaml).toContain("startCommand: npm run start:render");
    expect(renderYaml).toContain("healthCheckPath: /api/health");
    expect(renderYaml).toContain("fromDatabase:");
    expect(renderYaml).toContain("sync: false");
  });

  it("stays compatible with the Render free plan", () => {
    const renderYaml = readFileSync(join(process.cwd(), "render.yaml"), "utf8");

    expect(renderYaml).toContain("plan: free");
    expect(renderYaml).not.toContain("type: cron");
    expect(renderYaml).not.toContain("basic-256mb");
    expect(renderYaml).not.toContain("plan: starter");
  });

  it("uses Node LTS consistently for deployment", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      engines: Record<string, string>;
    };
    const nvmrc = readFileSync(join(process.cwd(), ".nvmrc"), "utf8").trim();
    const nodeVersion = readFileSync(join(process.cwd(), ".node-version"), "utf8").trim();
    const renderYaml = readFileSync(join(process.cwd(), "render.yaml"), "utf8");

    expect(packageJson.engines.node).toBe(">=22 <23");
    expect(packageJson.scripts["start:render"]).toBe("next start -p $PORT");
    expect(nvmrc).toBe("22.22.3");
    expect(nodeVersion).toBe("22.22.3");
    expect(renderYaml).toContain("NODE_VERSION");
    expect(renderYaml).toContain("22.22.3");
  });

  it("requires explicit seed credentials when running on Render", () => {
    const seed = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");
    const renderYaml = readFileSync(join(process.cwd(), "render.yaml"), "utf8");
    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");

    expect(seed).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
    expect(seed).toContain("is required when REQUIRE_EXPLICIT_SEED_CREDENTIALS=true");
    expect(renderYaml).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
    expect(renderYaml).toContain('value: "true"');
    expect(envExample).toContain("REQUIRE_EXPLICIT_SEED_CREDENTIALS");
  });

  it("provides a lightweight health endpoint for Render", () => {
    const healthRoutePath = join(process.cwd(), "app", "api", "health", "route.ts");
    const healthRoute = readFileSync(healthRoutePath, "utf8");

    expect(existsSync(healthRoutePath)).toBe(true);
    expect(healthRoute).toContain('status: "ok"');
    expect(healthRoute).toContain("Cache-Control");
  });
});
