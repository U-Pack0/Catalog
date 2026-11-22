import type { Lang } from './url';

export type LidPolicy =
  | 'built-in-hinged'
  | 'included-set'
  | 'paired-lid-box'
  | 'cups-no-lid-separate'
  | 'standalone-lid'
  | 'no-lid';

export type OrderUnit = 'box' | 'carton' | 'pack';

export const UPACK_CONTACT = {
  brandEn: 'U-Pack for Trading',
  brandAr: 'يو-باك للتجارة',
  krnoTagline: {
    en: 'KRNO Distributor',
    ar: 'موزع KRNO',
  },
  phone: '01055400404',
  phoneIntl: '+201055400404',
  telHref: 'tel:+201055400404',
  whatsappBase: 'https://wa.me/201055400404',
  emails: ['Khodeirmostafa80@gmail.com', 'soliman.lashien@gmail.com'] as const,
  delivery: {
    en: 'Nationwide Delivery Across All of Egypt',
    ar: 'توصيل لجميع محافظات مصر',
  },
} as const;

export interface UIDictionary {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  brandName: string;
  brandSub: string;
  krnoDistributor: string;
  deliveryNationwide: string;
  skipToContent: string;
  switchLangLabel: string;
  switchLangAria: string;
  nav: {
    home: string;
    dessert: string;
    catalog: string;
    about: string;
    contact: string;
    openMenu: string;
    closeMenu: string;
  };
  actions: {
    callNow: string;
    orderWhatsApp: string;
    addBox: string;
    addPack: string;
    addLidBox: string;
    quoteBag: string;
    viewCatalog: string;
    viewDessert: string;
    viewDetails: string;
    peekInside: string;
    viewClosed: string;
    resetFilters: string;
    backToTop: string;
    copyLink: string;
    shareProduct: string;
  };
  lidBadges: Record<LidPolicy, string>;
  lidNotes: Record<LidPolicy, string>;
  catalog: {
    searchPlaceholder: string;
    searchLabel: string;
    clearSearch: string;
    allCategories: string;
    allMaterials: string;
    soldByBoxBanner: string;
    skuLabel: string;
    lidSkuLabel: string;
    materialLabel: string;
    dimensionsLabel: string;
    weightLabel: string;
    colorLabel: string;
    cartonSizeLabel: string;
    cbmLabel: string;
    boxPackingLabel: string;
    chooseVariant: string;
    separateLidsHeading: string;
    separateLidsNote: string;
    relatedHeading: string;
    emptyTitle: string;
    emptyLead: string;
    showingProducts: (count: number) => string;
  };
  dessert: {
    sectionTitle: string;
    sectionLead: string;
    tabAll: string;
    tabPsTrays: string;
    tabCakeBakery: string;
    tabCupsBowls: string;
    tabSweetYogurt: string;
    mostRequestedBadge: string;
  };
  bag: {
    title: string;
    closeAria: string;
    emptyTitle: string;
    emptyLead: string;
    businessPlaceholder: string;
    cityPlaceholder: string;
    notesPlaceholder: string;
    totalLabel: string;
    sendWhatsApp: string;
    clearBag: string;
    removeItemAria: string;
    decreaseQtyAria: string;
    increaseQtyAria: string;
    separateLidTag: string;
    addedToast: (name: string) => string;
    liveStatus: (count: number) => string;
  };
  clients: {
    title: string;
    lead: string;
  };
  wholesale: {
    title: string;
    lead: string;
    whatsappBtn: string;
    callBtn: string;
  };
  footer: {
    description: string;
    navigationTitle: string;
    salesTitle: string;
    emailsTitle: string;
    copyright: string;
  };
  seo: {
    siteTitle: string;
    defaultDescription: string;
    homeTitle: string;
    catalogTitle: string;
    catalogDescription: string;
    aboutTitle: string;
    aboutDescription: string;
    contactTitle: string;
    contactDescription: string;
  };
  notFound: {
    title: string;
    lead: string;
    ctaCatalog: string;
    ctaHome: string;
  };
}

const EN_UI: UIDictionary = {
  lang: 'en',
  dir: 'ltr',
  brandName: 'U-Pack for Trading',
  brandSub: 'KRNO Distributor · Egypt',
  krnoDistributor: 'KRNO Distributor',
  deliveryNationwide: 'Nationwide Delivery Across All of Egypt',
  skipToContent: 'Skip to main content',
  switchLangLabel: 'العربية',
  switchLangAria: 'Switch to Arabic',
  nav: {
    home: 'Home',
    dessert: 'Dessert',
    catalog: 'Full Catalog',
    about: 'About',
    contact: 'Contact',
    openMenu: 'Open navigation menu',
    closeMenu: 'Close navigation menu',
  },
  actions: {
    callNow: 'Call 01055400404',
    orderWhatsApp: 'Order on WhatsApp',
    addBox: '+ Add Box',
    addPack: '+ Add Pack',
    addLidBox: '+ Add Lid Box',
    quoteBag: 'Quote Bag',
    viewCatalog: 'Browse Full Catalog',
    viewDessert: 'Explore Dessert Packaging',
    viewDetails: 'Full Specs',
    peekInside: 'Peek Inside',
    viewClosed: 'With Lid',
    resetFilters: 'Reset Filters',
    backToTop: 'Back to top',
    copyLink: 'Copy Product Link',
    shareProduct: 'Share',
  },
  lidBadges: {
    'cups-no-lid-separate': 'Cups Only — Lids Sold Separately',
    'built-in-hinged': 'Built-in Hinged Lid',
    'included-set': 'Container + Lid Included',
    'paired-lid-box': 'Lid Sold in Matching Box',
    'standalone-lid': 'Separate Lid Box',
    'no-lid': 'No Lid Required',
  },
  lidNotes: {
    'cups-no-lid-separate': 'Cup boxes contain cups only. Compatible lids are supplied in separate boxes below.',
    'built-in-hinged': 'One-piece hinged container with built-in snap lid.',
    'included-set': 'Container and matching lid are supplied together.',
    'paired-lid-box': 'Container base and matching lid are supplied in matched master boxes.',
    'standalone-lid': 'Standalone lid box compatible with matching KRNO cup rims.',
    'no-lid': 'Tableware or accessory item supplied without a lid.',
  },
  catalog: {
    searchPlaceholder: 'Search by product name, SKU, lid code, size, or material...',
    searchLabel: 'Search products, SKUs, or categories',
    clearSearch: 'Clear search',
    allCategories: 'All Products',
    allMaterials: 'All Materials',
    soldByBoxBanner: 'Wholesale Supply · Sold by Box / Carton · Nationwide Egypt Delivery',
    skuLabel: 'SKU',
    lidSkuLabel: 'Paired Lid',
    materialLabel: 'Material',
    dimensionsLabel: 'Dimensions',
    weightLabel: 'Piece Weight',
    colorLabel: 'Color',
    cartonSizeLabel: 'Box Dimensions',
    cbmLabel: 'CBM',
    boxPackingLabel: 'Box Packing',
    chooseVariant: 'Select Size / Option',
    separateLidsHeading: 'Compatible Lids (Sold Separately by Box)',
    separateLidsNote: 'Cup boxes do not include lids. Add matching lid boxes directly to your quote below.',
    relatedHeading: 'More in This Category',
    emptyTitle: 'No matching products found',
    emptyLead: 'Try a different SKU, product name, or clear your active filters.',
    showingProducts: (count) => `Showing ${count} ${count === 1 ? 'product family' : 'product families'}`,
  },
  dessert: {
    sectionTitle: 'Most Requested Products',
    sectionLead: 'Our fastest-moving wholesale box lines for Egyptian restaurants, cafés, and pâtisseries — PS crystal items, microwave meals & soup bowls, U-Shape cups, and meal cutlery.',
    tabAll: 'All Most Requested',
    tabPsTrays: 'PS Items',
    tabCakeBakery: 'Microwave Meals, Rizo & Soup',
    tabCupsBowls: 'U-Shape Cups',
    tabSweetYogurt: 'Meal Cutlery',
    mostRequestedBadge: 'Most Requested',
  },
  bag: {
    title: 'WhatsApp Quote Bag',
    closeAria: 'Close Quote Bag',
    emptyTitle: 'Your Quote Bag is empty',
    emptyLead: 'Tap "+ Add Box" on any product or separate lid box to send a combined wholesale quote on WhatsApp.',
    businessPlaceholder: 'Restaurant / Café / Brand name (optional)',
    cityPlaceholder: 'City / Governorate in Egypt (optional)',
    notesPlaceholder: 'Extra notes (optional)',
    totalLabel: 'Total Quote Order',
    sendWhatsApp: 'Send Quote on WhatsApp (01055400404)',
    clearBag: 'Clear Bag',
    removeItemAria: 'Remove item from Quote Bag',
    decreaseQtyAria: 'Decrease quantity',
    increaseQtyAria: 'Increase quantity',
    separateLidTag: 'Separate Lid Box',
    addedToast: (name) => `Added ${name} to your Quote Bag`,
    liveStatus: (count) => `${count} ${count === 1 ? 'item' : 'items'} in Quote Bag`,
  },
  clients: {
    title: 'Our Clients',
    lead: 'Restaurants, cafés, pâtisseries, and food & beverage brands across Egypt packing their daily orders with U-Pack.',
  },
  wholesale: {
    title: 'Order Master Boxes Direct on WhatsApp',
    lead: 'Fast wholesale quotes for restaurants, cafés, pâtisseries, and cloud kitchens with nationwide delivery across all of Egypt.',
    whatsappBtn: 'WhatsApp 01055400404',
    callBtn: 'Call 01055400404',
  },
  footer: {
    description: 'KRNO Distributor in Egypt supplying food-grade PET cups, dessert & cake packaging, microwave PP meal trays, and hinged containers by the box across all governorates.',
    navigationTitle: 'Explore',
    salesTitle: 'Sales & WhatsApp',
    emailsTitle: 'Email',
    copyright: '© 2026 U-Pack for Trading',
  },
  seo: {
    siteTitle: 'U-Pack for Trading | KRNO Distributor Egypt',
    defaultDescription: 'U-Pack for Trading — KRNO Distributor in Egypt. Wholesale dessert packaging, cake boxes, crystal PET cold cups, separate cup lids, microwave PP meal containers, and hinged trays sold by the box with nationwide Egypt delivery. Call or WhatsApp 01055400404.',
    homeTitle: 'U-Pack for Trading — KRNO Distributor | Wholesale Food & Dessert Packaging Egypt',
    catalogTitle: 'Full Wholesale Catalog | U-Pack for Trading — KRNO Distributor Egypt',
    catalogDescription: 'Browse all KRNO food-service & dessert packaging boxes in Egypt: PET cold cups, separate lids, PS dessert trays, cake domes, microwave PP meal boxes, sushi trays, and cutlery. Order on WhatsApp 01055400404.',
    aboutTitle: 'About U-Pack for Trading | KRNO Distributor in Egypt',
    aboutDescription: 'Learn about U-Pack for Trading, KRNO Distributor supplying restaurants, cafés, and pâtisseries nationwide across Egypt with food-grade packaging sold by the box.',
    contactTitle: 'Wholesale Orders & Contact | U-Pack for Trading — 01055400404',
    contactDescription: 'Request wholesale packaging box quotes via WhatsApp or phone at 01055400404 with nationwide Egypt delivery.',
  },
  notFound: {
    title: 'Page not found',
    lead: 'The product or page you requested may have moved. Browse the complete KRNO packaging catalog below.',
    ctaCatalog: 'Open Full Catalog',
    ctaHome: 'Back to Home',
  },
};

const AR_UI: UIDictionary = {
  lang: 'ar',
  dir: 'rtl',
  brandName: 'يو-باك للتجارة',
  brandSub: 'موزع KRNO · مصر',
  krnoDistributor: 'موزع KRNO',
  deliveryNationwide: 'توصيل لجميع محافظات مصر',
  skipToContent: 'الانتقال إلى المحتوى الرئيسي',
  switchLangLabel: 'EN',
  switchLangAria: 'Switch to English',
  nav: {
    home: 'الرئيسية',
    dessert: 'قسم الحلويات',
    catalog: 'الكتالوج الكامل',
    about: 'عن يو-باك',
    contact: 'تواصل معنا',
    openMenu: 'فتح قائمة التنقل',
    closeMenu: 'إغلاق قائمة التنقل',
  },
  actions: {
    callNow: 'اتصل 01055400404',
    orderWhatsApp: 'اطلب عبر واتساب',
    addBox: '+ أضف كرتونة',
    addPack: '+ أضف عبوة',
    addLidBox: '+ أضف كرتونة أغطية',
    quoteBag: 'سلة الطلبات',
    viewCatalog: 'تصفح الكتالوج الكامل',
    viewDessert: 'تصفح قسم الحلويات',
    viewDetails: 'المواصفات الكاملة',
    peekInside: 'عرض الداخل',
    viewClosed: 'بالغطاء',
    resetFilters: 'إعادة ضبط الفلاتر',
    backToTop: 'العودة للأعلى',
    copyLink: 'نسخ رابط المنتج',
    shareProduct: 'مشاركة',
  },
  lidBadges: {
    'cups-no-lid-separate': 'أكواب فقط — الأغطية تُباع منفصلة',
    'built-in-hinged': 'غطاء مفصلي مدمج',
    'included-set': 'علبة + غطاء معاً',
    'paired-lid-box': 'الغطاء بكرتونة منفصلة',
    'standalone-lid': 'كرتونة أغطية منفصلة',
    'no-lid': 'بدون غطاء',
  },
  lidNotes: {
    'cups-no-lid-separate': 'كرتونة الأكواب تحتوي على الأكواب فقط. الأغطية المطابقة متوفرة بكراتين منفصلة أدناه.',
    'built-in-hinged': 'علبة قطعة واحدة بغطاء مفصلي مدمج محكم الغلق.',
    'included-set': 'العلبة والغطاء المطابق متوفران معاً.',
    'paired-lid-box': 'قاعدة العلبة والغطاء المطابق يُورّدان بكراتين متطابقة.',
    'standalone-lid': 'كرتونة أغطية منفصلة مطابقة لمقاس فوهة أكواب كرنو.',
    'no-lid': 'صنف أدوات مائدة أو إكسسوارات بدون غطاء.',
  },
  catalog: {
    searchPlaceholder: 'ابحث باسم المنتج، كود SKU، كود الغطاء، المقاس، أو الخامة...',
    searchLabel: 'ابحث في المنتجات والأكواد والتصنيفات',
    clearSearch: 'مسح البحث',
    allCategories: 'كل المنتجات',
    allMaterials: 'كل الخامات',
    soldByBoxBanner: 'توريد بالجملة · البيع بالكرتونة · توصيل لجميع محافظات مصر',
    skuLabel: 'الكود',
    lidSkuLabel: 'الغطاء المطابق',
    materialLabel: 'الخامة',
    dimensionsLabel: 'الأبعاد',
    weightLabel: 'وزن القطعة',
    colorLabel: 'اللون',
    cartonSizeLabel: 'أبعاد الكرتونة',
    cbmLabel: 'الحجم (CBM)',
    boxPackingLabel: 'التعبئة بالكرتونة',
    chooseVariant: 'اختر المقاس / النوع',
    separateLidsHeading: 'الأغطية المطابقة (تُباع بكرتونة منفصلة)',
    separateLidsNote: 'كراتين الأكواب لا تشمل الأغطية — أضف كرتونة الأغطية المطابقة مباشرة إلى طلبك أدناه.',
    relatedHeading: 'المزيد في هذا التصنيف',
    emptyTitle: 'لا توجد منتجات مطابقة',
    emptyLead: 'جرّب البحث بكود SKU أو اسم آخر أو أعد ضبط الفلاتر.',
    showingProducts: (count) => `عرض ${count} خط منتج`,
  },
  dessert: {
    sectionTitle: 'المنتجات الأكثر طلباً',
    sectionLead: 'الأصناف الأكثر سحباً للمطاعم والكافيهات ومحلات الحلويات في مصر — منتجات PS الكريستال، علب الوجبات والمايكروويف والريزو والشوربة، أكواب U-Shape، وأدوات المائدة.',
    tabAll: 'كل الأكثر طلباً',
    tabPsTrays: 'منتجات PS الكريستال',
    tabCakeBakery: 'الوجبات والمايكروويف والريزو والشوربة',
    tabCupsBowls: 'أكواب U-Shape',
    tabSweetYogurt: 'أدوات مائدة الوجبات',
    mostRequestedBadge: 'الأكثر طلباً',
  },
  bag: {
    title: 'سلة عرض سعر واتساب',
    closeAria: 'إغلاق سلة الطلبات',
    emptyTitle: 'سلة الطلبات فارغة حالياً',
    emptyLead: 'اضغط «+ أضف كرتونة» على أي منتج أو كرتونة أغطية لتجميع طلبك في رسالة واتساب واحدة.',
    businessPlaceholder: 'اسم المطعم / الكافيه / المحل (اختياري)',
    cityPlaceholder: 'المحافظة / المدينة في مصر (اختياري)',
    notesPlaceholder: 'ملاحظات إضافية (اختياري)',
    totalLabel: 'إجمالي الطلب',
    sendWhatsApp: 'إرسال الطلب عبر واتساب (01055400404)',
    clearBag: 'تفريغ السلة',
    removeItemAria: 'حذف الصنف من السلة',
    decreaseQtyAria: 'تقليل الكمية',
    increaseQtyAria: 'زيادة الكمية',
    separateLidTag: 'كرتونة أغطية منفصلة',
    addedToast: (name) => `تمت إضافة ${name} إلى سلة الطلبات`,
    liveStatus: (count) => `سلة الطلبات تحتوي على ${count} أصناف`,
  },
  clients: {
    title: 'عملاؤنا',
    lead: 'نخبة من المطاعم والكافيهات ومحلات الحلويات في مصر يعتمدون على عبوات يو-باك في طلباتهم اليومية.',
  },
  wholesale: {
    title: 'اطلب كراتين الجملة مباشرة عبر واتساب',
    lead: 'عروض أسعار سريعة للمطاعم والكافيهات ومحلات الحلويات والمطابخ السحابية مع توصيل لجميع محافظات مصر.',
    whatsappBtn: 'واتساب 01055400404',
    callBtn: 'اتصل 01055400404',
  },
  footer: {
    description: 'موزع KRNO في مصر لتوريد أكواب PET وأغطيتها المنفصلة، تغليف الحلويات والكيك، علب وجبات المايكروويف PP، وعلب المفصلة بالكرتونة لجميع المحافظات.',
    navigationTitle: 'تصفح الموقع',
    salesTitle: 'المبيعات وواتساب',
    emailsTitle: 'البريد الإلكتروني',
    copyright: '© 2026 يو-باك للتجارة — U-Pack for Trading',
  },
  seo: {
    siteTitle: 'يو-باك للتجارة | موزع KRNO في مصر',
    defaultDescription: 'يو-باك للتجارة — موزع KRNO في مصر. تغليف حلويات وباتيسيري، علب كيك، أكواب PET شفافة وأغطية منفصلة، علب وجبات مايكروويف PP وعلب مفصلة بالجملة بالكرتونة مع توصيل لجميع محافظات مصر. واتساب واتصال 01055400404.',
    homeTitle: 'يو-باك للتجارة — موزع KRNO | عبوات تغليف الحلويات والمطاعم بالجملة في مصر',
    catalogTitle: 'الكتالوج الكامل بالجملة | يو-باك للتجارة — موزع KRNO مصر',
    catalogDescription: 'تصفح جميع كراتين تغليف الحلويات والمطاعم من KRNO في مصر: صواني الحلويات، علب الكيك، أكواب PET وأغطية منفصلة، علب المايكروويف PP، علب السوشي وأدوات المائدة. اطلب عبر واتساب 01055400404.',
    aboutTitle: 'عن يو-باك للتجارة | موزع KRNO في مصر',
    aboutDescription: 'تعرّف على يو-باك للتجارة، موزع KRNO لتوريد عبوات التغليف الغذائي بالكرتونة للمطاعم والكافيهات ومحلات الحلويات في جميع محافظات مصر.',
    contactTitle: 'طلبات الجملة والتواصل | يو-باك للتجارة — 01055400404',
    contactDescription: 'اطلب عرض سعر جملة بالكرتونة عبر واتساب أو الاتصال المباشر على 01055400404 مع توصيل لجميع محافظات مصر.',
  },
  notFound: {
    title: 'الصفحة غير موجودة',
    lead: 'ربما تم نقل المنتج أو الصفحة المطلوبة. يمكنك تصفح كتالوج عبوات KRNO الكامل أدناه.',
    ctaCatalog: 'فتح الكتالوج الكامل',
    ctaHome: 'العودة للرئيسية',
  },
};

export function getUI(lang: Lang): UIDictionary {
  return lang === 'ar' ? AR_UI : EN_UI;
}

export function formatNum(n: number): string {
  return Number(n).toLocaleString('en-US');
}

export function formatSoldByBox(
  lang: Lang,
  pcsPerBox?: number,
  orderUnit: OrderUnit = 'box',
  packUnit?: string
): string {
  if (packUnit) {
    return lang === 'ar'
      ? `البيع بالكرتونة (${packUnit})`
      : `Sold by Box (${packUnit})`;
  }
  if (pcsPerBox != null && pcsPerBox > 0) {
    const formatted = formatNum(pcsPerBox);
    if (orderUnit === 'pack') {
      return lang === 'ar'
        ? `عبوة (${formatted} قطعة/عبوة)`
        : `Sold by Pack (${formatted} pcs/pack)`;
    }
    return lang === 'ar'
      ? `البيع بالكرتونة (${formatted} قطعة/كرتونة)`
      : `Sold by Box (${formatted} pcs/box)`;
  }
  if (orderUnit === 'pack') {
    return lang === 'ar' ? 'البيع بالعبوة' : 'Sold by Pack';
  }
  return lang === 'ar' ? 'البيع بالكرتونة' : 'Sold by Box';
}

export function formatShortBox(
  lang: Lang,
  pcsPerBox?: number,
  orderUnit: OrderUnit = 'box',
  packUnit?: string
): string {
  if (packUnit) return packUnit;
  if (pcsPerBox != null && pcsPerBox > 0) {
    const formatted = formatNum(pcsPerBox);
    if (orderUnit === 'pack') {
      return lang === 'ar' ? `${formatted} قطعة / عبوة` : `${formatted} pcs / pack`;
    }
    return lang === 'ar' ? `${formatted} قطعة / كرتونة` : `${formatted} pcs / box`;
  }
  return orderUnit === 'pack'
    ? (lang === 'ar' ? 'بالعبوة' : 'Per pack')
    : (lang === 'ar' ? 'بالكرتونة' : 'Per box');
}

export function formatOrderQty(lang: Lang, qty: number, orderUnit: OrderUnit = 'box'): string {
  if (orderUnit === 'pack') {
    return lang === 'ar'
      ? `${qty} ${qty === 1 ? 'عبوة' : 'عبوات'}`
      : `${qty} ${qty === 1 ? 'pack' : 'packs'}`;
  }
  return lang === 'ar'
    ? `${qty} ${qty === 1 ? 'كرتونة' : 'كراتين'}`
    : `${qty} ${qty === 1 ? 'box' : 'boxes'}`;
}
