import { absUrl, localePath, type Lang } from './url';
import { UPACK_CONTACT, type LidPolicy } from './i18n';

export const EGYPT_SEO_KEYWORDS: Record<Lang, string[]> = {
  en: [
    'KRNO distributor Egypt',
    'wholesale dessert packaging Egypt',
    'patisserie dessert trays Cairo',
    'cake boxes with dome lid Egypt',
    'disposable food packaging Egypt',
    'crystal PET clear cold cups wholesale Egypt',
    'separate PET cup lids 92mm Egypt',
    'microwave PP meal containers Egypt',
    'hinged PET takeaway boxes wholesale',
    'sushi trays salad bowls B2B Egypt',
  ],
  ar: [
    'موزع KRNO مصر',
    'تغليف حلويات وباتيسيري جملة مصر',
    'صواني حلويات PS جملة القاهرة',
    'علب كيك وتورت بغطاء بومبيه مصر',
    'عبوات تغليف مطاعم وكافيهات جملة',
    'أكواب بلاستيك شفافة PET جملة مصر',
    'أغطية أكواب PET 92 مم منفصلة',
    'علب وجبات مايكروويف سوداء PP',
    'علب مفصلة وأمان PET جملة',
    'بولات ريزو وشوربة وعلب سوشي جملة مصر',
  ],
};

export function buildOrganizationJsonLd(lang: Lang, site?: URL | string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: lang === 'ar' ? UPACK_CONTACT.brandAr : UPACK_CONTACT.brandEn,
    alternateName: lang === 'ar' ? UPACK_CONTACT.brandEn : UPACK_CONTACT.brandAr,
    description:
      lang === 'ar'
        ? 'موزع KRNO في مصر لتوريد عبوات تغليف الحلويات والمطاعم والكافيهات بالكرتونة مع توصيل لجميع محافظات مصر.'
        : 'KRNO Distributor in Egypt supplying wholesale dessert packaging, cake boxes, crystal PET cups, microwave PP meal containers, and hinged trays sold by the box nationwide.',
    url: absUrl(localePath(lang), site),
    logo: absUrl('/images/brand/upack-logo.jpg', site),
    areaServed: {
      '@type': 'Country',
      name: 'Egypt',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: UPACK_CONTACT.phoneIntl,
        contactType: 'sales',
        areaServed: 'EG',
        availableLanguage: ['Arabic', 'English'],
        email: UPACK_CONTACT.emails[0],
      },
      {
        '@type': 'ContactPoint',
        telephone: UPACK_CONTACT.phoneIntl,
        contactType: 'customer service',
        areaServed: 'EG',
        availableLanguage: ['Arabic', 'English'],
        email: UPACK_CONTACT.emails[1],
      },
    ],
  };
}

export function buildWebSiteJsonLd(lang: Lang, site?: URL | string): Record<string, unknown> {
  const catalogAbs = absUrl(localePath(lang, 'catalog'), site);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name:
      lang === 'ar'
        ? `${UPACK_CONTACT.brandAr} — ${UPACK_CONTACT.krnoTagline.ar}`
        : `${UPACK_CONTACT.brandEn} — ${UPACK_CONTACT.krnoTagline.en}`,
    url: absUrl(localePath(lang), site),
    inLanguage: lang === 'ar' ? 'ar-EG' : 'en-EG',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${catalogAbs}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function buildBreadcrumbJsonLd(
  items: { name: string; url: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildItemListJsonLd(
  name: string,
  items: { name: string; url: string; image?: string }[]
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      url: item.url,
      ...(item.image ? { image: item.image } : {}),
    })),
  };
}

export interface ProductSeoInput {
  name: string;
  description: string;
  url: string;
  images: string[];
  categoryName: string;
  materials: string[];
  sku?: string;
  isSyntheticSku?: boolean;
  pcsPerBox?: number;
  packUnit?: string;
  dimensionsMm?: string;
  lidPolicy?: LidPolicy;
  lidSku?: string;
  brandName?: string;
}

export function buildProductJsonLd(input: ProductSeoInput): Record<string, unknown> {
  const additionalProperty: Record<string, unknown>[] = [];

  if (input.pcsPerBox) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'Pieces Per Box',
      value: `${input.pcsPerBox} pcs/box`,
    });
  } else if (input.packUnit) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'Box Packing',
      value: input.packUnit,
    });
  }

  if (input.dimensionsMm) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name: 'Dimensions',
      value: input.dimensionsMm,
    });
  }

  if (input.lidSku) {
    additionalProperty.push({
      '@type': 'PropertyValue',
      name:
        input.lidPolicy === 'cups-no-lid-separate'
          ? 'Compatible Separate Lid SKU'
          : 'Matching Lid SKU',
      value: input.lidSku,
    });
  }

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: input.name,
    description: input.description,
    url: input.url,
    image: input.images,
    category: input.categoryName,
    material: input.materials.join(', '),
    brand: {
      '@type': 'Brand',
      name: input.brandName || 'KRNO',
    },
  };

  if (input.sku && !input.isSyntheticSku) {
    schema.sku = input.sku;
    schema.mpn = input.sku;
  }

  if (additionalProperty.length > 0) {
    schema.additionalProperty = additionalProperty;
  }

  return schema;
}
