import type { Lang } from './url';
import {
  UPACK_CONTACT,
  formatShortBox,
  formatOrderQty,
  type LidPolicy,
  type OrderUnit,
} from './i18n';

export interface SingleOrderPayload {
  lang: Lang;
  productName: string;
  variantLabel?: string;
  sku?: string;
  isSyntheticSku?: boolean;
  lidPolicy?: LidPolicy;
  selectedLidSku?: string;
  pcsPerBox?: number;
  packUnit?: string;
  orderUnit?: OrderUnit;
  productUrl?: string;
}

export interface BagOrderItem {
  productName: string;
  variantLabel?: string;
  sku?: string;
  isSyntheticSku?: boolean;
  lidPolicy?: LidPolicy;
  selectedLidSku?: string;
  pcsPerBox?: number;
  packUnit?: string;
  orderUnit?: OrderUnit;
  quantity: number;
  productUrl?: string;
  isSeparateLid?: boolean;
}

export interface BagOrderPayload {
  lang: Lang;
  items: BagOrderItem[];
  businessName?: string;
  governorate?: string;
  notes?: string;
}

export interface ContactInquiryPayload {
  lang: Lang;
  businessName?: string;
  segment?: string;
  governorate?: string;
  message?: string;
}

export function buildWhatsAppUrl(message: string): string {
  return `${UPACK_CONTACT.whatsappBase}?text=${encodeURIComponent(message)}`;
}

export function buildGeneralWhatsAppUrl(lang: Lang): string {
  const msg =
    lang === 'ar'
      ? 'مرحباً يو-باك، أرغب في الاستفسار عن أسعار الجملة بالكرتونة لمنتجات KRNO للتغليف.'
      : 'Hello U-Pack, I would like to request wholesale box pricing for KRNO packaging products.';
  return buildWhatsAppUrl(msg);
}

function buildLidLine(lang: Lang, lidPolicy?: LidPolicy, selectedLidSku?: string): string | null {
  if (lidPolicy === 'cups-no-lid-separate') {
    if (selectedLidSku) {
      return lang === 'ar'
        ? `• كرتونة الأغطية المنفصلة المختارة: ${selectedLidSku}`
        : `• Separate Lid Box Selected: ${selectedLidSku}`;
    }
    return lang === 'ar'
      ? '• الأغطية: أكواب فقط (الأغطية تُباع بكرتونة منفصلة)'
      : '• Lids: Cups only (lids sold in separate boxes)';
  }
  if (lidPolicy === 'paired-lid-box' && selectedLidSku) {
    return lang === 'ar'
      ? `• العلبة + كرتونة الغطاء المطابق: ${selectedLidSku}`
      : `• Container + Matching Lid Box: ${selectedLidSku}`;
  }
  if (lidPolicy === 'included-set' && selectedLidSku) {
    return lang === 'ar'
      ? `• يشمل الغطاء المطابق: ${selectedLidSku}`
      : `• Includes Matching Lid: ${selectedLidSku}`;
  }
  if (lidPolicy === 'built-in-hinged') {
    return lang === 'ar'
      ? '• النوع: غطاء مفصلي مدمج'
      : '• Lid: Built-in hinged lid';
  }
  if (lidPolicy === 'standalone-lid') {
    return lang === 'ar'
      ? '• النوع: كرتونة أغطية منفصلة'
      : '• Type: Separate lid box';
  }
  if (selectedLidSku) {
    return lang === 'ar'
      ? `• كود الغطاء المطابق: ${selectedLidSku}`
      : `• Paired Lid SKU: ${selectedLidSku}`;
  }
  return null;
}

export function buildProductWhatsAppUrl(payload: SingleOrderPayload): string {
  const {
    lang,
    productName,
    variantLabel,
    sku,
    isSyntheticSku,
    lidPolicy,
    selectedLidSku,
    pcsPerBox,
    packUnit,
    orderUnit = 'box',
    productUrl,
  } = payload;

  const packLine = formatShortBox(lang, pcsPerBox, orderUnit, packUnit);
  const lidLine = buildLidLine(lang, lidPolicy, selectedLidSku);
  const showSku = Boolean(sku && !isSyntheticSku);

  const lines: (string | null)[] =
    lang === 'ar'
      ? [
          'مرحباً يو-باك، أرغب في عرض سعر جملة للمنتج التالي:',
          `• المنتج: ${productName}`,
          variantLabel ? `• المقاس / النوع: ${variantLabel}` : null,
          showSku ? `• كود الصنف (SKU): ${sku}` : null,
          lidLine,
          `• التعبئة: ${packLine}`,
          productUrl ? productUrl : null,
        ]
      : [
          'Hello U-Pack, I would like a wholesale quote for:',
          `• Product: ${productName}`,
          variantLabel ? `• Option: ${variantLabel}` : null,
          showSku ? `• SKU: ${sku}` : null,
          lidLine,
          `• Packing: ${packLine}`,
          productUrl ? productUrl : null,
        ];

  return buildWhatsAppUrl(lines.filter(Boolean).join('\n'));
}

export function buildQuoteBagWhatsAppUrl(payload: BagOrderPayload): string {
  const { lang, items, businessName, governorate, notes } = payload;
  const lines: string[] = [];

  if (lang === 'ar') {
    lines.push('مرحباً يو-باك، أرغب في عرض سعر جملة للأصناف التالية:');
    if (businessName?.trim()) lines.push(`• النشاط التجاري: ${businessName.trim()}`);
    if (governorate?.trim()) lines.push(`• المحافظة / المدينة: ${governorate.trim()}`);
    if (notes?.trim()) lines.push(`• ملاحظات: ${notes.trim()}`);
    lines.push('');
  } else {
    lines.push('Hello U-Pack, I would like a wholesale quote for these items:');
    if (businessName?.trim()) lines.push(`• Business: ${businessName.trim()}`);
    if (governorate?.trim()) lines.push(`• City / Governorate: ${governorate.trim()}`);
    if (notes?.trim()) lines.push(`• Notes: ${notes.trim()}`);
    lines.push('');
  }

  items.forEach((item, idx) => {
    const unit = item.orderUnit || 'box';
    const qtyText = formatOrderQty(lang, item.quantity, unit);
    const packText = formatShortBox(lang, item.pcsPerBox, unit, item.packUnit);
    const skuParts: string[] = [];
    if (item.sku && !item.isSyntheticSku) skuParts.push(item.sku);
    if (item.selectedLidSku) {
      skuParts.push(
        lang === 'ar'
          ? `غطاء ${item.selectedLidSku}`
          : `Lid ${item.selectedLidSku}`
      );
    }
    const skuText = skuParts.length ? ` (${skuParts.join(' + ')})` : '';
    const lidTag = item.isSeparateLid
      ? (lang === 'ar' ? ' [كرتونة أغطية منفصلة]' : ' [Separate Lid Box]')
      : '';

    const variantPart = item.variantLabel ? ` — ${item.variantLabel}` : '';
    lines.push(`${idx + 1}. ${item.productName}${variantPart}${skuText}${lidTag} | ${packText} × ${qtyText}`);
    if (item.productUrl) {
      lines.push(`   ${item.productUrl}`);
    }
  });

  return buildWhatsAppUrl(lines.join('\n'));
}

export function buildContactWhatsAppUrl(payload: ContactInquiryPayload): string {
  const { lang, businessName, segment, governorate, message } = payload;
  const lines: (string | null)[] =
    lang === 'ar'
      ? [
          'مرحباً يو-باك، أرغب في التواصل بخصوص توريد عبوات تغليف بالجملة:',
          businessName?.trim() ? `• اسم النشاط: ${businessName.trim()}` : null,
          segment?.trim() ? `• نوع النشاط: ${segment.trim()}` : null,
          governorate?.trim() ? `• المحافظة / المدينة: ${governorate.trim()}` : null,
          message?.trim() ? `• التفاصيل: ${message.trim()}` : null,
        ]
      : [
          'Hello U-Pack, I would like to inquire about wholesale food packaging supply:',
          businessName?.trim() ? `• Business Name: ${businessName.trim()}` : null,
          segment?.trim() ? `• Business Type: ${segment.trim()}` : null,
          governorate?.trim() ? `• City / Governorate: ${governorate.trim()}` : null,
          message?.trim() ? `• Details: ${message.trim()}` : null,
        ];

  return buildWhatsAppUrl(lines.filter(Boolean).join('\n'));
}
