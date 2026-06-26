UPDATE "User"
SET "phone" = '0' || substring("phone" from 4)
WHERE "phone" ~ '^9665[0-9]{8}$';

UPDATE "Barber"
SET "phone" = '0' || substring("phone" from 4)
WHERE "phone" ~ '^9665[0-9]{8}$';

UPDATE "Customer"
SET "phone" = '0' || substring("phone" from 4)
WHERE "phone" ~ '^9665[0-9]{8}$';

UPDATE "WhatsAppMessageLog"
SET "phone" = '0' || substring("phone" from 4)
WHERE "phone" ~ '^9665[0-9]{8}$';
