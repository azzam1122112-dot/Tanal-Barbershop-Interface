import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("composite tenant foreign-key actions", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("matches each composite tenant constraint to its scalar relation actions", async () => {
    const mismatches = await prisma.$queryRaw<Array<{ constraintName: string }>>`
      WITH foreign_keys AS (
        SELECT constraint_row.*
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS child_table ON child_table.oid = constraint_row.conrelid
        JOIN pg_namespace AS child_namespace ON child_namespace.oid = child_table.relnamespace
        WHERE constraint_row.contype = 'f'
          AND child_namespace.nspname = current_schema()
      ),
      tenant_constraints AS (
        SELECT * FROM foreign_keys
        WHERE conname LIKE '%tenant_fkey' AND cardinality(conkey) = 2
      ),
      scalar_constraints AS (
        SELECT * FROM foreign_keys WHERE cardinality(conkey) = 1
      )
      SELECT tenant.conname AS "constraintName"
      FROM tenant_constraints AS tenant
      JOIN scalar_constraints AS scalar
        ON scalar.conrelid = tenant.conrelid
       AND scalar.confrelid = tenant.confrelid
       AND scalar.conkey[1] = tenant.conkey[1]
      WHERE tenant.confupdtype <> scalar.confupdtype
         OR tenant.confdeltype <> scalar.confdeltype
      ORDER BY tenant.conname
    `;

    expect(mismatches).toEqual([]);
  });
});
