-- Database-level defense in depth: every AuditLog writer (including legacy code and jobs)
-- is forced through the same PII/secret minimization policy.
CREATE OR REPLACE FUNCTION redact_audit_jsonb(input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE output jsonb;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(input) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key,
      CASE
        WHEN key ~* '(password|passphrase|secret|token|authorization|cookie|session|otp|pin|api[-_]?key|private[-_]?key)'
          THEN '"[REDACTED]"'::jsonb
        WHEN key ~* '^(message|waUrl|body|content|notes?|description)$'
          THEN '"[CONTENT_REDACTED]"'::jsonb
        WHEN key ~* '(phone|mobile|recipient|email)'
          THEN '"[PII_REDACTED]"'::jsonb
        ELSE redact_audit_jsonb(value)
      END), '{}'::jsonb) INTO output
    FROM jsonb_each(input);
    RETURN output;
  ELSIF jsonb_typeof(input) = 'array' THEN
    SELECT COALESCE(jsonb_agg(redact_audit_jsonb(value)), '[]'::jsonb) INTO output
    FROM jsonb_array_elements(input);
    RETURN output;
  END IF;
  RETURN input;
END $$;

CREATE OR REPLACE FUNCTION enforce_audit_log_minimization() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."before" := redact_audit_jsonb(NEW."before");
  NEW."after" := redact_audit_jsonb(NEW."after");
  IF NEW."ipAddress" IS NOT NULL AND NEW."ipAddress" NOT LIKE 'sha256:%' THEN
    NEW."ipAddress" := 'sha256:' || substr(encode(digest(NEW."ipAddress", 'sha256'), 'hex'), 1, 16);
  END IF;
  IF NEW."userAgent" IS NOT NULL THEN NEW."userAgent" := left(NEW."userAgent", 300); END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "AuditLog_minimization_guard"
BEFORE INSERT OR UPDATE OF "before", "after", "ipAddress", "userAgent" ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_minimization();
