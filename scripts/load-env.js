// Minimal, safe env loader for app.config.ts.
// System env always wins; a local .env is loaded only if present.
// This is intentionally dependency-light so a mobile-only build
// (no backend) never fails just because dotenv/.env is absent.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  const path = require("path");
  const envPath = path.resolve(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("dotenv").config({ path: envPath });
  }
} catch (_e) {
  // dotenv not installed or .env missing — safe to ignore.
}
