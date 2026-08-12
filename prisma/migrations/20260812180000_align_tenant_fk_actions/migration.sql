-- Runs after the current product migrations so every composite tenant FK is
-- covered without a timestamp collision.
-- Composite tenant foreign keys are an extra isolation layer, but their
-- referential actions must agree with the scalar Prisma relation they protect.
-- The original hand-written constraints omitted ON UPDATE / ON DELETE, which
-- silently changed SET NULL and CASCADE relations into NO ACTION. That blocked
-- privacy erasure and made cleanup/delete behavior depend on trigger ordering.
--
-- This migration changes no data and removes no isolation boundary. It rebuilds
-- only a `*_tenant_fkey` that has a matching scalar FK on its first column and
-- whose actions differ from that scalar FK. New constraints are installed
-- NOT VALID first (new writes are still checked), then validated explicitly.

DO $migration$
DECLARE
  target RECORD;
  update_action TEXT;
  delete_action TEXT;
  match_clause TEXT;
  deferrable_clause TEXT;
BEGIN
  FOR target IN
    WITH foreign_keys AS (
      SELECT
        constraint_row.*,
        child_namespace.nspname AS child_schema,
        child_table.relname AS child_table,
        parent_namespace.nspname AS parent_schema,
        parent_table.relname AS parent_table
      FROM pg_constraint AS constraint_row
      JOIN pg_class AS child_table ON child_table.oid = constraint_row.conrelid
      JOIN pg_namespace AS child_namespace ON child_namespace.oid = child_table.relnamespace
      JOIN pg_class AS parent_table ON parent_table.oid = constraint_row.confrelid
      JOIN pg_namespace AS parent_namespace ON parent_namespace.oid = parent_table.relnamespace
      WHERE constraint_row.contype = 'f'
    ),
    tenant_constraints AS (
      SELECT *
      FROM foreign_keys
      WHERE conname LIKE '%tenant_fkey'
        AND cardinality(conkey) = 2
        AND child_schema = current_schema()
    ),
    scalar_constraints AS (
      SELECT *
      FROM foreign_keys
      WHERE cardinality(conkey) = 1
    )
    SELECT
      tenant.oid,
      tenant.conname,
      tenant.child_schema,
      tenant.child_table,
      tenant.parent_schema,
      tenant.parent_table,
      tenant.confmatchtype,
      tenant.condeferrable,
      tenant.condeferred,
      scalar.confupdtype AS desired_update,
      scalar.confdeltype AS desired_delete,
      (
        SELECT string_agg(format('%I', attribute_row.attname), ', ' ORDER BY key_row.ordinality)
        FROM unnest(tenant.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_attribute AS attribute_row
          ON attribute_row.attrelid = tenant.conrelid
         AND attribute_row.attnum = key_row.attnum
      ) AS child_columns,
      (
        SELECT string_agg(format('%I', attribute_row.attname), ', ' ORDER BY key_row.ordinality)
        FROM unnest(tenant.confkey) WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_attribute AS attribute_row
          ON attribute_row.attrelid = tenant.confrelid
         AND attribute_row.attnum = key_row.attnum
      ) AS parent_columns,
      (
        SELECT attribute_row.attname
        FROM unnest(tenant.conkey) WITH ORDINALITY AS key_row(attnum, ordinality)
        JOIN pg_attribute AS attribute_row
          ON attribute_row.attrelid = tenant.conrelid
         AND attribute_row.attnum = key_row.attnum
        WHERE key_row.ordinality = 1
      ) AS nullable_relation_column
    FROM tenant_constraints AS tenant
    JOIN scalar_constraints AS scalar
      ON scalar.conrelid = tenant.conrelid
     AND scalar.confrelid = tenant.confrelid
     AND scalar.conkey[1] = tenant.conkey[1]
    WHERE tenant.confupdtype <> scalar.confupdtype
       OR tenant.confdeltype <> scalar.confdeltype
    ORDER BY tenant.conname
  LOOP
    update_action := CASE target.desired_update
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN 'SET NULL'
      WHEN 'd' THEN 'SET DEFAULT'
      ELSE NULL
    END;

    -- For SET NULL, null only the nullable relation column. organizationId is
    -- deliberately retained and non-null so the historical row keeps its tenant.
    delete_action := CASE target.desired_delete
      WHEN 'a' THEN 'NO ACTION'
      WHEN 'r' THEN 'RESTRICT'
      WHEN 'c' THEN 'CASCADE'
      WHEN 'n' THEN format('SET NULL (%I)', target.nullable_relation_column)
      WHEN 'd' THEN format('SET DEFAULT (%I)', target.nullable_relation_column)
      ELSE NULL
    END;

    IF update_action IS NULL OR delete_action IS NULL THEN
      RAISE EXCEPTION 'Unsupported referential action while rebuilding %', target.conname;
    END IF;

    match_clause := CASE target.confmatchtype
      WHEN 'f' THEN ' MATCH FULL'
      WHEN 'p' THEN ' MATCH PARTIAL'
      ELSE ''
    END;
    deferrable_clause := CASE
      WHEN target.condeferrable AND target.condeferred THEN ' DEFERRABLE INITIALLY DEFERRED'
      WHEN target.condeferrable THEN ' DEFERRABLE INITIALLY IMMEDIATE'
      ELSE ''
    END;

    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      target.child_schema,
      target.child_table,
      target.conname
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %I.%I (%s)%s ON UPDATE %s ON DELETE %s%s NOT VALID',
      target.child_schema,
      target.child_table,
      target.conname,
      target.child_columns,
      target.parent_schema,
      target.parent_table,
      target.parent_columns,
      match_clause,
      update_action,
      delete_action,
      deferrable_clause
    );
    EXECUTE format(
      'ALTER TABLE %I.%I VALIDATE CONSTRAINT %I',
      target.child_schema,
      target.child_table,
      target.conname
    );
  END LOOP;
END
$migration$;
