import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type CleanupFn = () => void;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

let activeTeardown: CleanupFn | null = null;
let cardTrickCleanups: CleanupFn[] = [];
let listenersBound = false;

function getDir(): 1 | -1 {
  return document.documentElement.dir === 'rtl' ? -1 : 1;
}

function isReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function isFinePointer(): boolean {
  return window.matchMedia(FINE_POINTER_QUERY).matches;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/* ============================================================================
   PUBLIC EXPORTED HELPERS (Used by Wave 2: catalog-filter.ts & quote-bag)
   ============================================================================ */

/**
 * Elastic scale + crisp flash pop on box-count / SKU / badge elements
 * whenever a user switches variant chips or updates carton quantities.
 */
export function animateMetricPop(el: HTMLElement | null): void {
  if (!el) return;
  if (isReducedMotion()) return;

  gsap.killTweensOf(el);
  gsap.fromTo(
    el,
    { scale: 0.9, y: -2 },
    {
      scale: 1,
      y: 0,
      duration: 0.36,
      ease: 'back.out(2.2)',
      clearProps: 'transform'
    }
  );
}

/**
 * Flying "+1 Box" micro-burst animating a crisp crimson pill from the clicked
 * card/button smoothly toward `[data-bag-btn]`, then popping `[data-bag-count]`.
 */
export function flyToBag(sourceEl: HTMLElement | null, label = '+1'): void {
  const bagBtn = document.querySelector<HTMLElement>('[data-bag-btn]');
  const bagCount = document.querySelector<HTMLElement>('[data-bag-count]');

  if (bagCount && !isReducedMotion()) {
    gsap.killTweensOf(bagCount);
    gsap.fromTo(
      bagCount,
      { scale: 1.38 },
      { scale: 1, duration: 0.42, ease: 'back.out(2.4)', clearProps: 'transform' }
    );
  }

  if (!sourceEl || !bagBtn || isReducedMotion()) return;

  const from = sourceEl.getBoundingClientRect();
  const to = bagBtn.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return;

  const startX = from.left + from.width * 0.5;
  const startY = from.top + from.height * 0.5;
  const endX = to.left + to.width * 0.5;
  const endY = to.top + to.height * 0.5;

  const pill = document.createElement('span');
  pill.textContent = label;
  pill.setAttribute('aria-hidden', 'true');
  Object.assign(pill.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    zIndex: '70',
    pointerEvents: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '36px',
    height: '28px',
    padding: '0 10px',
    borderRadius: '9999px',
    backgroundColor: '#C61D2A',
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: '0.78rem',
    letterSpacing: '0.01em',
    boxShadow: '0 10px 24px rgba(13, 15, 20, 0.24)',
    willChange: 'transform, opacity'
  });

  document.body.appendChild(pill);

  const dx = endX - startX;
  const dy = endY - startY;
  const arcLift = Math.min(-56, -Math.abs(dx) * 0.16);
  const state = { p: 0 };

  gsap.set(pill, { x: startX - 18, y: startY - 14, scale: 0.65, opacity: 0 });

  const tl = gsap.timeline({
    onComplete: () => {
      pill.remove();
      if (bagBtn) {
        gsap.fromTo(
          bagBtn,
          { scale: 1.07 },
          { scale: 1, duration: 0.3, ease: 'back.out(2)', clearProps: 'transform' }
        );
      }
    }
  });

  tl.to(pill, { scale: 1.08, opacity: 1, duration: 0.14, ease: 'power2.out' })
    .to(
      state,
      {
        p: 1,
        duration: 0.56,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = state.p;
          const x = startX + dx * t;
          const y = startY + dy * t + 4 * arcLift * t * (1 - t);
          const s = 1.08 - t * 0.58;
          gsap.set(pill, {
            x: x - 18,
            y: y - 14,
            scale: s,
            opacity: t > 0.82 ? Math.max(0, 1 - (t - 0.82) / 0.18) : 1
          });
        }
      },
      '-=0.04'
    );
}

/**
 * Interactive 3D Y-axis cross-flip between closed with-lid photo and `openImage`
 * interior compartment view on Group A containers.
 * Supports BOTH dual-face (`[data-peek-front]` + `[data-peek-back]`) AND
 * single-image swap (`[data-peek-img]` with `data-front-src` / `data-back-src`).
 */
export function triggerPeekFlip(container: HTMLElement | null, forceOpen?: boolean): boolean {
  if (!container) return false;

  const isCurrentlyOpen = container.getAttribute('data-peek-open') === 'true';
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !isCurrentlyOpen;
  container.setAttribute('data-peek-open', String(nextOpen));

  const stage =
    container.querySelector<HTMLElement>('[data-peek-stage]') ||
    container.querySelector<HTMLElement>('[data-card-media]');
  const btn = container.querySelector<HTMLElement>('[data-peek-btn]');
  const frontFace = container.querySelector<HTMLElement>('[data-peek-front]');
  const backFace = container.querySelector<HTMLElement>('[data-peek-back]');
  const swapImg = container.querySelector<HTMLImageElement>('[data-peek-img]');

  if (btn) {
    btn.setAttribute('aria-pressed', String(nextOpen));
    const lbl = btn.querySelector<HTMLElement>('[data-peek-label]') || btn;
    const closedTxt = btn.getAttribute('data-label-closed');
    const openTxt = btn.getAttribute('data-label-open');
    if (closedTxt && openTxt) {
      lbl.textContent = nextOpen ? openTxt : closedTxt;
    }
  }

  // Sync adaptive dark/light plinth backdrop if alternate backdrop is declared
  const plinth = container.querySelector<HTMLElement>('[data-backdrop]');
  if (plinth) {
    const frontBg = plinth.getAttribute('data-front-backdrop');
    const backBg = plinth.getAttribute('data-back-backdrop');
    if (frontBg && backBg) {
      plinth.setAttribute('data-backdrop', nextOpen ? backBg : frontBg);
    }
  }

  const applyInstantState = () => {
    if (frontFace && backFace) {
      frontFace.style.opacity = nextOpen ? '0' : '1';
      frontFace.style.pointerEvents = nextOpen ? 'none' : 'auto';
      backFace.style.opacity = nextOpen ? '1' : '0';
      backFace.style.pointerEvents = nextOpen ? 'auto' : 'none';
    }
    if (swapImg) {
      const targetSrc = nextOpen
        ? swapImg.getAttribute('data-back-src')
        : swapImg.getAttribute('data-front-src');
      if (targetSrc) swapImg.src = targetSrc;
    }
  };

  if (!stage || isReducedMotion()) {
    applyInstantState();
    return nextOpen;
  }

  const dir = getDir();
  gsap.killTweensOf(stage);
  gsap.set(stage, { transformPerspective: 950 });

  const tl = gsap.timeline();
  tl.to(stage, {
    rotationY: 88 * dir,
    scale: 0.94,
    duration: 0.18,
    ease: 'power2.in',
    onComplete: () => {
      applyInstantState();
      gsap.set(stage, { rotationY: -88 * dir });
    }
  }).to(stage, {
    rotationY: 0,
    scale: 1,
    duration: 0.28,
    ease: 'back.out(1.4)',
    clearProps: 'transform'
  });

  return nextOpen;
}

/**
 * Slides `[data-pill-indicator]` cleanly behind the active button inside `[data-pill-rail]`.
 * Works symmetrically in LTR & RTL with zero layout jump and kills overlapping tweens on rapid clicks.
 */
export function syncPillRail(railEl: HTMLElement, instant = false): void {
  const indicator = railEl.querySelector<HTMLElement>('[data-pill-indicator]');
  if (!indicator) return;

  const activeBtn =
    railEl.querySelector<HTMLElement>('[aria-pressed="true"]') ||
    railEl.querySelector<HTMLElement>('[aria-selected="true"]') ||
    railEl.querySelector<HTMLElement>('[data-active="true"]') ||
    railEl.querySelector<HTMLElement>('.is-active');

  if (!activeBtn) {
    indicator.style.opacity = '0';
    return;
  }

  const railRect = railEl.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  const offsetX = btnRect.left - railRect.left + railEl.scrollLeft;
  const offsetY = btnRect.top - railRect.top + railEl.scrollTop;
  const width = btnRect.width;
  const height = btnRect.height;

  if (width <= 0 || height <= 0) return;

  gsap.killTweensOf(indicator);

  if (instant || isReducedMotion()) {
    gsap.set(indicator, {
      x: offsetX,
      y: offsetY,
      width,
      height,
      opacity: 1
    });
    return;
  }

  gsap.to(indicator, {
    x: offsetX,
    y: offsetY,
    width,
    height,
    opacity: 1,
    duration: 0.28,
    ease: 'power3.out'
  });
}

/* ============================================================================
   CARD TRICKS ENGINE (Re-bindable after dynamic catalog filtering)
   ============================================================================ */

function teardownCardTricks(): void {
  while (cardTrickCleanups.length > 0) {
    const fn = cardTrickCleanups.pop();
    fn?.();
  }
}

/**
 * Attaches all creative card tricks on `[data-trick-card]` & `[data-peek-btn]`
 * inside `root` (defaults to `document`). Safe to re-run after dynamic renders.
 */
export function refreshCardTricks(root: ParentNode = document): void {
  if (root === document) {
    teardownCardTricks();
  }

  const reduced = isReducedMotion();
  const fine = isFinePointer();

  // 1-4: 3D Perspective Tilt + Prismatic Specular Sweep + Crimson Border Spotlight + Depth-Pop Media
  const cards = root.querySelectorAll<HTMLElement>('[data-trick-card]');
  cards.forEach((card) => {
    if (card.dataset.trickBound === '1') return;
    card.dataset.trickBound = '1';

    // Always bind Peek-Inside toggle (works on desktop, touch & keyboard!)
    const peekBtn = card.querySelector<HTMLElement>('[data-peek-btn]');
    let onPeekClick: ((e: Event) => void) | null = null;
    if (peekBtn) {
      onPeekClick = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        triggerPeekFlip(card);
      };
      peekBtn.addEventListener('click', onPeekClick);
    }

    let onMove: ((e: PointerEvent) => void) | null = null;
    let onLeave: (() => void) | null = null;

    if (fine && !reduced) {
      gsap.set(card, { transformPerspective: 1100, transformStyle: 'preserve-3d' });

      const rotXTo = gsap.quickTo(card, 'rotationX', { duration: 0.32, ease: 'power3.out' });
      const rotYTo = gsap.quickTo(card, 'rotationY', { duration: 0.32, ease: 'power3.out' });
      const yTo = gsap.quickTo(card, 'y', { duration: 0.32, ease: 'power3.out' });

      const media = card.querySelector<HTMLElement>('[data-card-media]');
      const mediaXTo = media ? gsap.quickTo(media, 'x', { duration: 0.36, ease: 'power2.out' }) : null;
      const mediaYTo = media ? gsap.quickTo(media, 'y', { duration: 0.36, ease: 'power2.out' }) : null;
      const mediaZTo = media ? gsap.quickTo(media, 'z', { duration: 0.36, ease: 'power2.out' }) : null;
      const mediaScaleTo = media ? gsap.quickTo(media, 'scale', { duration: 0.36, ease: 'power2.out' }) : null;

      onMove = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        const rect = card.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const relX = e.clientX - rect.left;
        const relY = e.clientY - rect.top;
        const nx = clamp(relX / rect.width, 0, 1);
        const ny = clamp(relY / rect.height, 0, 1);

        // 1. 3D Perspective Cursor Tilt (±6.5° clamp)
        rotYTo((nx - 0.5) * 13);
        rotXTo(-(ny - 0.5) * 13);
        yTo(-4);

        // 2. Prismatic Specular Glass Sweep CSS vars
        card.style.setProperty('--sheen-x', `${(nx * 100).toFixed(1)}%`);
        card.style.setProperty('--sheen-y', `${(ny * 100).toFixed(1)}%`);

        // 3. Magnetic Crimson Border-Glow Spotlight CSS vars
        card.style.setProperty('--glow-x', `${relX.toFixed(1)}px`);
        card.style.setProperty('--glow-y', `${relY.toFixed(1)}px`);

        // 4. 3D Depth-Pop Stage on product photo layer
        if (mediaXTo && mediaYTo && mediaZTo && mediaScaleTo) {
          mediaXTo((nx - 0.5) * 8);
          mediaYTo((ny - 0.5) * 6);
          mediaZTo(24);
          mediaScaleTo(1.045);
        }
      };

      onLeave = () => {
        gsap.to(card, {
          rotationX: 0,
          rotationY: 0,
          y: 0,
          duration: 0.52,
          ease: 'elastic.out(1, 0.65)',
          overwrite: 'auto'
        });
        if (media) {
          gsap.to(media, {
            x: 0,
            y: 0,
            z: 0,
            scale: 1,
            duration: 0.42,
            ease: 'power3.out',
            overwrite: 'auto'
          });
        }
      };

      card.addEventListener('pointermove', onMove, { passive: true });
      card.addEventListener('pointerleave', onLeave);
    }

    cardTrickCleanups.push(() => {
      delete card.dataset.trickBound;
      if (peekBtn && onPeekClick) peekBtn.removeEventListener('click', onPeekClick);
      if (onMove) card.removeEventListener('pointermove', onMove);
      if (onLeave) card.removeEventListener('pointerleave', onLeave);
      gsap.set(card, { clearProps: 'transform' });
      const media = card.querySelector<HTMLElement>('[data-card-media]');
      if (media) gsap.set(media, { clearProps: 'transform' });
    });
  });

  // Also bind standalone `[data-peek-btn]` outside `[data-trick-card]` (e.g. PDP stage)
  root.querySelectorAll<HTMLElement>('[data-peek-btn]').forEach((btn) => {
    if (btn.closest('[data-trick-card]') || btn.dataset.peekBound === '1') return;
    btn.dataset.peekBound = '1';
    const host = btn.closest<HTMLElement>('[data-pdp-stage]') || btn.parentElement;
    const handler = (e: Event) => {
      e.preventDefault();
      if (host) triggerPeekFlip(host);
    };
    btn.addEventListener('click', handler);
    cardTrickCleanups.push(() => {
      delete btn.dataset.peekBound;
      btn.removeEventListener('click', handler);
    });
  });
}

/* ============================================================================
   HERO 3D MULTI-PLANE DEPTH-PARALLAX STAGE
   ============================================================================ */

function mountHero3DStage(cleanups: CleanupFn[]): void {
  const stage = document.querySelector<HTMLElement>('[data-hero-3d-stage]');
  if (!stage) return;

  const canvas = stage.querySelector<HTMLElement>('[data-hero-3d-canvas]') || stage;
  const planes = Array.from(stage.querySelectorAll<HTMLElement>('[data-depth-plane]'));
  const floaters = Array.from(stage.querySelectorAll<HTMLElement>('[data-hero-float]'));

  const reduced = isReducedMotion();
  const fine = isFinePointer();

  // Gentle perpetual floating depth micro-motion (paused offscreen, hidden, or reduced-motion)
  const floatTweens: gsap.core.Tween[] = [];
  if (!reduced && floaters.length > 0) {
    floaters.forEach((el, idx) => {
      const amp = 5 + (idx % 3) * 2.5;
      const dur = 3.0 + (idx % 4) * 0.45;
      const tw = gsap.to(el, {
        y: idx % 2 === 0 ? -amp : amp,
        duration: dur,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: idx * 0.28
      });
      floatTweens.push(tw);
    });

    let inView = true;
    const syncFloats = () => {
      const shouldPlay = !document.hidden && inView && !isReducedMotion();
      floatTweens.forEach((tw) => (shouldPlay ? tw.play() : tw.pause()));
    };

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        syncFloats();
      },
      { threshold: 0.05 }
    );
    io.observe(stage);

    const onVis = () => syncFloats();
    document.addEventListener('visibilitychange', onVis);

    cleanups.push(() => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      floatTweens.forEach((tw) => tw.kill());
      floaters.forEach((el) => gsap.set(el, { clearProps: 'y' }));
    });
  }

  // Pointer-tracked multi-plane 3D tilt (±5.5° clamp) on desktop fine pointer
  if (fine && !reduced) {
    gsap.set(canvas, { transformPerspective: 1200, transformStyle: 'preserve-3d' });
    const rotXTo = gsap.quickTo(canvas, 'rotationX', { duration: 0.45, ease: 'power3.out' });
    const rotYTo = gsap.quickTo(canvas, 'rotationY', { duration: 0.45, ease: 'power3.out' });

    const planeHandlers = planes.map((plane) => {
      const depth = parseFloat(plane.getAttribute('data-depth-plane') || '1') || 1;
      return {
        depth,
        xTo: gsap.quickTo(plane, 'x', { duration: 0.5, ease: 'power2.out' }),
        yTo: gsap.quickTo(plane, 'y', { duration: 0.5, ease: 'power2.out' }),
        el: plane
      };
    });

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const nx = clamp((e.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5);
      const ny = clamp((e.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5);

      rotYTo(nx * 11); // clamped ±5.5°
      rotXTo(-ny * 11);

      planeHandlers.forEach(({ depth, xTo, yTo }) => {
        xTo(nx * depth * 12);
        yTo(ny * depth * 9);
      });
    };

    const onLeave = () => {
      gsap.to(canvas, { rotationX: 0, rotationY: 0, duration: 0.65, ease: 'power3.out', overwrite: 'auto' });
      planeHandlers.forEach(({ el }) => {
        gsap.to(el, { x: 0, y: 0, duration: 0.65, ease: 'power3.out', overwrite: 'auto' });
      });
    };

    stage.addEventListener('pointermove', onMove, { passive: true });
    stage.addEventListener('pointerleave', onLeave);

    cleanups.push(() => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      gsap.set(canvas, { clearProps: 'transform' });
      planes.forEach((p) => gsap.set(p, { clearProps: 'x,y' }));
    });
  }
}

/* ============================================================================
   SLIDING ACTIVE PILL RAILS, MAGNETIC CTAS & INTERACTIVE 3D PDP STAGE
   ============================================================================ */

function mountPillRails(cleanups: CleanupFn[]): void {
  const rails = document.querySelectorAll<HTMLElement>('[data-pill-rail]');
  rails.forEach((rail) => {
    const syncInstant = () => syncPillRail(rail, true);
    const syncAnimated = () => {
      // Wait 1 microtask so aria-pressed / data-active updates from click handlers commit first
      window.requestAnimationFrame(() => syncPillRail(rail, false));
    };

    rail.addEventListener('click', syncAnimated);
    const ro = new ResizeObserver(syncInstant);
    ro.observe(rail);

    // Sync immediately + after fonts settle
    syncInstant();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(syncInstant);
    }

    cleanups.push(() => {
      rail.removeEventListener('click', syncAnimated);
      ro.disconnect();
    });
  });
}

function mountMagneticCtas(cleanups: CleanupFn[]): void {
  if (!isFinePointer() || isReducedMotion()) return;

  // Enforce max 2 magnetic focal CTAs per page (motion.csv rule 3)
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-magnetic]')).slice(0, 2);
  targets.forEach((el) => {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.32, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.32, ease: 'power3.out' });

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const dx = clamp((e.clientX - r.left - r.width / 2) * 0.22, -16, 16);
      const dy = clamp((e.clientY - r.top - r.height / 2) * 0.22, -12, 12);
      xTo(dx);
      yTo(dy);
    };

    const onLeave = () => {
      gsap.to(el, {
        x: 0,
        y: 0,
        duration: 0.58,
        ease: 'elastic.out(1, 0.5)',
        overwrite: 'auto'
      });
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    cleanups.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      gsap.set(el, { clearProps: 'x,y' });
    });
  });
}

function mountPdp3DStage(cleanups: CleanupFn[]): void {
  const stages = document.querySelectorAll<HTMLElement>('[data-pdp-stage]');
  stages.forEach((stage) => {
    const target = stage.querySelector<HTMLElement>('[data-pdp-plinth]') || stage;
    const reduced = isReducedMotion();
    const fine = isFinePointer();

    gsap.set(target, { transformPerspective: 1100 });
    const rotXTo = gsap.quickTo(target, 'rotationX', { duration: 0.34, ease: 'power2.out' });
    const rotYTo = gsap.quickTo(target, 'rotationY', { duration: 0.34, ease: 'power2.out' });

    let onMove: ((e: PointerEvent) => void) | null = null;
    let onLeave: (() => void) | null = null;

    if (fine && !reduced) {
      onMove = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        const r = target.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        const nx = clamp((e.clientX - r.left) / r.width, 0, 1);
        const ny = clamp((e.clientY - r.top) / r.height, 0, 1);
        rotYTo((nx - 0.5) * 14); // ±7°
        rotXTo(-(ny - 0.5) * 14);
        target.style.setProperty('--sheen-x', `${(nx * 100).toFixed(1)}%`);
        target.style.setProperty('--sheen-y', `${(ny * 100).toFixed(1)}%`);
      };
      onLeave = () => {
        rotXTo(0);
        rotYTo(0);
      };
      stage.addEventListener('pointermove', onMove, { passive: true });
      stage.addEventListener('pointerleave', onLeave);
    }

    // Accessible keyboard / single-pointer tilt buttons (`data-pdp-tilt="left|reset|right"`)
    const scope = stage.closest('section') || document;
    const tiltBtns = Array.from(scope.querySelectorAll<HTMLElement>('[data-pdp-tilt]'));
    const btnHandlers: Array<[HTMLElement, EventListener]> = [];

    tiltBtns.forEach((btn) => {
      const handler: EventListener = () => {
        const mode = btn.getAttribute('data-pdp-tilt');
        tiltBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn && mode !== 'reset')));

        if (isReducedMotion()) {
          gsap.set(target, { rotationX: 0, rotationY: 0 });
          return;
        }
        const dir = getDir();
        if (mode === 'left') {
          rotYTo(-12 * dir);
          rotXTo(3);
        } else if (mode === 'right') {
          rotYTo(12 * dir);
          rotXTo(3);
        } else {
          rotYTo(0);
          rotXTo(0);
        }
      };
      btn.addEventListener('click', handler);
      btnHandlers.push([btn, handler]);
    });

    cleanups.push(() => {
      if (onMove) stage.removeEventListener('pointermove', onMove);
      if (onLeave) stage.removeEventListener('pointerleave', onLeave);
      btnHandlers.forEach(([b, h]) => b.removeEventListener('click', h));
      gsap.set(target, { clearProps: 'transform' });
    });
  });
}

/* ============================================================================
   MAIN ENTRYPOINT: initMotion()
   ============================================================================ */

export function initMotion(): CleanupFn {
  // Always clean up any previous initialization cleanly (prevents leaks across View Transitions)
  if (activeTeardown) {
    activeTeardown();
    activeTeardown = null;
  }

  const cleanups: CleanupFn[] = [];
  const mm = gsap.matchMedia();

  // Reduced-motion reactive listener so mid-session OS accessibility changes immediately re-sync
  const mqReduced = window.matchMedia(REDUCED_MOTION_QUERY);
  const onReducedChange = () => {
    initMotion();
  };
  mqReduced.addEventListener('change', onReducedChange);
  cleanups.push(() => mqReduced.removeEventListener('change', onReducedChange));

  // Progressive enhancement: zero static HTML starts hidden; GSAP animates only when motion is allowed
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const dir = getDir();

    // 1. Hero Entrance (vertical clip-reveal preserving Arabic cursive letter joining)
    const heroHeadline = document.querySelector<HTMLElement>('[data-hero-headline]');
    if (heroHeadline) {
      gsap.from(heroHeadline, {
        yPercent: 34,
        opacity: 0,
        duration: 0.65,
        ease: 'expo.out',
        clearProps: 'transform,opacity'
      });
    }

    const inlineImg = document.querySelector<HTMLElement>('[data-hero-inline-img]');
    if (inlineImg) {
      gsap.from(inlineImg, {
        scale: 0.82,
        opacity: 0,
        duration: 0.55,
        delay: 0.14,
        ease: 'back.out(1.6)',
        clearProps: 'transform,opacity'
      });
    }

    const heroEnterItems = document.querySelectorAll<HTMLElement>('[data-hero-enter]');
    if (heroEnterItems.length > 0) {
      gsap.from(heroEnterItems, {
        y: 18,
        x: -10 * dir,
        opacity: 0,
        duration: 0.56,
        stagger: 0.075,
        delay: 0.08,
        ease: 'power3.out',
        clearProps: 'transform,opacity'
      });
    }

    // 2. ScrollTrigger Staggered Wave Grid Reveals (`[data-reveal-card]`, max batch 8)
    const revealCards = document.querySelectorAll<HTMLElement>('[data-reveal-card]');
    if (revealCards.length > 0) {
      ScrollTrigger.batch(revealCards, {
        interval: 0.08,
        batchMax: 8,
        start: 'top 90%',
        once: true,
        onEnter: (batch) => {
          gsap.from(batch, {
            opacity: 0,
            y: 22,
            scale: 0.96,
            duration: 0.44,
            stagger: { each: 0.045, from: 'start' },
            ease: 'power3.out',
            clearProps: 'transform,opacity'
          });
        }
      });
    }

    // 3. Clean Section Scroll Entrances (`[data-reveal-section]`)
    document.querySelectorAll<HTMLElement>('[data-reveal-section]').forEach((section) => {
      gsap.from(section, {
        opacity: 0,
        y: 24,
        duration: 0.54,
        ease: 'power2.out',
        clearProps: 'transform,opacity',
        scrollTrigger: {
          trigger: section,
          start: 'top 88%',
          once: true
        }
      });
    });

    // 4. Subtle Media-Only Scroll Parallax (`[data-parallax-media]`, NEVER on text!)
    if (isFinePointer()) {
      document.querySelectorAll<HTMLElement>('[data-parallax-media]').forEach((media) => {
        const trigger = media.parentElement || media;
        gsap.to(media, {
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.6
          }
        });
      });
    }
  });

  // Mount interactive components (gracefully adapt when reduced-motion is active)
  mountHero3DStage(cleanups);
  refreshCardTricks(document);
  mountPillRails(cleanups);
  mountMagneticCtas(cleanups);
  mountPdp3DStage(cleanups);

  const teardown: CleanupFn = () => {
    teardownCardTricks();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
    mm.revert();
    ScrollTrigger.getAll().forEach((st) => st.kill());
  };

  activeTeardown = teardown;

  // Bind Astro View Transitions & pagehide teardown once per window
  if (!listenersBound) {
    listenersBound = true;
    document.addEventListener('astro:before-swap', () => {
      if (activeTeardown) {
        activeTeardown();
        activeTeardown = null;
      }
    });
    window.addEventListener('pagehide', () => {
      if (activeTeardown) {
        activeTeardown();
        activeTeardown = null;
      }
    });
  }

  return teardown;
}
