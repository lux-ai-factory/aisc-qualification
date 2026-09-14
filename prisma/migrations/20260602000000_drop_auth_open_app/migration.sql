-- Remove authentication / account management: the app is now fully open.
-- Drop the user-scoping foreign key and column from Qualification, then the
-- auth tables (User, Account, Session, VerificationToken).

ALTER TABLE "Qualification" DROP CONSTRAINT IF EXISTS "Qualification_userId_fkey";
DROP INDEX IF EXISTS "Qualification_userId_idx";
ALTER TABLE "Qualification" DROP COLUMN IF EXISTS "userId";

DROP TABLE IF EXISTS "Account";
DROP TABLE IF EXISTS "Session";
DROP TABLE IF EXISTS "VerificationToken";
DROP TABLE IF EXISTS "User";
