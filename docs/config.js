/* Shared Quay 1 Supabase config (public anon key — safe in the client; RLS enforces access). */
window.QUAY_CFG = {
  SUPABASE_URL:      'https://dqszbqiimbfvmmnpgpsb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc3picWlpbWJmdm1tbnBncHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDk4OTQsImV4cCI6MjA5NjQyNTg5NH0.M9RQnJEidyIMZAwbELTSPakiSnvuWBdHTjD7nuOdCZY',
  AUTH_EMAIL_DOMAIN: 'quay1.local',  // username + PIN -> username@quay1.local (same as dashboard-v2)
  // Apps Script /exec URL, deployed under the BOOKKEEPER's Google account, that
  // creates draft emails to brokers with invoice PDFs attached (draft only, never sends).
  // Deploy apps-script/Code.gs, then paste the /exec URL here. Empty = email disabled.
  INVOICE_MAIL_ENDPOINT: '',
  // Shared secret guarding the endpoint. Must match the SHARED_SECRET Script
  // Property on the Apps Script deployment. Leave '' only if the script has no
  // SHARED_SECRET set. Note: this is client-visible; it is a bot/URL-scanner
  // barrier, not a cryptographic secret. Rotate by updating both places.
  INVOICE_MAIL_TOKEN: ''
};
