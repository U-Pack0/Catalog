/**
 * U-Pack Website Analytics Webhook — Google Apps Script
 * ------------------------------------------------------
 * Appends live visitor, product click, search, and WhatsApp lead telemetry
 * from the static U-Pack website into the "Site Events" tab ONLY.
 * Never touches "Single orders", "Sheet1", "Sheet2", "Analytics Dashboard", or "Product Insights".
 *
 * SETUP (2 minutes):
 * 1. Open your Google Sheet -> Extensions -> Apps Script.
 * 2. Delete any placeholder code in Code.gs and paste this entire file, then click Save.
 * 3. Click Deploy -> New deployment -> Select type: Web app.
 *    - Description: U-Pack Site Telemetry v1
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone
 * 4. Click Deploy, authorize access, and copy the Web App URL (ends with /exec).
 * 5. Open your Web App URL in a browser tab once to confirm {"ok":true,...}, then
 *    paste it into GitHub repo Settings -> Secrets and variables -> Actions ->
 *    Variables -> New repository variable named ANALYTICS_WEBHOOK (or .env as PUBLIC_ANALYTICS_WEBHOOK).
 */

const SHEET_NAME = 'Site Events';
const TIMEZONE = 'Africa/Cairo';
const HEADERS = [
  'Timestamp',
  'Date',
  'Session ID',
  'Event Type',
  'Page Path',
  'Page Type',
  'Language',
  'Device',
  'Category',
  'Product Slug',
  'Product Name',
  'Variant / Detail',
  'Quantity',
  'Traffic Source',
];

const ALLOWED_EVENTS = {
  page_view: true,
  product_view: true,
  product_card_click: true,
  variant_select: true,
  peek_flip: true,
  bag_add: true,
  whatsapp_click: true,
  bag_checkout: true,
  call_click: true,
  category_filter: true,
  search: true,
  lang_switch: true,
};

function sanitizeCell(value, maxLen) {
  if (value === null || value === undefined) return '';
  let str = String(value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  if (maxLen && str.length > maxLen) {
    str = str.slice(0, maxLen);
  }
  // Neutralize formula injection from untrusted visitor parameters (e.g. search keywords)
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  return str;
}

function sanitizeQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 1;
  return Math.min(Math.round(n), 100000);
}

function getOrCreateEventsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({
    ok: true,
    service: 'U-Pack Website & Product Analytics Webhook',
    targetSheet: SHEET_NAME,
    timezone: TIMEZONE,
    timestamp: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const acquired = lock.tryLock(10000);
    if (!acquired) {
      return jsonResponse({ ok: false, error: 'busy' });
    }

    let raw = '';
    if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    } else if (e && e.parameter && e.parameter.payload) {
      raw = e.parameter.payload;
    }

    if (!raw) {
      return jsonResponse({ ok: false, error: 'empty_payload' });
    }

    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.events) ? parsed.events : [parsed]);

    const now = new Date();
    const timestampStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const dateStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');

    const rows = [];
    for (let i = 0; i < Math.min(items.length, 25); i++) {
      const ev = items[i];
      if (!ev || typeof ev !== 'object') continue;
      const eventType = sanitizeCell(ev.eventType || ev.event || '', 40);
      if (!ALLOWED_EVENTS[eventType]) continue;

      rows.push([
        timestampStr,
        dateStr,
        sanitizeCell(ev.sessionId, 64),
        eventType,
        sanitizeCell(ev.pagePath, 220),
        sanitizeCell(ev.pageType, 32),
        sanitizeCell(ev.language, 8) || 'EN',
        sanitizeCell(ev.device, 16) || 'Desktop',
        sanitizeCell(ev.category, 80),
        sanitizeCell(ev.productSlug, 100),
        sanitizeCell(ev.productName, 180),
        sanitizeCell(ev.detail, 160),
        sanitizeQty(ev.quantity),
        sanitizeCell(ev.source, 32) || 'Direct',
      ]);
    }

    if (rows.length > 0) {
      const sheet = getOrCreateEventsSheet();
      const startRow = Math.max(2, sheet.getLastRow() + 1);
      sheet.getRange(startRow, 1, rows.length, 2).setNumberFormat('@');
      sheet.getRange(startRow, 1, rows.length, HEADERS.length).setValues(rows);
    }

    return jsonResponse({ ok: true, recorded: rows.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (_ignored) {}
  }
}
