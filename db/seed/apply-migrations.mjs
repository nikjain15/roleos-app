// Apply the SQL migrations to the linked Supabase project via the Management API
// (POST /v1/projects/{ref}/database/query) — uses the CLI's access token, so no
// DB password is required. Token is passed in via env; never printed.
//
// Usage: SUPABASE_PAT=... PROJECT_REF=... node db/seed/apply-migrations.mjs file1.sql file2.sql ...
import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_PAT;
const ref = process.env.PROJECT_REF;
if (!token || !ref) {
  console.error("SUPABASE_PAT and PROJECT_REF required");
  process.exit(1);
}

const files = process.argv.slice(2);
for (const file of files) {
  const query = readFileSync(file, "utf8");
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  const body = await res.text();
  if (!res.ok) {
    console.error(`✗ ${file} → ${res.status}: ${body.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`✓ ${file} applied`);
}
console.log("All migrations applied.");
