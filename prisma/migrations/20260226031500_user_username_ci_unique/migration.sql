-- Enforce case-insensitive uniqueness for usernames
-- So Test01 and test01 are treated as the same username.
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_ci_key" ON "User" (LOWER("username"));
