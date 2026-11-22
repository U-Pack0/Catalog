export type Lang = 'en' | 'ar';

export type LidPolicy =
  | 'built-in-hinged'
  | 'included-set'
  | 'paired-lid-box'
  | 'cups-no-lid-separate'
  | 'standalone-lid'
  | 'no-lid';

export type OrderUnit = 'box' | 'carton' | 'pack';

export type MaterialCode = 'PET' | 'PP' | 'PS' | 'Wood' | 'Mixed';

export type PhotoBackdrop = 'dark' | 'light';

export type DessertGroup = 'ps-trays' | 'ps-serving' | 'cake-bakery' | 'cups-bowls' | 'sweet-yogurt';

export interface BilingualText {
  en: string;
  ar: string;
}

export interface ClientLogo {
  id: string;
  name: BilingualText;
  image: string;
}

export interface Category {
  slug: string;
  name: BilingualText;
  description: BilingualText;
  seoKeywords: {
    en: string[];
    ar: string[];
  };
  image: string;
  photoBackdrop: PhotoBackdrop;
  count: number;
  variantCount: number;
  order: number;
  isDessertPriority?: boolean;
}

export interface LidSpec {
  sku: string;
  label: BilingualText;
  material: MaterialCode;
  dimensionsMm?: string;
  weightG?: number;
  pcsPerBox?: number;
  cartonSizeCm?: string;
  cbm?: number;
  color?: BilingualText;
  image?: string;
  photoBackdrop?: PhotoBackdrop;
  pdfPage?: number;
}

export interface ProductVariant {
  sku: string;
  altSkus?: string[];
  isSyntheticSku?: boolean;
  label: BilingualText;
  capacity?: string;
  dimensionsMm?: string;
  weightG?: number;
  pcsPerBox?: number;
  /** Alias preserved for legacy spec-table consumers */
  pcsPerCarton?: number;
  orderUnit: OrderUnit;
  packUnit?: string;
  cartonSizeCm?: string;
  cbm?: number;
  color?: BilingualText;
  lidSku?: string;
  lidSpecs?: BilingualText;
  image?: string;
  openImage?: string;
  photoBackdrop?: PhotoBackdrop;
  pdfPage?: number;
}

export interface ProductFamily {
  slug: string;
  category: string;
  source: 'pdf' | 'legacy';
  name: BilingualText;
  subtitle: BilingualText;
  description: BilingualText;
  material: MaterialCode[];
  image: string;
  ogImage: string;
  openImage?: string;
  openImageBackdrop?: PhotoBackdrop;
  gallery?: {
    src: string;
    backdrop: PhotoBackdrop;
    label: BilingualText;
  }[];
  photoBackdrop: PhotoBackdrop;
  featured?: boolean;
  isDessertFeatured?: boolean;
  dessertGroup?: DessertGroup;
  hasLidIncluded: boolean;
  lidPolicy: LidPolicy;
  compatibleLids?: LidSpec[];
  separateLidOptions?: LidSpec[];
  tags: string[];
  variants: ProductVariant[];
}

export interface HeroShowcaseItem {
  slug: string;
  category: string;
  name: BilingualText;
  tag: BilingualText;
  boxCount: BilingualText;
  image: string;
  photoBackdrop: PhotoBackdrop;
}

export interface CatalogData {
  generatedAt: string;
  brand: {
    name: BilingualText;
    tagline: BilingualText;
    phone: string;
    phoneIntl: string;
    whatsappBase: string;
    emails: string[];
    delivery: BilingualText;
    logoWebp: string;
    logoJpg: string;
    krnoLogoWebp: string;
    krnoLogoPng: string;
  };
  stats: {
    categories: number;
    families: number;
    displayVariants: number;
    embeddedLidSkus: number;
    totalUniqueSkus: number;
    dessertFamilies: number;
  };
  heroShowcase: HeroShowcaseItem[];
  clients: ClientLogo[];
  categories: Category[];
  products: ProductFamily[];
}
