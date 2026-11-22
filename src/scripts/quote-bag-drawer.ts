import gsap from 'gsap';
import type { PhotoBackdrop } from '../data/catalog.schema';
import {
  formatOrderQty,
  formatShortBox,
  getUI,
  type LidPolicy,
  type OrderUnit,
} from '../lib/i18n';
import {
  addToQuoteBag,
  clearQuoteBag,
  getBuyerInfo,
  getQuoteBag,
  getTotalBagBoxes,
  removeFromQuoteBag,
  saveBuyerInfo,
  syncBagBadges,
  updateBagQuantity,
  type QuoteBagEntry,
} from '../lib/quote-bag-store';
import { DEFAULT_SITE, type Lang } from '../lib/url';
import { buildQuoteBagWhatsAppUrl } from '../lib/whatsapp';
import { animateMetricPop, flyToBag } from './motion-controller';

function getLang(): Lang {
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

function isRtl(): boolean {
  return document.documentElement.dir === 'rtl';
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function resolveWithBase(path: string): string {
  if (!path) return '/';
  if (/^(https?:|mailto:|tel:|data:|#)/i.test(path)) return path;
  const baseRaw = document.documentElement.dataset.base || '/';
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  const clean = path.replace(/^\/+/, '');
  const baseNoLead = base.replace(/^\/+/, '');
  if (baseNoLead && clean.startsWith(baseNoLead)) {
    return `/${clean}`;
  }
  return `${base}${clean}`;
}

function resolveAbsUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const siteOrigin = document.documentElement.dataset.site || DEFAULT_SITE;
  const withBase = resolveWithBase(path);
  try {
    return new URL(withBase, siteOrigin).toString();
  } catch {
    return withBase;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let drawerOpen = false;
let lastTriggerEl: HTMLElement | null = null;
let initialized = false;

function updateWhatsAppHref(items: QuoteBagEntry[]): void {
  const sendBtn = document.getElementById('quote-bag-send-wa') as HTMLAnchorElement | null;
  if (!sendBtn) return;

  const lang = getLang();
  const buyer = getBuyerInfo();
  const businessInput = document.getElementById('quote-bag-business') as HTMLInputElement | null;
  const cityInput = document.getElementById('quote-bag-city') as HTMLInputElement | null;

  const businessName = businessInput ? businessInput.value : buyer.businessName;
  const governorate = cityInput ? cityInput.value : buyer.governorate;

  const bagItems = items.map((item) => ({
    productName: item.productName[lang] || item.productName.en,
    variantLabel: item.variantLabel[lang] || item.variantLabel.en,
    sku: item.sku,
    isSyntheticSku: item.isSyntheticSku,
    lidPolicy: item.lidPolicy,
    selectedLidSku: item.selectedLidSku,
    pcsPerBox: item.pcsPerBox,
    packUnit: item.packUnit,
    orderUnit: item.orderUnit,
    quantity: item.quantity,
    productUrl: resolveAbsUrl(item.productPath[lang] || item.productPath.en),
    isSeparateLid: item.isSeparateLid,
  }));

  sendBtn.href = buildQuoteBagWhatsAppUrl({
    lang,
    items: bagItems,
    businessName,
    governorate,
  });
}

export function renderQuoteBagDrawer(): void {
  const items = getQuoteBag();
  syncBagBadges(items);

  const emptyEl = document.getElementById('quote-bag-empty');
  const listEl = document.getElementById('quote-bag-items');
  const footerEl = document.getElementById('quote-bag-footer');
  const totalEl = document.getElementById('quote-bag-total-count');
  const headerCountEl = document.getElementById('quote-bag-header-count');

  const lang = getLang();
  const ui = getUI(lang);
  const totalBoxes = getTotalBagBoxes(items);

  if (headerCountEl) {
    headerCountEl.textContent = String(totalBoxes);
  }

  if (!listEl || !emptyEl || !footerEl) return;

  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    footerEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  footerEl.classList.remove('hidden');

  if (totalEl) {
    totalEl.textContent = formatOrderQty(lang, totalBoxes, 'box');
  }

  listEl.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.productName[lang] || item.productName.en);
      const variant = escapeHtml(item.variantLabel[lang] || item.variantLabel.en);
      const imgUrl = escapeHtml(resolveWithBase(item.image));
      const href = escapeHtml(resolveWithBase(item.productPath[lang] || item.productPath.en));
      const plinthClass = item.photoBackdrop === 'dark' ? 'plinth-dark' : 'plinth-light';
      const showSku = Boolean(item.sku && !item.isSyntheticSku);
      const packText = escapeHtml(
        formatShortBox(lang, item.pcsPerBox, item.orderUnit, item.packUnit)
      );
      const qtyText = escapeHtml(formatOrderQty(lang, item.quantity, item.orderUnit));
      const encodedKey = escapeHtml(item.key);

      const lidBadgeHtml = item.isSeparateLid
        ? `<span class="inline-flex items-center rounded-full bg-crimson/10 px-2 py-0.5 text-[11px] font-semibold text-crimson">${escapeHtml(ui.bag.separateLidTag)}</span>`
        : item.lidPolicy === 'cups-no-lid-separate'
          ? `<span class="inline-flex items-center rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-800">${escapeHtml(ui.lidBadges['cups-no-lid-separate'])}</span>`
          : '';

      const selectedLidHtml =
        item.selectedLidSku && !item.isSeparateLid
          ? `<span class="inline-flex items-center rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"><bdi dir="ltr">+ Lid ${escapeHtml(item.selectedLidSku)}</bdi></span>`
          : '';

      return `
        <li class="flex gap-3.5 rounded-2xl border border-hairline bg-surface p-3.5 shadow-xs transition-colors hover:border-hairline-strong" data-bag-item="${encodedKey}">
          <a href="${href}" class="${plinthClass} flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl p-2">
            <img src="${imgUrl}" alt="${title}" width="72" height="72" loading="lazy" decoding="async" class="h-full w-full object-contain" />
          </a>
          <div class=" flex min-w-0 flex-1 flex-col justify-between gap-2">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <a href="${href}" class="block truncate font-display text-sm font-bold text-ink hover:text-crimson transition-colors">${title}</a>
                <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                  ${variant ? `<span class="font-medium text-ink-secondary">${variant}</span>` : ''}
                  ${showSku ? `<span class="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink"><bdi dir="ltr">${escapeHtml(item.sku)}</bdi></span>` : ''}
                  ${selectedLidHtml}
                </div>
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span class="inline-flex items-center rounded-md bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-secondary">${packText}</span>
                  ${lidBadgeHtml}
                </div>
              </div>
              <button
                type="button"
                class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle hover:bg-crimson/10 hover:text-crimson transition-colors"
                data-bag-remove="${encodedKey}"
                aria-label="${escapeHtml(ui.bag.removeItemAria)}"
              >
                <svg width="16" height="16" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <line x1="216" y1="56" x2="40" y2="56" />
                  <line x1="104" y1="104" x2="104" y2="168" />
                  <line x1="152" y1="104" x2="152" y2="168" />
                  <path d="M200,56V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V56" />
                </svg>
              </button>
            </div>
            <div class="flex items-center justify-between gap-2 pt-1">
              <div class="inline-flex items-center rounded-full border border-hairline bg-surface-muted p-0.5">
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-surface transition-colors"
                  data-bag-qty-key="${encodedKey}"
                  data-bag-qty-delta="-1"
                  aria-label="${escapeHtml(ui.bag.decreaseQtyAria)}"
                >
                  <svg width="13" height="13" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" aria-hidden="true">
                    <line x1="40" y1="128" x2="216" y2="128" />
                  </svg>
                </button>
                <span class="min-w-[5.25rem] px-2 text-center font-mono text-xs font-bold text-ink">${qtyText}</span>
                <button
                  type="button"
                  class="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink hover:bg-surface transition-colors"
                  data-bag-qty-key="${encodedKey}"
                  data-bag-qty-delta="1"
                  aria-label="${escapeHtml(ui.bag.increaseQtyAria)}"
                >
                  <svg width="13" height="13" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="24" stroke-linecap="round" aria-hidden="true">
                    <line x1="40" y1="128" x2="216" y2="128" />
                    <line x1="128" y1="40" x2="128" y2="216" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </li>
      `;
    })
    .join('');

  updateWhatsAppHref(items);
}

export function openQuoteBagDrawer(triggerEl?: HTMLElement | null): void {
  const drawer = document.getElementById('quote-bag-drawer');
  const backdrop = document.getElementById('quote-bag-backdrop');
  if (!drawer || !backdrop) return;

  if (triggerEl) {
    lastTriggerEl = triggerEl;
  }

  renderQuoteBagDrawer();
  drawerOpen = true;

  drawer.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  document.querySelectorAll<HTMLElement>('[data-bag-btn]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'true');
  });

  const dir = isRtl() ? -1 : 1;

  if (prefersReducedMotion()) {
    gsap.set(backdrop, { opacity: 1 });
    gsap.set(drawer, { xPercent: 0 });
  } else {
    gsap.killTweensOf([backdrop, drawer]);
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: 'power2.out' }
    );
    gsap.fromTo(
      drawer,
      { xPercent: 100 * dir },
      { xPercent: 0, duration: 0.38, ease: 'power3.out' }
    );
  }

  const closeBtn = drawer.querySelector<HTMLElement>('[data-close-bag]');
  closeBtn?.focus();
}

export function closeQuoteBagDrawer(): void {
  const drawer = document.getElementById('quote-bag-drawer');
  const backdrop = document.getElementById('quote-bag-backdrop');
  if (!drawer || !backdrop || !drawerOpen) return;

  drawerOpen = false;
  drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';

  document.querySelectorAll<HTMLElement>('[data-bag-btn]').forEach((btn) => {
    btn.setAttribute('aria-expanded', 'false');
  });

  const dir = isRtl() ? -1 : 1;

  const finishClose = () => {
    drawer.classList.add('hidden');
    backdrop.classList.add('hidden');
    if (lastTriggerEl && typeof lastTriggerEl.focus === 'function') {
      lastTriggerEl.focus();
    }
  };

  if (prefersReducedMotion()) {
    finishClose();
  } else {
    gsap.killTweensOf([backdrop, drawer]);
    gsap.to(backdrop, { opacity: 0, duration: 0.2, ease: 'power2.in' });
    gsap.to(drawer, {
      xPercent: 100 * dir,
      duration: 0.26,
      ease: 'power2.in',
      onComplete: finishClose,
    });
  }
}

function parseAddPayloadFromButton(
  btn: HTMLElement,
  isSeparateLid: boolean
): (Omit<QuoteBagEntry, 'key' | 'quantity'> & { quantity?: number }) | null {
  const rawPayload = btn.getAttribute('data-bag-payload');
  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && parsed.slug && parsed.productName) {
        return {
          ...parsed,
          isSeparateLid: Boolean(isSeparateLid || parsed.isSeparateLid),
        };
      }
    } catch {
      // Fall back to data-* attributes below
    }
  }

  const slug = btn.dataset.slug || '';
  if (!slug) return null;

  const nameEn = btn.dataset.nameEn || slug;
  const nameAr = btn.dataset.nameAr || nameEn;
  const variantEn = btn.dataset.variantEn || '';
  const variantAr = btn.dataset.variantAr || variantEn;
  const sku = btn.dataset.sku || '';
  const isSyntheticSku = btn.dataset.syntheticSku === 'true';
  const lidPolicy = (btn.dataset.lidPolicy as LidPolicy) || 'no-lid';
  const selectedLidSku = btn.dataset.selectedLidSku || undefined;
  const pcsPerBox = btn.dataset.pcsPerBox ? Number(btn.dataset.pcsPerBox) : undefined;
  const packUnit = btn.dataset.packUnit || undefined;
  const orderUnit = (btn.dataset.orderUnit as OrderUnit) || 'box';
  const quantity = btn.dataset.quantity ? Math.max(1, Number(btn.dataset.quantity)) : 1;
  const image = btn.dataset.image || '/images/brand/upack-logo.jpg';
  const photoBackdrop = (btn.dataset.backdrop as PhotoBackdrop) || 'light';
  const pathEn = btn.dataset.pathEn || `en/product/${slug}/`;
  const pathAr = btn.dataset.pathAr || `ar/product/${slug}/`;

  return {
    slug,
    productName: { en: nameEn, ar: nameAr },
    variantLabel: { en: variantEn, ar: variantAr },
    sku,
    isSyntheticSku,
    lidPolicy,
    selectedLidSku,
    pcsPerBox,
    packUnit,
    orderUnit,
    quantity,
    image,
    photoBackdrop,
    productPath: { en: pathEn, ar: pathAr },
    isSeparateLid,
  };
}

export function initQuoteBagDrawer(): void {
  syncBagBadges();
  renderQuoteBagDrawer();

  const buyer = getBuyerInfo();
  const businessInput = document.getElementById('quote-bag-business') as HTMLInputElement | null;
  const cityInput = document.getElementById('quote-bag-city') as HTMLInputElement | null;

  if (businessInput && !businessInput.value) {
    businessInput.value = buyer.businessName;
  }
  if (cityInput && !cityInput.value) {
    cityInput.value = buyer.governorate;
  }

  if (initialized) return;
  initialized = true;

  window.addEventListener('upack:bag-updated', () => {
    renderQuoteBagDrawer();
    const totalEl = document.getElementById('quote-bag-total-count');
    animateMetricPop(totalEl);
  });

  document.addEventListener('input', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.id === 'quote-bag-business') {
      saveBuyerInfo({ businessName: (target as HTMLInputElement).value });
      updateWhatsAppHref(getQuoteBag());
    } else if (target.id === 'quote-bag-city') {
      saveBuyerInfo({ governorate: (target as HTMLInputElement).value });
      updateWhatsAppHref(getQuoteBag());
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // 1. Open Quote Bag Drawer
    const openBtn = target.closest<HTMLElement>('[data-bag-btn], [data-open-bag]');
    if (openBtn) {
      e.preventDefault();
      if (drawerOpen) {
        closeQuoteBagDrawer();
      } else {
        openQuoteBagDrawer(openBtn);
      }
      return;
    }

    // 2. Close Quote Bag Drawer
    const closeBtn = target.closest<HTMLElement>('[data-close-bag]');
    if (closeBtn || target.id === 'quote-bag-backdrop') {
      e.preventDefault();
      closeQuoteBagDrawer();
      return;
    }

    // 3. Add product box or separate lid box to Quote Bag
    const addLidBtn = target.closest<HTMLElement>('[data-add-lid-bag]');
    if (addLidBtn) {
      e.preventDefault();
      const entry = parseAddPayloadFromButton(addLidBtn, true);
      if (entry) {
        addToQuoteBag(entry);
        flyToBag(addLidBtn, '+1');
      }
      return;
    }

    const addBoxBtn = target.closest<HTMLElement>('[data-add-bag]');
    if (addBoxBtn) {
      e.preventDefault();
      const entry = parseAddPayloadFromButton(addBoxBtn, false);
      if (entry) {
        addToQuoteBag(entry);
        flyToBag(addBoxBtn, `+${entry.quantity || 1}`);
      }
      return;
    }

    // 4. Quantity stepper inside Quote Bag Drawer
    const qtyBtn = target.closest<HTMLElement>('[data-bag-qty-key]');
    if (qtyBtn) {
      e.preventDefault();
      const key = qtyBtn.getAttribute('data-bag-qty-key') || '';
      const delta = Number(qtyBtn.getAttribute('data-bag-qty-delta') || '0');
      if (key && delta !== 0) {
        updateBagQuantity(key, delta, true);
      }
      return;
    }

    // 5. Remove item inside Quote Bag Drawer
    const removeBtn = target.closest<HTMLElement>('[data-bag-remove]');
    if (removeBtn) {
      e.preventDefault();
      const key = removeBtn.getAttribute('data-bag-remove') || '';
      if (key) {
        removeFromQuoteBag(key);
      }
      return;
    }

    // 6. Clear entire Quote Bag
    const clearBtn = target.closest<HTMLElement>('[data-clear-bag]');
    if (clearBtn) {
      e.preventDefault();
      clearQuoteBag();
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!drawerOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeQuoteBagDrawer();
      return;
    }
    if (e.key === 'Tab') {
      const drawer = document.getElementById('quote-bag-drawer');
      if (!drawer) return;
      const focusables = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuoteBagDrawer, { once: true });
  } else {
    initQuoteBagDrawer();
  }
  document.addEventListener('astro:page-load', initQuoteBagDrawer);
}
