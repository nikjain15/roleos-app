import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal OpenNext→Cloudflare config. Incremental cache / queue can be wired
// to KV or R2 later (Phase 4+); for Phase 1 the defaults are sufficient.
export default defineCloudflareConfig();
