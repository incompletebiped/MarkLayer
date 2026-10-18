-- The display name a signed-in person goes by, so it follows them to every
-- browser and device instead of living in one browser's localStorage. Nullable:
-- an account made before this, or one that never chose a name, has none.
ALTER TABLE users ADD COLUMN name TEXT;
