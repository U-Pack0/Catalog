import { ANALYTICS_WEBHOOK_URL } from '../lib/analytics-config';

type AnalyticsEventType =
  | 'page_view'
  | 'product_view'
  | 'product_card_click'
  | 'variant_select'
  | 'peek_flip'
  | 'bag_add'
  | 'whatsapp_click'
  | 'bag_checkout'
  | 'call_click'
  | 'category_filter'
  | 'search'
  | 'lang_switch';

interface AnalyticsPayload {
  eventType: AnalyticsEventType;
  sessionId: string;
  pagePath: string;
  pageType: string;
  language: 'EN' | 'AR';
  device: 'Mobile' | 'Desktop';
  category: string;
  productSlug: string;
  productName: string;
  detail: string;
  quantity: number;
  source: string;
}

let listenersBound = false;
let lastTrackedHref = '';
let searchTimer: number | undefined;
let lastSearchTerm = '';

function getWebhookUrl(): string {
  return ANALYTICS_WEBHOOK_URL;
}

function getSessionId(): string {
  const key = 'upack_sid';
  try {
    let sid = window.sessionStorage.getItem(key);
    if (!sid) {
      sid = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      window.sessionStorage.setItem(key, sid);
    }
    return sid;
  } catch {
    return `s_${Date.now().toString(36)}`;
  }
}

function detectTrafficSource(): string {
  const key = 'upack_src';
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = (params.get('utm_source') || params.get('fbclid') || '').toLowerCase();
    let detected = '';

    if (params.has('fbclid') || utm.includes('fb') || utm.includes('facebook') || utm.includes('meta')) {
      detected = 'Facebook';
    } else if (utm.includes('ig') || utm.includes('insta')) {
      detected = 'Instagram';
    } else if (utm.includes('wa') || utm.includes('whatsapp')) {
      detected = 'WhatsApp';
    } else if (utm.includes('tiktok') || utm === 'tt') {
      detected = 'TikTok';
    } else if (utm.includes('google') || params.has('gclid')) {
      detected = 'Google';
    } else if (utm) {
      detected = 'Referral';
    } else if (document.referrer) {
      const ref = document.referrer.toLowerCase();
      const sameOrigin = ref.startsWith(window.location.origin.toLowerCase());
      if (!sameOrigin) {
        if (ref.includes('facebook.com') || ref.includes('fb.com')) detected = 'Facebook';
        else if (ref.includes('instagram.com')) detected = 'Instagram';
        else if (ref.includes('whatsapp.com') || ref.includes('wa.me')) detected = 'WhatsApp';
        else if (ref.includes('tiktok.com')) detected = 'TikTok';
        else if (ref.includes('google.')) detected = 'Google';
        else detected = 'Referral';
      }
    }

    if (detected) {
      window.sessionStorage.setItem(key, detected);
      return detected;
    }
    return window.sessionStorage.getItem(key) || 'Direct';
  } catch {
    return 'Direct';
  }
}

function getLanguage(): 'EN' | 'AR' {
  const htmlLang = (document.documentElement.lang || '').toLowerCase();
  if (htmlLang.startsWith('ar') || window.location.pathname.includes('/ar/')) {
    return 'AR';
  }
  return 'EN';
}

function getDevice(): 'Mobile' | 'Desktop' {
  return window.innerWidth < 768 ? 'Mobile' : 'Desktop';
}

function getPageType(pathname: string): string {
  if (pathname.includes('/product/')) return 'product';
  if (pathname.includes('/catalog')) return 'catalog';
  if (pathname.includes('/about')) return 'about';
  if (pathname.includes('/contact')) return 'contact';
  return 'home';
}

function extractProductContext(el: Element | null): {
  category: string;
  productSlug: string;
  productName: string;
} {
  if (!el) return { category: '', productSlug: '', productName: '' };

  const card = el.closest('[data-product-card]') as HTMLElement | null;
  if (card) {
    return {
      category: card.dataset.category || '',
      productSlug: card.dataset.slug || '',
      productName: card.dataset.nameEn || '',
    };
  }

  const pdpPanel = el.closest('[data-pdp-spec-panel]') || document.querySelector('[data-pdp-spec-panel]');
  if (pdpPanel instanceof HTMLElement) {
    return {
      category: pdpPanel.dataset.category || '',
      productSlug: pdpPanel.dataset.slug || '',
      productName: pdpPanel.dataset.nameEn || '',
    };
  }

  return { category: '', productSlug: '', productName: '' };
}

function sendEvent(
  eventType: AnalyticsEventType,
  overrides: Partial<Omit<AnalyticsPayload, 'eventType' | 'sessionId' | 'pagePath' | 'pageType' | 'language' | 'device' | 'source'>> = {}
): void {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const pathname = window.location.pathname || '/';
  const payload: AnalyticsPayload = {
    eventType,
    sessionId: getSessionId(),
    pagePath: pathname,
    pageType: getPageType(pathname),
    language: getLanguage(),
    device: getDevice(),
    category: overrides.category || '',
    productSlug: overrides.productSlug || '',
    productName: overrides.productName || '',
    detail: overrides.detail || '',
    quantity: overrides.quantity ?? 1,
    source: detectTrafficSource(),
  };

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(webhookUrl, blob)) return;
    }
    void fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
      keepalive: true,
    });
  } catch {
    // Telemetry must never interrupt shopping or navigation
  }
}

function trackCurrentPage(): void {
  const href = window.location.href;
  if (href === lastTrackedHref) return;
  lastTrackedHref = href;

  const pdpPanel = document.querySelector('[data-pdp-spec-panel]') as HTMLElement | null;
  const pageType = getPageType(window.location.pathname || '/');

  sendEvent('page_view', {
    category: pdpPanel?.dataset.category || '',
    productSlug: pdpPanel?.dataset.slug || '',
    productName: pdpPanel?.dataset.nameEn || '',
  });

  if (pageType === 'product' && pdpPanel) {
    sendEvent('product_view', {
      category: pdpPanel.dataset.category || '',
      productSlug: pdpPanel.dataset.slug || '',
      productName: pdpPanel.dataset.nameEn || '',
      detail: 'pdp_visit',
    });
  }
}

function bindGlobalListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as Element | null;
      if (!target) return;

      // 1. Product card clicks / product detail links
      const productLink = target.closest('a[href*="/product/"]') as HTMLAnchorElement | null;
      if (productLink) {
        const ctx = extractProductContext(productLink);
        const hrefMatch = productLink.getAttribute('href')?.match(/\/product\/([^/?#]+)/);
        const slug = ctx.productSlug || (hrefMatch ? hrefMatch[1] : '');
        if (slug) {
          sendEvent('product_card_click', {
            category: ctx.category,
            productSlug: slug,
            productName: ctx.productName || slug,
            detail: productLink.closest('[data-product-card]') ? 'catalog_card' : 'showcase_link',
          });
        }
        return;
      }

      // 2. Quote bag checkout (WhatsApp)
      const checkoutBtn = target.closest('#quote-bag-send-wa');
      if (checkoutBtn) {
        const totalEl = document.getElementById('quote-bag-total-count');
        const qty = Number(totalEl?.textContent?.replace(/\D+/g, '') || 1) || 1;
        sendEvent('bag_checkout', {
          detail: 'quote_bag_drawer',
          quantity: qty,
        });
        return;
      }

      // 3. Add to quote bag (main variant or paired lid)
      const addBagBtn = target.closest('[data-add-bag], [data-add-lid-bag]') as HTMLElement | null;
      if (addBagBtn) {
        const ctx = extractProductContext(addBagBtn);
        const sku = addBagBtn.dataset.sku || '';
        const qty = Number(addBagBtn.dataset.quantity || 1) || 1;
        sendEvent('bag_add', {
          category: ctx.category || addBagBtn.dataset.category || '',
          productSlug: ctx.productSlug,
          productName: addBagBtn.dataset.nameEn || ctx.productName,
          detail: sku || (addBagBtn.hasAttribute('data-add-lid-bag') ? 'paired_lid' : 'box'),
          quantity: qty,
        });
        return;
      }

      // 4. WhatsApp click (card, PDP, or floating/header CTA)
      const waEl = target.closest('[data-card-wa], #pdp-order-wa, a[href*="wa.me"]') as HTMLElement | null;
      if (waEl) {
        const ctx = extractProductContext(waEl);
        sendEvent('whatsapp_click', {
          category: ctx.category,
          productSlug: ctx.productSlug,
          productName: waEl.dataset.nameEn || ctx.productName,
          detail: waEl.id === 'pdp-order-wa' ? 'pdp_wa' : waEl.hasAttribute('data-card-wa') ? 'card_wa' : 'site_wa',
        });
        return;
      }

      // 5. Phone call click
      const telEl = target.closest('a[href^="tel:"]');
      if (telEl) {
        sendEvent('call_click', {
          detail: telEl.getAttribute('href') || 'tel',
        });
        return;
      }

      // 6. Variant pill selection on card or PDP
      const variantPill = target.closest('[data-variant-pill]') as HTMLElement | null;
      if (variantPill) {
        const ctx = extractProductContext(variantPill);
        sendEvent('variant_select', {
          category: ctx.category,
          productSlug: ctx.productSlug,
          productName: ctx.productName,
          detail: (variantPill.dataset.sku || variantPill.textContent || '').trim(),
        });
        return;
      }

      // 7. Peek Inside flip button
      const peekBtn = target.closest('[data-peek-btn]');
      if (peekBtn) {
        const ctx = extractProductContext(peekBtn);
        sendEvent('peek_flip', {
          category: ctx.category,
          productSlug: ctx.productSlug,
          productName: ctx.productName,
          detail: 'peek_inside',
        });
        return;
      }

      // 8. Category / Material / Spotlight filters
      const filterBtn = target.closest('[data-cat-filter], [data-mat-filter], [data-spotlight-tab]') as HTMLElement | null;
      if (filterBtn) {
        const val =
          filterBtn.dataset.catFilter ||
          filterBtn.dataset.matFilter ||
          filterBtn.dataset.spotlightTab ||
          filterBtn.textContent?.trim() ||
          '';
        sendEvent('category_filter', {
          category: filterBtn.dataset.catFilter || '',
          detail: val,
        });
        return;
      }

      // 9. Language switch
      const langSwitch = target.closest('[data-lang-switch]');
      if (langSwitch) {
        sendEvent('lang_switch', {
          detail: getLanguage() === 'EN' ? 'EN->AR' : 'AR->EN',
        });
      }
    },
    { passive: true }
  );

  document.addEventListener(
    'input',
    (ev) => {
      const target = ev.target as HTMLInputElement | null;
      if (!target || target.id !== 'catalog-search') return;
      const query = target.value.trim().toLowerCase();
      if (searchTimer) window.clearTimeout(searchTimer);
      if (query.length < 2) return;
      searchTimer = window.setTimeout(() => {
        if (query === lastSearchTerm) return;
        lastSearchTerm = query;
        sendEvent('search', { detail: query });
      }, 750);
    },
    { passive: true }
  );
}

export function initAnalytics(): void {
  if (!getWebhookUrl()) return;
  bindGlobalListeners();
  trackCurrentPage();
}
