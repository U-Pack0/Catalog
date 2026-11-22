/**
 * Build-time configuration for U-Pack Google Sheets Analytics telemetry.
 * Set `PUBLIC_ANALYTICS_WEBHOOK` in `.env` locally or as GitHub Actions
 * Repository Variable `ANALYTICS_WEBHOOK` for production GitHub Pages deploys.
 */
export const ANALYTICS_WEBHOOK_URL: string = (
  import.meta.env.PUBLIC_ANALYTICS_WEBHOOK ?? ''
).trim();
