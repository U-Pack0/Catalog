import type { BilingualText, PhotoBackdrop } from '../data/catalog.schema';
import { getUI, type LidPolicy, type OrderUnit } from './i18n';
import type { Lang } from './url';

export const QUOTE_BAG_STORAGE_KEY = 'upack_quote_bag_v1';
export const QUOTE_BUYER_STORAGE_KEY = 'upack_quote_buyer_v1';

export interface QuoteBagEntry {
  key: string;
  slug: string;
  productName: BilingualText;
  variantLabel: BilingualText;
  sku: string;
  isSyntheticSku?: boolean;
  lidPolicy: LidPolicy;
  selectedLidSku?: string;
  pcsPerBox?: number;
  packUnit?: string;
  orderUnit: OrderUnit;
  quantity: number;
  image: string;
  photoBackdrop: PhotoBackdrop;
  productPath: {
    en: string;
    ar: string;
  };
  isSeparateLid?: boolean;
}

export interface QuoteBuyerInfo {
  businessName: string;
  governorate: string;
}

function getActiveLang(): Lang {
  if (typeof document === 'undefined') return 'en';
  return document.documentElement.lang === 'ar' ? 'ar' : 'en';
}

export function buildBagEntryKey(entry: {
  slug: string;
  sku?: string;
  variantLabel: BilingualText;
  selectedLidSku?: string;
  isSeparateLid?: boolean;
}): string {
  const idPart = entry.sku || entry.variantLabel.en || 'default';
  const lidPart = entry.selectedLidSku || '';
  const typePart = entry.isSeparateLid ? 'lid' : 'box';
  return `${entry.slug}::${idPart}::${lidPart}::${typePart}`;
}

export function getQuoteBag(): QuoteBagEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUOTE_BAG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QuoteBagEntry =>
        Boolean(item && typeof item === 'object' && typeof item.key === 'string' && typeof item.slug === 'string')
    );
  } catch {
    return [];
  }
}

export function getTotalBagBoxes(items?: QuoteBagEntry[]): number {
  const list = items ?? getQuoteBag();
  return list.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
}

export function syncBagBadges(items?: QuoteBagEntry[]): void {
  if (typeof document === 'undefined') return;
  const list = items ?? getQuoteBag();
  const total = getTotalBagBoxes(list);
  const badges = document.querySelectorAll<HTMLElement>('[data-bag-count]');
  badges.forEach((badge) => {
    badge.textContent = String(total);
    badge.dataset.empty = total === 0 ? 'true' : 'false';
  });

  const liveRegion = document.getElementById('bag-live-status');
  if (liveRegion) {
    const lang = getActiveLang();
    const ui = getUI(lang);
    liveRegion.textContent = ui.bag.liveStatus(total);
  }
}

let toastTimer: number | null = null;

export function showToast(message: string): void {
  if (typeof document === 'undefined') return;
  const toastEl = document.getElementById('upack-toast');
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.classList.add('is-visible');

  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
  }
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastTimer = null;
  }, 2600);
}

export function saveQuoteBag(items: QuoteBagEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUOTE_BAG_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors in private mode
  }
  syncBagBadges(items);
  window.dispatchEvent(
    new CustomEvent('upack:bag-updated', {
      detail: {
        items,
        total: getTotalBagBoxes(items),
      },
    })
  );
}

export function addToQuoteBag(
  entry: Omit<QuoteBagEntry, 'key' | 'quantity'> & { quantity?: number }
): QuoteBagEntry[] {
  const items = getQuoteBag();
  const key = buildBagEntryKey(entry);
  const addQty = Math.max(1, Number(entry.quantity) || 1);
  const existingIndex = items.findIndex((item) => item.key === key);

  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...items[existingIndex],
      quantity: items[existingIndex].quantity + addQty,
    };
  } else {
    items.push({
      ...entry,
      key,
      quantity: addQty,
    });
  }

  saveQuoteBag(items);

  if (typeof document !== 'undefined') {
    const lang = getActiveLang();
    const ui = getUI(lang);
    const displayName = entry.productName[lang] || entry.productName.en;
    const variantPart = entry.variantLabel[lang] || entry.variantLabel.en;
    const label = variantPart ? `${displayName} (${variantPart})` : displayName;
    showToast(ui.bag.addedToast(label));
  }

  return items;
}

export function updateBagQuantity(
  key: string,
  deltaOrQty: number,
  isDelta = true
): QuoteBagEntry[] {
  const items = getQuoteBag();
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return items;

  const nextQty = isDelta ? items[index].quantity + deltaOrQty : deltaOrQty;
  if (nextQty <= 0) {
    items.splice(index, 1);
  } else {
    items[index] = {
      ...items[index],
      quantity: Math.min(999, nextQty),
    };
  }

  saveQuoteBag(items);
  return items;
}

export function removeFromQuoteBag(key: string): QuoteBagEntry[] {
  const items = getQuoteBag().filter((item) => item.key !== key);
  saveQuoteBag(items);
  return items;
}

export function clearQuoteBag(): QuoteBagEntry[] {
  saveQuoteBag([]);
  return [];
}

export function getBuyerInfo(): QuoteBuyerInfo {
  if (typeof window === 'undefined') {
    return { businessName: '', governorate: '' };
  }
  try {
    const raw = window.localStorage.getItem(QUOTE_BUYER_STORAGE_KEY);
    if (!raw) return { businessName: '', governorate: '' };
    const parsed = JSON.parse(raw);
    return {
      businessName: typeof parsed?.businessName === 'string' ? parsed.businessName : '',
      governorate: typeof parsed?.governorate === 'string' ? parsed.governorate : '',
    };
  } catch {
    return { businessName: '', governorate: '' };
  }
}

export function saveBuyerInfo(info: Partial<QuoteBuyerInfo>): void {
  if (typeof window === 'undefined') return;
  const current = getBuyerInfo();
  const updated: QuoteBuyerInfo = {
    businessName: info.businessName !== undefined ? info.businessName : current.businessName,
    governorate: info.governorate !== undefined ? info.governorate : current.governorate,
  };
  try {
    window.localStorage.setItem(QUOTE_BUYER_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}
