import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Don't send PII (personally identifiable info) - keep this off for security
  sendDefaultPii: false,
  // Normal traces sample rate
  tracesSampleRate: 1.0,
  // Environment will beauto-detected from NODE_ENV
  environment: process.env.NODE_ENV || "development",
});

console.log("📡 Sentry initialized");