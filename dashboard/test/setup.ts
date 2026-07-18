// Ensures modules that read env vars at import time (lib/auth.ts, lib/db.ts) don't
// throw during test collection, even in suites that don't explicitly mock them.
process.env.JWT_SECRET ||= 'test-secret-do-not-use-in-production';
process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/test?sslmode=require';
