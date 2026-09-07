/* Shared config + per-entity settings.
 *
 * The app runs as ONE of two entities at a time (Quay 1 or Active), chosen by the
 * header pill toggle. Everything entity-specific — branding, invoice issuer, and the
 * email sender endpoint — lives under ENTITIES[<key>]. Shared infrastructure
 * (Supabase, auth) is common to both.
 *
 * CONFIDENTIALITY: Quay 1 and Active are kept mutually secret. Only the toggle switches
 * between them; nothing on an invoice or email may reference the other entity.
 *
 * The Supabase anon key is public by design (RLS enforces access). The mail tokens are
 * client-visible too: they are a bot/URL-scanner barrier, not a cryptographic secret.
 */
window.QUAY_CFG = {
  SUPABASE_URL:      'https://dqszbqiimbfvmmnpgpsb.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc3picWlpbWJmdm1tbnBncHNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDk4OTQsImV4cCI6MjA5NjQyNTg5NH0.M9RQnJEidyIMZAwbELTSPakiSnvuWBdHTjD7nuOdCZY',
  AUTH_EMAIL_DOMAIN: 'quay1.local',  // username + PIN -> username@quay1.local (same as dashboard-v2)

  DEFAULT_ENTITY: 'quay1',

  ENTITIES: {
    quay1: {
      key:   'quay1',
      label: 'Quay 1',
      ctx:   'SAGE → Quay 1 tax invoices',
      // Header/gate wordmark (light, for the coloured header bar)
      logoHeader: 'assets/quay1-logo-white.png',
      // Theme: overrides the app's existing CSS palette variables (defaults, so
      // switching back to Quay 1 restores the standard blue/gold look)
      theme: {
        '--blue':    '#3D5BA6',
        '--blue-d':  '#2C4685',
        '--gold':    '#FDC503',
        '--ink':     '#161D2B',
        '--chip-bg': '#EEF2FC',
        '--chip-tx': '#2C4685'
      },
      // Invoice (PDF) issuer block
      invoice: {
        issuer:     'IGCISA INVESTMENT HOLDINGS',
        tradeAs:    't/a Quay 1 International Realty',
        sellerVat:  '',        // Quay 1 seller VAT is entered on the worksheet
        sellerAddr: '',        // "" -> operator types it on the worksheet
        banking:    [],        // no banking block on the Quay 1 invoice
        logoPdf:    'QUAY_LOGO_PDF',  // resolves to window.QUAY_LOGO_PDF (raster JPEG)
        logoPdfBox: { x:132, y:10, w:64, h:64*184/300 }  // square-ish flag mark, top-right
      },
      // Email sender: Quay 1 invoices go out via PAYROLL's mailbox.
      // TODO: paste PAYROLL's Apps Script /exec URL + matching SHARED_SECRET token here.
      mail: { endpoint: '', token: '', senderLabel: "payroll's" }
    },

    active: {
      key:   'active',
      label: 'Active',
      ctx:   'SAGE → Active tax invoices',
      logoHeader: 'assets/active-logo-white.png',
      // Active brand system (from the Active brand guide). Never uses black text
      // (brand rule) -> ink is #606060, not near-black.
      theme: {
        '--blue':    '#E96E30',
        '--blue-d':  '#CF5E26',
        '--gold':    '#F3BB42',
        '--ink':     '#606060',
        '--chip-bg': '#FCE9DE',
        '--chip-tx': '#B8531C'
      },
      invoice: {
        issuer:     'IGCISA INVESTMENT HOLDINGS',
        tradeAs:    't/a Active Realty',
        sellerVat:  '4700273198',
        sellerAddr: 'Unit 10, Portside Building\nMain Road\nGreen Point\nCape Town\n8001',
        banking: [
          'Igcisa Investment Holdings Pty Ltd t/a Active Realty',
          'FNB Current Account',
          'Branch Code: 201511',
          'Account Number: 62677632880',
          'Please use the invoice number as payment reference.'
        ],
        logoPdf: 'ACTIVE_LOGO_PDF',  // resolves to window.ACTIVE_LOGO_PDF (set in logo-active.js)
        logoPdfBox: { x:120, y:14, w:76, h:76*343/1200 }  // wide "active" wordmark, right edge at margin
      },
      // Email sender: Active invoices go out via the BOOKKEEPER's mailbox
      // (the Apps Script deployment already live + secured).
      mail: {
        endpoint: 'https://script.google.com/macros/s/AKfycbwMu4Dg62cEAXJNMoRLH_9lh-PqSOyh2Dn49Tv3MAHyDE6uLmQ2OSBWWaNros-DOBX9/exec',
        token:    'c0cec3b15c052b7a42b7ec08877b0b780ded0027d8c6f38f',
        senderLabel: "the bookkeeper's"
      }
    }
  }
};
