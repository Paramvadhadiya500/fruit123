/**
 * FRUTIS — Scroll-Based Frame Animation
 * script.js
 *
 * Stack: GSAP 3.12 + ScrollTrigger (CDN)
 * Frames: ./frame/frame001 (1).webp → ./frame/frame001 (80).webp
 *
 * Architecture:
 *  1. Detect prefers-reduced-motion → static fallback or animation
 *  2. Animate loader letters with GSAP
 *  3. Load frames in two batches (1–40 first, 41–80 in background)
 *  4. After batch-1 ready → init ScrollTrigger pin + scrub
 *  5. Map scroll progress [0,1] → frame index [0,79]
 *  6. At progress ≥ 0.70 → fade in hero headline
 *  7. After all frames → hide loader
 *  8. Scroll-reveal for post-hero sections via IntersectionObserver
 */

(() => {
  'use strict';

  /* ══════════════════════════════════════════════
     CONSTANTS
  ══════════════════════════════════════════════ */
  const FRAME_COUNT      = 80;
  const BATCH_SIZE       = 40;

  /* ══════════════════════════════════════════════
     DOM REFS
  ══════════════════════════════════════════════ */
  const loader         = document.getElementById('loader');
  const loaderBar      = document.getElementById('loaderBar');
  const loaderCount    = document.getElementById('loaderCount');
  const loaderPBar     = document.getElementById('loaderProgressBar');
  const canvas         = document.getElementById('heroCanvas');
  const ctx            = canvas.getContext('2d');
  const scrollCue      = document.getElementById('scrollCue');
  const heroHeadline   = document.getElementById('heroHeadline');
  const staticFallback = document.getElementById('staticFallback');
  const siteHeader     = document.getElementById('siteHeader');
  const menuToggle     = document.getElementById('menuToggle');
  const navLinks       = document.getElementById('navLinks');
  const orderForm      = document.getElementById('orderForm');
  const orderSubmit    = document.getElementById('orderSubmit');
  const orderLabel     = document.getElementById('orderSubmitLabel');

  /* ══════════════════════════════════════════════
     REDUCED MOTION CHECK
  ══════════════════════════════════════════════ */
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ══════════════════════════════════════════════
     REDUCED MOTION — STATIC FALLBACK
  ══════════════════════════════════════════════ */
  if (prefersReducedMotion) {
    if (loader)         loader.style.display        = 'none';
    if (canvas)         canvas.style.display        = 'none';
    if (staticFallback) staticFallback.style.display = 'block';
    if (heroHeadline) {
      heroHeadline.style.opacity   = '1';
      heroHeadline.style.transform = 'translateY(0)';
      heroHeadline.classList.add('is-visible');
    }
    if (scrollCue) scrollCue.style.display = 'none';
    // Skip everything else
    initNonAnimationFeatures();
    return;
  }

  /* ══════════════════════════════════════════════
     FRAME IMAGE POOL
  ══════════════════════════════════════════════ */
  const images = new Array(FRAME_COUNT).fill(null);
  let loadedCount    = 0;
  let currentIndex   = 0;
  let batch1Ready    = false;
  let allLoaded      = false;
  let scrollTrigger  = null;

  /* ══════════════════════════════════════════════
     CANVAS SIZING — COVER FIT
     Images are portrait (720×1280ish). Canvas fills viewport.
     We use cover math so the fruit always fills the screen.
  ══════════════════════════════════════════════ */
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    // Redraw current frame at new size
    if (images[currentIndex] && images[currentIndex].complete && images[currentIndex].naturalWidth > 0) {
      drawFrame(currentIndex);
    }
  }

  function drawFrame(index) {
    const img = images[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    currentIndex = index;

    const cW = canvas.width;
    const cH = canvas.height;
    const iW = img.naturalWidth;
    const iH = img.naturalHeight;

    const cRatio = cW / cH;
    const iRatio = iW / iH;

    let dW, dH, dX, dY;

    if (iRatio > cRatio) {
      // Image wider than canvas → fit height, crop sides
      dH = cH;
      dW = dH * iRatio;
      dX = (cW - dW) / 2;
      dY = 0;
    } else {
      // Image taller than canvas → fit width, crop top/bottom
      dW = cW;
      dH = dW / iRatio;
      dX = 0;
      dY = (cH - dH) / 2;
    }

    ctx.clearRect(0, 0, cW, cH);
    ctx.drawImage(img, dX, dY, dW, dH);
  }

  /* ══════════════════════════════════════════════
     FRAME PATH BUILDER
     Filename pattern: frame001 (N).webp
  ══════════════════════════════════════════════ */
  function getFramePath(n) {
    return `./frame/frame001 (${n}).webp`;
  }

  /* ══════════════════════════════════════════════
     LOADER PROGRESS UPDATE
  ══════════════════════════════════════════════ */
  function updateProgress(loaded) {
    const pct = Math.round((loaded / FRAME_COUNT) * 100);
    if (loaderBar)   loaderBar.style.width  = `${pct}%`;
    if (loaderCount) loaderCount.textContent = pct;
    if (loaderPBar)  loaderPBar.setAttribute('aria-valuenow', pct);
  }

  /* ══════════════════════════════════════════════
     LOAD ONE IMAGE — returns a Promise
  ══════════════════════════════════════════════ */
  function loadImage(n) {
    return new Promise((resolve) => {
      const img = new Image();
      images[n - 1] = img; // 0-indexed pool

      img.onload = () => {
        loadedCount++;
        updateProgress(loadedCount);
        resolve(img);
      };
      img.onerror = () => {
        // Don't block animation if a frame fails
        loadedCount++;
        updateProgress(loadedCount);
        console.warn(`[FRUTIS] Failed to load frame ${n}`);
        resolve(null);
      };

      img.src = getFramePath(n);
    });
  }

  /* ══════════════════════════════════════════════
     HEADLINE ANIMATION (Handled by ScrollTrigger)
  ══════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════
     INIT AUTO-PLAY CINEMATIC INTRO
  ══════════════════════════════════════════════ */
  function initScrollAnimation() {
    // Lock the page scroll initially
    document.body.style.overflow = 'hidden';

    // Draw first frame immediately
    drawFrame(0);
    
    // Set initial canvas zoom
    gsap.set(canvas, { scale: 1.15 });

    // Show scroll cue
    requestAnimationFrame(() => {
      scrollCue.classList.add('is-visible');
    });

    let animationTriggered = false;

    function playCinematicIntro() {
      if (animationTriggered) return;
      animationTriggered = true;

      // Remove listeners so it only triggers once
      window.removeEventListener('wheel', handleIntent);
      window.removeEventListener('touchmove', handleIntent);
      window.removeEventListener('keydown', handleKeyIntent);

      const frameObj = { frame: 0 };
      
      const tl = gsap.timeline({
        onComplete: () => {
          // Unlock the page scroll when animation completes
          document.body.style.overflow = '';
        }
      });

      // 1. Fade out the scroll cue quickly
      tl.to(scrollCue, { opacity: 0, duration: 0.3 }, 0);

      // 2. Play the frames automatically (2.5 seconds)
      tl.to(frameObj, {
        frame: FRAME_COUNT - 1,
        snap: "frame",
        duration: 2.5,
        ease: "power2.inOut", // Smooth acceleration/deceleration
        onUpdate: () => {
          const idx = Math.round(frameObj.frame);
          
          if (images[idx] && images[idx].complete && images[idx].naturalWidth > 0) {
            drawFrame(idx);
          } else if (idx > 0) {
            for (let fallback = idx - 1; fallback >= 0; fallback--) {
              if (images[fallback] && images[fallback].complete && images[fallback].naturalWidth > 0) {
                drawFrame(fallback);
                break;
              }
            }
          }
        }
      }, 0);

      // 3. Subtle zoom out tied to the timeline
      tl.to(canvas, {
        scale: 1,
        duration: 2.5,
        ease: "power2.inOut"
      }, 0);

      // 4. Parallax headline reveal near the end
      tl.fromTo(heroHeadline, 
        { opacity: 0, y: 60, filter: 'blur(12px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 1.2,
          ease: "power3.out",
          onStart: () => heroHeadline.classList.add('is-visible')
        }, 1.6 // Start revealing at 1.6s into the 2.5s timeline
      );
    }

    // Intent detection functions
    function handleIntent(e) {
      // Trigger if scrolling down, or on any mobile swipe
      if (e.type === 'wheel' && e.deltaY > 0) {
        playCinematicIntro();
      } else if (e.type === 'touchmove') {
        playCinematicIntro();
      }
    }

    function handleKeyIntent(e) {
      if (['ArrowDown', 'PageDown', 'Space'].includes(e.code)) {
        playCinematicIntro();
        e.preventDefault(); // prevent actual scrolling jump before unlock
      }
    }

    // Attach listeners after a tiny delay so the final loader scroll doesn't misfire it
    setTimeout(() => {
      window.addEventListener('wheel', handleIntent, { passive: true });
      window.addEventListener('touchmove', handleIntent, { passive: true });
      window.addEventListener('keydown', handleKeyIntent, { passive: false });
    }, 500);
  }

  /* ══════════════════════════════════════════════
     HIDE LOADER & START
  ══════════════════════════════════════════════ */
  function hideLoader() {
    gsap.to(loader, {
      opacity: 0,
      duration: 0.9,
      ease: 'power2.out',
      onComplete() {
        loader.style.display = 'none';
        loader.setAttribute('aria-hidden', 'true');
      },
    });
  }

  /* ══════════════════════════════════════════════
     FRAME LOADING — BATCHED
  ══════════════════════════════════════════════ */
  async function loadFrames() {
    const batch1 = Array.from({ length: BATCH_SIZE }, (_, i) => i + 1);            // 1–40
    const batch2 = Array.from({ length: FRAME_COUNT - BATCH_SIZE }, (_, i) => i + BATCH_SIZE + 1); // 41–80

    // === BATCH 1 — interactive threshold ===
    await Promise.all(batch1.map(loadImage));
    batch1Ready = true;

    // Enable scroll animation as soon as batch 1 is ready
    initScrollAnimation();
    hideLoader();

    // === BATCH 2 — background load ===
    await Promise.all(batch2.map(loadImage));
    allLoaded = true;
  }

  /* ══════════════════════════════════════════════
     LOADER ENTRANCE ANIMATION
  ══════════════════════════════════════════════ */
  function animateLoader() {
    // Stagger the brand letters in
    gsap.to('.loader__letter', {
      opacity: 1,
      y: 0,
      stagger: 0.075,
      duration: 0.55,
      ease: 'power3.out',
      delay: 0.2,
    });

    // Fade in tagline
    gsap.to('.loader__tagline', {
      opacity: 1,
      duration: 0.6,
      ease: 'power2.out',
      delay: 0.75,
    });
  }

  /* ══════════════════════════════════════════════
     NAVIGATION — SCROLL STATE
  ══════════════════════════════════════════════ */
  function initNav() {
    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 30) {
            siteHeader.classList.add('nav--scrolled');
          } else {
            siteHeader.classList.remove('nav--scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile menu toggle
    if (menuToggle && navLinks) {
      menuToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('is-open');
        menuToggle.setAttribute('aria-expanded', isOpen);
        menuToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        // Prevent body scroll when menu open
        document.body.style.overflow = isOpen ? 'hidden' : '';
      });

      // Close menu on link click
      navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          navLinks.classList.remove('is-open');
          menuToggle.setAttribute('aria-expanded', 'false');
          menuToggle.setAttribute('aria-label', 'Open menu');
          document.body.style.overflow = '';
        });
      });
    }
  }

  /* ══════════════════════════════════════════════
     SMOOTH SCROLL FOR ANCHOR LINKS
  ══════════════════════════════════════════════ */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', (e) => {
        const id     = anchor.getAttribute('href');
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();

        // If ScrollTrigger is active and we're in the hero pin zone, kill it first
        // to allow smooth scroll to destination
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ══════════════════════════════════════════════
     SCROLL REVEAL — POST-HERO SECTIONS
     Using IntersectionObserver (no GSAP dep for simple reveals)
  ══════════════════════════════════════════════ */
  function initScrollReveal() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target); // Fire once
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    document.querySelectorAll('.reveal-up, .ingredient-card').forEach(el => {
      observer.observe(el);
    });
  }

  /* ══════════════════════════════════════════════
     ORDER FORM SUBMIT
  ══════════════════════════════════════════════ */
  function initOrderForm() {
    if (!orderForm) return;

    orderForm.addEventListener('submit', (e) => {
      e.preventDefault();

      if (!orderForm.checkValidity()) {
        orderForm.reportValidity();
        return;
      }

      // Success state
      orderSubmit.disabled = true;
      orderSubmit.classList.add('is-sent');
      if (orderLabel) orderLabel.textContent = 'Request Sent ✓';

      // Optionally: clear form after delay
      setTimeout(() => {
        orderForm.reset();
        orderSubmit.disabled = false;
        orderSubmit.classList.remove('is-sent');
        if (orderLabel) orderLabel.textContent = 'Send Request';
      }, 4000);
    });
  }

  /* ══════════════════════════════════════════════
     NON-ANIMATION FEATURES (shared with reduced-motion path)
  ══════════════════════════════════════════════ */
  function initNonAnimationFeatures() {
    initNav();
    initSmoothScroll();
    initScrollReveal();
    initOrderForm();
  }

  /* ══════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════ */
  function init() {
    // Canvas initial size
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Kick off loader animation
    animateLoader();

    // Start loading frames
    loadFrames();

    // All other UI features
    initNonAnimationFeatures();
  }

  // Wait for DOM to be fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
