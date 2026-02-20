-- Compatibility fix for Postgres 17
-- uuid_generate_v4() and gen_random_bytes() may not be in search path
CREATE OR REPLACE FUNCTION public.uuid_generate_v4() RETURNS uuid
LANGUAGE sql AS $$ SELECT gen_random_uuid(); $$;

-- Enable pgcrypto for gen_random_bytes (used by generate_invitation_token)
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Make gen_random_bytes accessible from public schema
CREATE OR REPLACE FUNCTION public.gen_random_bytes(int) RETURNS bytea
LANGUAGE sql AS $$ SELECT extensions.gen_random_bytes($1); $$;
