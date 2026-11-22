import type { ProductVariant } from '../data/catalog.schema';
import {
  formatSoldByBox,
  getUI,
  type LidPolicy,
} from '../lib/i18n';
import { DEFAULT_SITE, type Lang } from '../lib/url';
import { buildProductWhatsAppUrl } from '../lib/whatsapp';
import {
  animateMetricPop,
  refreshCardTricks,
  syncPillRail,
} from './motion-controller';

function getLang(): Lang {
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
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

export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function handleCardVariantSwitch(pillBtn: HTMLElement): void {
  const card = pillBtn.closest<HTMLElement>('[data-product-card]');
  if (!card) return;

  const variantsRaw = card.getAttribute('data-variants');
  if (!variantsRaw) return;

  let variants: ProductVariant[] = [];
  try {
    variants = JSON.parse(variantsRaw);
  } catch {
    return;
  }

  const index = Number(pillBtn.getAttribute('data-variant-index') || '0');
  const variant = variants[index];
  if (!variant) return;

  const lang = getLang();
  const ui = getUI(lang);
  const slug = card.dataset.slug || '';
  const nameEn = card.dataset.nameEn || slug;
  const nameAr = card.dataset.nameAr || nameEn;
  const lidPolicy = (card.dataset.lidPolicy as LidPolicy) || 'no-lid';
  const defaultImage = card.dataset.defaultImage || '';
  const defaultBackdrop = card.dataset.defaultBackdrop || 'light';

  // 1. Update active state on variant pills within this card
  card.querySelectorAll<HTMLElement>('[data-variant-pill]').forEach((btn, i) => {
    const active = i === index;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      btn.classList.add('border-obsidian', 'bg-obsidian', 'text-white');
      btn.classList.remove('border-hairline', 'bg-surface-muted', 'text-ink-secondary');
    } else {
      btn.classList.remove('border-obsidian', 'bg-obsidian', 'text-white');
      btn.classList.add('border-hairline', 'bg-surface-muted', 'text-ink-secondary');
    }
  });

  // 2. Update SKU chip (hide when synthetic SKU)
  const skuWrap = card.querySelector<HTMLElement>('[data-card-sku-wrap]');
  const skuEl = card.querySelector<HTMLElement>('[data-card-sku]');
  if (skuWrap && skuEl) {
    const hasRealSku = Boolean(variant.sku && !variant.isSyntheticSku);
    if (hasRealSku) {
      skuEl.textContent = variant.sku;
    }
    skuWrap.hidden = !hasRealSku;
    skuWrap.classList.toggle('hidden', !hasRealSku);
  }

  // 3. Update Paired Lid SKU chip
  const lidWrap = card.querySelector<HTMLElement>('[data-card-lid-wrap]');
  const lidEl = card.querySelector<HTMLElement>('[data-card-lid-sku]');
  if (lidWrap && lidEl) {
    const hasLid = Boolean(variant.lidSku);
    if (hasLid) {
      lidEl.textContent = variant.lidSku || '';
    }
    lidWrap.hidden = !hasLid;
    lidWrap.classList.toggle('hidden', !hasLid);
  }

  // 4. Update Dimensions / Capacity chip
  const dimsWrap = card.querySelector<HTMLElement>('[data-card-dims-wrap]');
  const dimsEl = card.querySelector<HTMLElement>('[data-card-dims]');
  const dimsText = variant.dimensionsMm || variant.capacity || '';
  if (dimsWrap && dimsEl) {
    const hasDims = Boolean(dimsText);
    if (hasDims) {
      dimsEl.textContent = dimsText;
    }
    dimsWrap.hidden = !hasDims;
    dimsWrap.classList.toggle('hidden', !hasDims);
  }

  // 5. Update Sold by Box badge + metric pop animation
  const boxBadge = card.querySelector<HTMLElement>('[data-card-box-badge]');
  if (boxBadge) {
    boxBadge.textContent = formatSoldByBox(
      lang,
      variant.pcsPerBox,
      variant.orderUnit,
      variant.packUnit
    );
    animateMetricPop(boxBadge);
  }

  // 6. Update image & adaptive plinth if variant has specific image/backdrop
  const nextImgRaw = variant.image || defaultImage;
  const nextBackdrop = variant.photoBackdrop || defaultBackdrop;
  const mediaPlinth = card.querySelector<HTMLElement>('[data-card-media]');
  const imgEl = card.querySelector<HTMLImageElement>('[data-card-img]');

  if (imgEl && nextImgRaw) {
    const resolvedImg = resolveWithBase(nextImgRaw);
    imgEl.dataset.frontSrc = resolvedImg;
    imgEl.dataset.frontBackdrop = nextBackdrop;
    if (mediaPlinth?.dataset.peekOpen !== 'true') {
      imgEl.src = resolvedImg;
    }
  }

  if (mediaPlinth && mediaPlinth.dataset.peekOpen !== 'true') {
    mediaPlinth.dataset.backdrop = nextBackdrop;
    mediaPlinth.classList.toggle('plinth-dark', nextBackdrop === 'dark');
    mediaPlinth.classList.toggle('plinth-light', nextBackdrop !== 'dark');
  }

  // 7. Update Order on WhatsApp button href
  const waBtn = card.querySelector<HTMLAnchorElement>('[data-card-wa]');
  const productRelPath = `${lang}/product/${slug}/`;
  const productUrl = resolveAbsUrl(productRelPath);
  const productName = lang === 'ar' ? nameAr : nameEn;
  const variantLabel = variant.label[lang] || variant.label.en;

  if (waBtn) {
    waBtn.href = buildProductWhatsAppUrl({
      lang,
      productName,
      variantLabel,
      sku: variant.sku,
      isSyntheticSku: variant.isSyntheticSku,
      lidPolicy,
      selectedLidSku: variant.lidSku,
      pcsPerBox: variant.pcsPerBox,
      packUnit: variant.packUnit,
      orderUnit: variant.orderUnit,
      productUrl,
    });
  }

  // 8. Update + Add Box button payload & label
  const addBagBtn = card.querySelector<HTMLElement>('[data-add-bag]');
  if (addBagBtn) {
    addBagBtn.dataset.variantEn = variant.label.en;
    addBagBtn.dataset.variantAr = variant.label.ar;
    addBagBtn.dataset.sku = variant.sku || '';
    addBagBtn.dataset.syntheticSku = variant.isSyntheticSku ? 'true' : 'false';
    addBagBtn.dataset.selectedLidSku = variant.lidSku || '';
    addBagBtn.dataset.pcsPerBox = variant.pcsPerBox != null ? String(variant.pcsPerBox) : '';
    addBagBtn.dataset.packUnit = variant.packUnit || '';
    addBagBtn.dataset.orderUnit = variant.orderUnit || 'box';
    addBagBtn.dataset.image = nextImgRaw;
    addBagBtn.dataset.backdrop = nextBackdrop;

    const labelSpan = addBagBtn.querySelector<HTMLElement>('[data-add-bag-label]');
    if (labelSpan) {
      labelSpan.textContent =
        variant.orderUnit === 'pack' ? ui.actions.addPack : ui.actions.addBox;
    }
  }
}

let delegatedEventsBound = false;

export function initCatalogFilter(): void {
  // Always bind delegated variant-pill & reset clicks once globally
  if (!delegatedEventsBound) {
    delegatedEventsBound = true;
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const variantPill = target.closest<HTMLElement>('[data-variant-pill]');
      if (variantPill) {
        e.preventDefault();
        handleCardVariantSwitch(variantPill);
        return;
      }
    });
  }

  const toolbar = document.querySelector<HTMLElement>('[data-catalog-toolbar]');
  if (!toolbar) return;

  const searchInput = document.getElementById('catalog-search') as HTMLInputElement | null;
  const clearSearchBtn = document.getElementById('catalog-search-clear');
  const visibleCountEl = document.getElementById('catalog-visible-count');
  const emptyStateEl = document.getElementById('catalog-empty-state');
  const catRail = toolbar.querySelector<HTMLElement>('[data-pill-rail]');

  let activeCat = toolbar.dataset.initialCategory || 'all';
  let activeMat = 'all';
  let activeQuery = '';

  // Read URL query parameters on load (?q=, ?cat=, ?mat=)
  const params = new URLSearchParams(window.location.search);
  const qParam = params.get('q');
  const catParam = params.get('cat');
  const matParam = params.get('mat');

  if (qParam && searchInput) {
    searchInput.value = qParam;
    activeQuery = normalizeSearchText(qParam);
  }
  if (catParam && toolbar.querySelector(`[data-cat-filter="${CSS.escape(catParam)}"]`)) {
    activeCat = catParam;
  }
  if (matParam && toolbar.querySelector(`[data-mat-filter="${CSS.escape(matParam)}"]`)) {
    activeMat = matParam;
  }

  function getTargetCards(): HTMLElement[] {
    const scopedGrid = document.querySelector<HTMLElement>('#catalog-grid, [data-catalog-grid]');
    if (scopedGrid) {
      return Array.from(scopedGrid.querySelectorAll<HTMLElement>('[data-product-card]'));
    }
    return Array.from(document.querySelectorAll<HTMLElement>('[data-product-card]'));
  }

  function syncToolbarControls(instantPill = false): void {
    toolbar!.querySelectorAll<HTMLElement>('[data-cat-filter]').forEach((btn) => {
      const isMatch = (btn.dataset.catFilter || 'all') === activeCat;
      btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      btn.classList.toggle('is-active', isMatch);
      btn.classList.toggle('text-white', isMatch);
      btn.classList.toggle('text-ink-secondary', !isMatch);
    });

    if (catRail) {
      syncPillRail(catRail, instantPill);
    }

    toolbar!.querySelectorAll<HTMLElement>('[data-mat-filter]').forEach((btn) => {
      const isMatch = (btn.dataset.matFilter || 'all') === activeMat;
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      if (isMatch) {
        btn.classList.add('border-obsidian', 'bg-obsidian', 'text-white');
        btn.classList.remove('border-hairline', 'bg-surface', 'text-ink-secondary');
      } else {
        btn.classList.remove('border-obsidian', 'bg-obsidian', 'text-white');
        btn.classList.add('border-hairline', 'bg-surface', 'text-ink-secondary');
      }
    });

    if (clearSearchBtn) {
      const hideClear = !searchInput || searchInput.value.trim() === '';
      clearSearchBtn.hidden = hideClear;
      clearSearchBtn.classList.toggle('hidden', hideClear);
    }
  }

  function applyFilters(): void {
    const cards = getTargetCards();
    const lang = getLang();
    const ui = getUI(lang);
    const queryTokens = activeQuery ? activeQuery.split(' ').filter(Boolean) : [];
    let visibleCount = 0;

    cards.forEach((card) => {
      const cardCat = card.dataset.category || '';
      const cardMats = (card.dataset.materials || '')
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter(Boolean);
      const cardSearch = normalizeSearchText(card.dataset.search || '');

      const matchesCat = activeCat === 'all' || cardCat === activeCat;
      const matchesMat =
        activeMat === 'all' || cardMats.includes(activeMat.toLowerCase());
      const matchesQuery =
        queryTokens.length === 0 ||
        queryTokens.every((token) => cardSearch.includes(token));

      const isVisible = matchesCat && matchesMat && matchesQuery;
      card.classList.toggle('hidden', !isVisible);
      if (isVisible) {
        visibleCount += 1;
      }
    });

    // Toggle category group sections if the page organizes cards into [data-category-section]
    document.querySelectorAll<HTMLElement>('[data-category-section]').forEach((section) => {
      const visibleInSection = section.querySelectorAll('[data-product-card]:not(.hidden)').length;
      section.classList.toggle('hidden', visibleInSection === 0);
    });

    if (visibleCountEl) {
      visibleCountEl.textContent = ui.catalog.showingProducts(visibleCount);
    }

    if (emptyStateEl) {
      emptyStateEl.classList.toggle('hidden', visibleCount > 0);
    }

    refreshCardTricks();
  }

  function resetAllFilters(): void {
    activeCat = toolbar!.dataset.initialCategory || 'all';
    activeMat = 'all';
    activeQuery = '';
    if (searchInput) {
      searchInput.value = '';
    }
    syncToolbarControls(false);
    applyFilters();
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      activeQuery = normalizeSearchText(searchInput.value);
      syncToolbarControls(true);
      applyFilters();
    });
  }

  if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      activeQuery = '';
      syncToolbarControls(true);
      applyFilters();
      searchInput.focus();
    });
  }

  toolbar.querySelectorAll<HTMLElement>('[data-cat-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.catFilter || 'all';
      syncToolbarControls(false);
      applyFilters();
    });
  });

  toolbar.querySelectorAll<HTMLElement>('[data-mat-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeMat = btn.dataset.matFilter || 'all';
      syncToolbarControls(true);
      applyFilters();
    });
  });

  document.querySelectorAll<HTMLElement>('[data-reset-filters]').forEach((btn) => {
    btn.addEventListener('click', () => {
      resetAllFilters();
    });
  });

  syncToolbarControls(true);
  applyFilters();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCatalogFilter, { once: true });
  } else {
    initCatalogFilter();
  }
  document.addEventListener('astro:page-load', initCatalogFilter);
}
