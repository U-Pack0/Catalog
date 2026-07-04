/* ═══════════════════════════════════════════════
   U-Pack Product Catalog — app.js
   Smart sequential image loading with retry & fallback
   ═══════════════════════════════════════════════ */
'use strict';

/* ── State ───────────────────────────────────── */
const State = {
  activeCategory: 'all',
  searchQuery:    '',
  filteredProducts: [],
  allProducts:    [],
  renderToken:    0,
  toastTimer:     null
};

/* ── DOM refs ─────────────────────────────────── */
const DOM = {
  grid:         document.getElementById('products-grid'),
  categoryNav:  document.getElementById('category-nav'),
  searchInput:  document.getElementById('search-input'),
  resultsMeta:  document.getElementById('results-meta'),
  emptyState:   document.getElementById('empty-state'),
  stickyHeader: document.getElementById('sticky-header'),
  backToTop:    document.getElementById('back-to-top'),
  modalOverlay: document.getElementById('modal-overlay'),
  modalBox:     document.getElementById('modal-box'),
  modalContent: document.getElementById('modal-content'),
  toast:        document.getElementById('toast'),
  cover:        document.getElementById('cover'),
  statProducts: document.getElementById('stat-products'),
  statCategories: document.getElementById('stat-categories'),
  loaderFill:   document.getElementById('loader-fill'),
  loaderText:   document.getElementById('loader-text')
};

/* ═══════════════════════════════════════════════
   IMAGE LOADING
   Native lazy loading (loading="lazy") — the page itself
   (layout, search, category nav) is ready instantly, and
   each product photo only starts fetching once its card
   scrolls near the viewport, instead of every image on the
   page firing at once. No artificial queueing/throttling/
   retries beyond that. A single onerror handler swaps in a
   📦 placeholder if a given URL genuinely doesn't resolve.
   ═══════════════════════════════════════════════ */

/* ─── Resolve the best single image URL for a product ──── */
function getImageUrl(product) {
  if (product.image) return product.image;
  if (Array.isArray(product.images) && product.images.length) return product.images[0];
  return '';
}

/* ─── Variant helpers ──────────────────────────
   Each product card now represents a FAMILY of one or more
   variants (different size/pack/color). activeVariantIndex
   tracks which variant is selected per family id. ──── */
const activeVariantIndex = {}; // productId -> variant index

function getActiveVariant(product) {
  const idx = activeVariantIndex[product.id] || 0;
  const variants = product.variants || [];
  return variants[idx] || variants[0] || {
    image: product.image, images: product.images,
    amazon_link: product.amazon_link, sku: product.sku, description: product.description
  };
}

function getVariantImageUrl(variant) {
  if (variant.image) return variant.image;
  if (Array.isArray(variant.images) && variant.images.length) return variant.images[0];
  return '';
}

function bindImage(imgEl, wrapEl) {
  const skeleton = wrapEl.querySelector('.img-skeleton');
  imgEl.addEventListener('load', () => {
    imgEl.classList.add('loaded');
    if (skeleton) skeleton.classList.add('hidden');
  });
  imgEl.addEventListener('error', () => {
    wrapEl.classList.add('error');
    if (skeleton) skeleton.classList.add('hidden');
  });
}

/* ═══════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════ */

function renderProducts(products) {
  const token = ++State.renderToken;
  DOM.grid.innerHTML = '';

  if (products.length === 0) {
    DOM.emptyState.hidden = false;
    DOM.resultsMeta.textContent = 'No products found.';
    return;
  }

  DOM.emptyState.hidden = true;
  DOM.resultsMeta.textContent = `Showing ${products.length.toLocaleString()} product${products.length !== 1 ? 's' : ''}`;

  // Use DocumentFragment for performance
  const frag = document.createDocumentFragment();

  products.forEach(product => {
    const variants = Array.isArray(product.variants) ? product.variants : null;
    const hasVariants = variants && variants.length > 0;
    const variant = hasVariants ? getActiveVariant(product) : null;
    const url = hasVariants ? getVariantImageUrl(variant) : getImageUrl(product);
    const sku = hasVariants ? variant.sku : product.sku;

    const card = document.createElement('article');
    card.className = 'product-card';
    card.setAttribute('role', 'listitem');
    card.dataset.id = product.id;

    const variantSelectHtml = hasVariants && variants.length > 1
      ? `<select class="variant-select" data-id="${escHtml(product.id)}" aria-label="Choose size/pack/color">
          ${variants.map((v, i) => `<option value="${i}" ${i === (activeVariantIndex[product.id] || 0) ? 'selected' : ''}>${escHtml(v.label || v.sku || `Option ${i + 1}`)}</option>`).join('')}
        </select>`
      : (hasVariants ? `<p class="card-unit">${escHtml(variant.label || '')}</p>` : (product.unit ? `<p class="card-unit">${escHtml(product.unit)}</p>` : ''));

    const variantBadgeHtml = hasVariants && variants.length > 1
      ? `<span class="card-variant-badge">${variants.length} options</span>`
      : '';

    const variationSignHtml = hasVariants && variants.length > 1
      ? `<p class="card-variation-sign">▼ ${variants.length} sizes / packs available</p>`
      : '';

    card.innerHTML = `
      <div class="card-img-wrap${url ? '' : ' error'}">
        <div class="img-skeleton"></div>
        <span class="img-error-icon">📦</span>
        ${url ? `<img class="card-img" alt="${escHtml(product.name)}" src="${escHtml(url)}" loading="lazy" decoding="async" />` : ''}
        <span class="card-badge">${escHtml(product.category || '')}</span>
        ${variantBadgeHtml}
        <span class="tap-hint">Tap for details</span>
      </div>
      <div class="card-body">
        <p class="card-name">${escHtml(product.name)}</p>
        <p class="card-sku">SKU: ${escHtml(sku || '')}</p>
        ${variationSignHtml}
        ${variantSelectHtml}
        <div class="card-actions">
          <button class="btn-details" data-id="${escHtml(product.id)}">Details</button>
        </div>
      </div>
    `;

    frag.appendChild(card);
  });

  DOM.grid.appendChild(frag);

  // Bind load/error handlers so the skeleton hides and errors show the
  // placeholder icon. Images themselves started loading the instant
  // their <img> tag was inserted into the DOM above — no queue, no delay.
  requestAnimationFrame(() => {
    if (token !== State.renderToken) return; // stale render

    const cards = DOM.grid.querySelectorAll('.product-card');
    cards.forEach(card => {
      const imgEl  = card.querySelector('.card-img');
      const wrapEl = card.querySelector('.card-img-wrap');
      if (!imgEl) return; // no image url available, already marked .error
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        imgEl.classList.add('loaded');
        const skeleton = wrapEl.querySelector('.img-skeleton');
        if (skeleton) skeleton.classList.add('hidden');
      } else {
        bindImage(imgEl, wrapEl);
      }
    });
  });
}

/* ═══════════════════════════════════════════════
   FILTERING & SEARCH
   ═══════════════════════════════════════════════ */

// Normalize text for robust matching: lowercase, strip punctuation/separators
// commonly found in SKUs and labels (-, _, /, ×, x-between-numbers), collapse whitespace.
function normalizeSearchText(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[-_/×]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build one big searchable string for a product, including every field a user
// might reasonably search by: name, category, description, tags, and — critically —
// every variant's sku, label, asin, and description (these live on variants, not
// on the product itself, so they were previously invisible to search).
function buildProductHaystack(p) {
  const parts = [
    p.name, p.category, p.subcategory, p.description,
    ...(p.tags || [])
  ];

  if (Array.isArray(p.variants)) {
    p.variants.forEach(v => {
      parts.push(v.sku, v.label, v.asin, v.description, v.unit);
    });
  }

  return normalizeSearchText(parts.filter(Boolean).join(' '));
}

function applyFilters() {
  const cat = State.activeCategory;
  const q   = normalizeSearchText(State.searchQuery);

  State.filteredProducts = State.allProducts.filter(p => {
    const matchCat = cat === 'all' || p.category === cat;
    if (!matchCat) return false;
    if (!q) return true;

    const haystack = buildProductHaystack(p);

    // Split the query into individual words and require every word to appear
    // somewhere in the haystack (order-independent, e.g. "black soup bowl"
    // matches "KRNO PP Soup Bowls — Small | Black" just as well as
    // "soup bowl black"). This also makes partial SKU/word matches work,
    // e.g. "SB1 Black" or "sb1-blackx10" both find the right product.
    const terms = q.split(' ').filter(Boolean);
    return terms.every(term => haystack.includes(term));
  });

  renderProducts(State.filteredProducts);
}

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */

function openModal(productId) {
  const product = State.allProducts.find(p => p.id === productId);
  if (!product) return;

  const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : null;
  const activeIdx = activeVariantIndex[product.id] || 0;
  const activeVar = variants ? variants[activeIdx] : null;
  const mainImg = activeVar ? getVariantImageUrl(activeVar) : getImageUrl(product);
  const desc = activeVar ? activeVar.description : product.description;
  const amazonTitle = activeVar ? activeVar.amazon_title : product.amazon_title;

  // Build variants table if multiple
  const variantsHtml = variants && variants.length > 1
    ? `<div class="modal-variants">
        <h3 class="modal-variants-title">Available Options</h3>
        <div class="variants-grid">
          ${variants.map((v, i) => `
            <div class="variant-row${i === activeIdx ? ' active-variant' : ''}">
              <span class="variant-label">${escHtml(v.label || v.sku || `Option ${i+1}`)}</span>
              <span class="variant-sku">${escHtml(v.sku || '')}</span>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  DOM.modalContent.innerHTML = `
    ${mainImg ? `<img class="modal-img-main" src="${escHtml(mainImg)}" alt="${escHtml(product.name)}" onerror="this.style.display='none';" />` : ''}
    <h2 class="modal-title" id="modal-title">${escHtml(product.name)}</h2>
    <div class="modal-meta">
      <span class="meta-chip chip-cat">${escHtml(product.category || '')}</span>
      ${product.subcategory ? `<span class="meta-chip chip-cat">${escHtml(product.subcategory)}</span>` : ''}
      ${activeVar ? `<span class="meta-chip chip-sku">SKU: ${escHtml(activeVar.sku || '')}</span>` : `<span class="meta-chip chip-sku">SKU: ${escHtml(product.sku || '')}</span>`}
      ${variants ? `<span class="meta-chip chip-unit">${variants.length} variant${variants.length !== 1 ? 's' : ''}</span>` : ''}
    </div>
    ${amazonTitle ? `<div class="modal-amazon-title"><span class="modal-amazon-title-label">Description</span><p>${escHtml(amazonTitle)}</p></div>` : ''}
    ${desc ? `<p class="modal-desc">${escHtml(desc)}</p>` : ''}
    ${variantsHtml}
    ${product.tags && product.tags.length
      ? `<div class="modal-tags">${product.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>`
      : ''}
  `;

  DOM.modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  DOM.modalOverlay.hidden = true;
  document.body.style.overflow = '';
}

/* ═══════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════ */

function showToast(msg, duration = 2500) {
  DOM.toast.textContent = msg;
  DOM.toast.classList.add('show');
  clearTimeout(State.toastTimer);
  State.toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), duration);
}

/* ═══════════════════════════════════════════════
   SCROLL HANDLERS
   ═══════════════════════════════════════════════ */

function onScroll() {
  const y = window.scrollY;
  DOM.backToTop.hidden = y < 400;
}

/* ═══════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════ */

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // Load products
  if (typeof KRNO_PRODUCTS === 'undefined' || !KRNO_PRODUCTS.length) {
    DOM.loaderText && (DOM.loaderText.textContent = 'Error: products.js not found.');
    return;
  }

  State.allProducts      = KRNO_PRODUCTS;
  State.filteredProducts = KRNO_PRODUCTS;

  // Update stats
  const categories = [...new Set(KRNO_PRODUCTS.map(p => p.category).filter(Boolean))];
  if (DOM.statProducts)   DOM.statProducts.textContent   = KRNO_PRODUCTS.length.toLocaleString();
  if (DOM.statCategories) DOM.statCategories.textContent = categories.length;

  // Animate cover loader
  let progress = 0;
  const loadInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 18 + 8, 95);
    if (DOM.loaderFill) DOM.loaderFill.style.width = progress + '%';
    if (DOM.loaderText) DOM.loaderText.textContent  = `Loading ${Math.round(progress)}%…`;
  }, 120);

  // Small delay to let browser paint, then render and hide cover
  setTimeout(() => {
    clearInterval(loadInterval);
    if (DOM.loaderFill) DOM.loaderFill.style.width = '100%';
    if (DOM.loaderText) DOM.loaderText.textContent  = 'Ready!';

    applyFilters();

    setTimeout(() => {
      if (DOM.cover) DOM.cover.classList.add('hidden');
    }, 350);
  }, 600);

  // ── Category buttons ──
  DOM.categoryNav.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    DOM.categoryNav.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.activeCategory = btn.dataset.cat;
    applyFilters();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Search input (debounced) ──
  let searchTimer;
  DOM.searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      State.searchQuery = e.target.value;
      applyFilters();
    }, 280);
  });

  // ── Card interactions (event delegation) ──
  DOM.grid.addEventListener('click', e => {
    const detailBtn = e.target.closest('.btn-details');
    if (detailBtn) {
      openModal(detailBtn.dataset.id);
      return;
    }
    const card = e.target.closest('.product-card');
    if (card && !e.target.closest('.btn-details') && !e.target.closest('.variant-select')) {
      openModal(card.dataset.id);
    }
  });

  // ── Variant dropdown changes → update card image + SKU live ──
  DOM.grid.addEventListener('change', e => {
    const sel = e.target.closest('.variant-select');
    if (!sel) return;
    const productId = sel.dataset.id;
    const newIdx = parseInt(sel.value, 10);
    activeVariantIndex[productId] = newIdx;

    const card = DOM.grid.querySelector(`.product-card[data-id="${productId}"]`);
    if (!card) return;

    const product = State.allProducts.find(p => p.id === productId);
    if (!product || !Array.isArray(product.variants)) return;
    const variant = product.variants[newIdx];
    if (!variant) return;

    // Update SKU text
    const skuEl = card.querySelector('.card-sku');
    if (skuEl) skuEl.textContent = 'SKU: ' + (variant.sku || '');

    // Update card image if different
    const newUrl = getVariantImageUrl(variant);
    if (newUrl) {
      const wrapEl = card.querySelector('.card-img-wrap');
      let imgEl = card.querySelector('.card-img');
      const skeleton = card.querySelector('.img-skeleton');
      if (!imgEl) {
        imgEl = document.createElement('img');
        imgEl.className = 'card-img';
        imgEl.alt = product.name;
        imgEl.decoding = 'async';
        wrapEl.appendChild(imgEl);
      }
      if (imgEl.src !== newUrl) {
        imgEl.classList.remove('loaded');
        wrapEl.classList.remove('error');
        if (skeleton) skeleton.classList.remove('hidden');
        bindImage(imgEl, wrapEl);
        imgEl.src = newUrl;
      }
    }
  });

  // ── Modal close ──
  document.getElementById('modal-close').addEventListener('click', closeModal);
  DOM.modalOverlay.addEventListener('click', e => {
    if (e.target === DOM.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Back to top ──
  DOM.backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Scroll ──
  window.addEventListener('scroll', onScroll, { passive: true });
});
