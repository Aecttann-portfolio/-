const revealItems = document.querySelectorAll(".reveal");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);

const addMediaQueryListener = (query, listener) => {
  if (query.addEventListener) {
    query.addEventListener("change", listener);
    return;
  }

  query.addListener(listener);
};

const createSmoothScroller = () => {
  const isReducedMotion = () => reducedMotionQuery.matches;

  if (window.Lenis && !isReducedMotion()) {
    const lenis = new window.Lenis({
      duration: 0.9,
      easing: easeOutCubic,
      smoothWheel: true,
      smoothTouch: false,
      wheelMultiplier: 0.9
    });

    let lenisFrame = 0;
    let lenisStopped = false;
    const raf = (time) => {
      if (lenisStopped) return;

      lenis.raf(time);
      lenisFrame = window.requestAnimationFrame(raf);
    };

    lenisFrame = window.requestAnimationFrame(raf);

    const stopLenis = () => {
      if (lenisStopped) return;

      lenisStopped = true;
      window.cancelAnimationFrame(lenisFrame);
      lenis.destroy();
    };

    addMediaQueryListener(reducedMotionQuery, (event) => {
      if (event.matches) stopLenis();
    });

    return {
      scrollTo(target, options = {}) {
        if (isReducedMotion()) {
          window.scrollTo({ top: resolveScrollTarget(target) + (options.offset ?? 0), behavior: "auto" });
          return;
        }

        lenis.scrollTo(resolveScrollTarget(target), {
          offset: options.offset ?? 0,
          immediate: options.immediate ?? false
        });
      }
    };
  }

  const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;

  if (!supportsFinePointer || isReducedMotion()) {
    return {
      scrollTo(target, options = {}) {
        window.scrollTo({ top: resolveScrollTarget(target) + (options.offset ?? 0), behavior: "auto" });
      }
    };
  }

  let currentY = window.scrollY;
  let targetY = currentY;
  let startY = currentY;
  let startTime = 0;
  let frame = 0;
  let isAnimating = false;
  let isProgrammaticScroll = false;
  const duration = 880;
  const wheelMultiplier = 0.9;

  const maxScrollY = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const clampScrollY = (value) => Math.min(Math.max(value, 0), maxScrollY());

  const stopAnimation = () => {
    if (!frame) return;

    window.cancelAnimationFrame(frame);
    frame = 0;
    isAnimating = false;
  };

  const animate = (time) => {
    if (!startTime) startTime = time;

    const progress = Math.min((time - startTime) / duration, 1);
    const nextY = startY + (targetY - startY) * easeOutCubic(progress);
    currentY = nextY;
    isProgrammaticScroll = true;
    window.scrollTo(0, nextY);
    isProgrammaticScroll = false;

    if (progress < 1 && Math.abs(targetY - nextY) > 0.35) {
      frame = window.requestAnimationFrame(animate);
      return;
    }

    currentY = targetY;
    isProgrammaticScroll = true;
    window.scrollTo(0, targetY);
    isProgrammaticScroll = false;
    frame = 0;
    isAnimating = false;
    startTime = 0;
  };

  const startScroll = (nextTargetY, immediate = false) => {
    targetY = clampScrollY(nextTargetY);

    if (immediate || isReducedMotion()) {
      stopAnimation();
      currentY = targetY;
      window.scrollTo({ top: targetY, behavior: "auto" });
      return;
    }

    startY = window.scrollY;
    currentY = startY;
    startTime = 0;

    if (frame) window.cancelAnimationFrame(frame);
    isAnimating = true;
    frame = window.requestAnimationFrame(animate);
  };

  const normalizeWheelDelta = (event) => {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
    return event.deltaY;
  };

  const findScrollableParent = (target) => {
    let element = target instanceof Element ? target : null;

    while (element && element !== document.body && element !== document.documentElement) {
      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const canScroll = /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight;

      if (canScroll) return element;

      element = element.parentElement;
    }

    return null;
  };

  const shouldUseNativeWheel = (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey) return true;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return true;

    const scrollableParent = findScrollableParent(event.target);
    if (!scrollableParent) return false;

    const deltaY = normalizeWheelDelta(event);
    const scrollTop = scrollableParent.scrollTop;
    const maxScrollTop = scrollableParent.scrollHeight - scrollableParent.clientHeight;

    return !((deltaY < 0 && scrollTop <= 0) || (deltaY > 0 && scrollTop >= maxScrollTop));
  };

  const onWheel = (event) => {
    if (event.ctrlKey || event.metaKey) {
      stopAnimation();
      currentY = window.scrollY;
      targetY = currentY;
      startY = currentY;
      return;
    }

    if (shouldUseNativeWheel(event)) return;

    event.preventDefault();
    const nextTargetY = targetY + normalizeWheelDelta(event) * wheelMultiplier;
    startScroll(nextTargetY);
  };

  const onNativeScroll = () => {
    if (isProgrammaticScroll || isAnimating) return;

    currentY = window.scrollY;
    targetY = currentY;
    startY = currentY;
  };

  const onReducedMotionChange = (event) => {
    if (!event.matches) return;

    stopAnimation();
    currentY = window.scrollY;
    targetY = currentY;
    startY = currentY;
  };

  const onKeyDown = (event) => {
    const scrollKeys = [" ", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"];
    if (event.defaultPrevented || !scrollKeys.includes(event.key)) return;

    stopAnimation();
    currentY = window.scrollY;
    targetY = currentY;
    startY = currentY;
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onNativeScroll, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  addMediaQueryListener(reducedMotionQuery, onReducedMotionChange);

  return {
    scrollTo(target, options = {}) {
      startScroll(resolveScrollTarget(target) + (options.offset ?? 0), options.immediate);
    }
  };
};

const resolveScrollTarget = (target) => {
  if (typeof target === "number") return target;
  if (target instanceof Element) return target.getBoundingClientRect().top + window.scrollY;
  return 0;
};

const smoothScroller = createSmoothScroller();

const initializeSlideshows = () => {
  document.querySelectorAll("[data-slideshow]").forEach((slideshow) => {
    const slides = Array.from(slideshow.querySelectorAll(".phone-slideshow__slide"));
    const dots = Array.from(slideshow.querySelectorAll(".phone-slideshow__dots span"));
    const previousButton = slideshow.querySelector("[data-slideshow-previous]");
    const nextButton = slideshow.querySelector("[data-slideshow-next]");
    const intervalMs = Number(slideshow.dataset.interval) || 3000;

    if (slides.length <= 1) {
      previousButton?.setAttribute("hidden", "");
      nextButton?.setAttribute("hidden", "");
      return;
    }

    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
    let autoplayTimer = 0;
    let autoplayStoppedByUser = false;

    const setActiveSlide = (nextIndex) => {
      activeIndex = (nextIndex + slides.length) % slides.length;

      slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
      });

      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", index === activeIndex);
      });
    };

    const stopAutoplay = () => {
      autoplayStoppedByUser = true;
      window.clearInterval(autoplayTimer);
      autoplayTimer = 0;
    };

    const moveSlide = (direction, isManual = false) => {
      if (isManual) stopAutoplay();
      setActiveSlide(activeIndex + direction);
    };

    previousButton?.addEventListener("click", () => moveSlide(-1, true));
    nextButton?.addEventListener("click", () => moveSlide(1, true));

    setActiveSlide(activeIndex);

    if (!reducedMotionQuery.matches) {
      autoplayTimer = window.setInterval(() => {
        if (!autoplayStoppedByUser) moveSlide(1);
      }, intervalMs);
    }

    addMediaQueryListener(reducedMotionQuery, (event) => {
      if (!event.matches) return;

      window.clearInterval(autoplayTimer);
      autoplayTimer = 0;
    });
  });
};

initializeSlideshows();

if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("visible"));
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const selector = link.getAttribute("href");
    if (!selector || selector === "#") return;

    const target = document.querySelector(selector);
    if (!target) return;

    event.preventDefault();
    smoothScroller.scrollTo(target);
  });
});

const pwaActionChip = document.querySelector(".project-title__action-chip--pwa");
const pwaPopover = pwaActionChip?.querySelector(".project-title__pwa-popover");

if (pwaActionChip && pwaPopover) {
  pwaActionChip.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) return;

    event.preventDefault();
    pwaActionChip.classList.toggle("is-open");
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (pwaActionChip.contains(event.target)) return;

    pwaActionChip.classList.remove("is-open");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    pwaActionChip.classList.remove("is-open");
  });
}

const topButton = document.querySelector(".top-button");
const expertiseSection = document.querySelector("#expertise");
let topButtonTicking = false;

const updateTopButtonVisibility = () => {
  if (!topButton || !expertiseSection) return;

  const expertiseTop = expertiseSection.getBoundingClientRect().top + window.scrollY;
  topButton.classList.toggle("is-visible", window.scrollY >= expertiseTop - 1);
};

const requestTopButtonUpdate = () => {
  if (topButtonTicking) return;

  topButtonTicking = true;
  window.requestAnimationFrame(() => {
    updateTopButtonVisibility();
    topButtonTicking = false;
  });
};

window.addEventListener("scroll", requestTopButtonUpdate, { passive: true });
window.addEventListener("resize", requestTopButtonUpdate);
window.addEventListener("load", updateTopButtonVisibility);
updateTopButtonVisibility();

topButton?.addEventListener("click", () => {
  smoothScroller.scrollTo(0);
});

const contactForm = document.querySelector(".contact-form");

const setContactFormStatus = (statusElement, message, type = "") => {
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.classList.toggle("is-success", type === "success");
  statusElement.classList.toggle("is-error", type === "error");
};

const getContactFormEndpoint = (form) => {
  const endpoint = form.getAttribute("action") || "";
  const trimmedEndpoint = endpoint.trim();

  if (!trimmedEndpoint) return "";
  if (!/^https?:\/\//.test(trimmedEndpoint)) return "";

  return trimmedEndpoint;
};

const submitForminitForm = async (form, formData) => {
  const formId = form.dataset.forminitFormId;

  if (formId && window.Forminit) {
    const forminit = new window.Forminit();
    const result = await forminit.submit(formId, formData);

    if (result?.error) {
      throw new Error(result.error.message || "Forminit submission failed");
    }

    return;
  }

  const endpoint = getContactFormEndpoint(form);

  if (!endpoint) {
    throw new Error("Forminit endpoint is not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Contact form request failed with status ${response.status}`);
  }
};

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const statusElement = form.querySelector(".contact-form__status");
  const submitButton = form.querySelector('button[type="submit"]');
  const honeypot = form.querySelector('input[name="website"]');

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  if (honeypot?.value) {
    form.reset();
    setContactFormStatus(statusElement, "Thanks, your message has been sent.", "success");
    return;
  }

  const originalButtonText = submitButton?.textContent || "";

  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    setContactFormStatus(statusElement, "");

    const formData = new FormData(form);
    formData.delete("website");
    await submitForminitForm(form, formData);

    form.reset();
    setContactFormStatus(statusElement, "Thanks, your message has been sent.", "success");
  } catch (error) {
    setContactFormStatus(statusElement, "Message was not sent. Please email me directly and try again later.", "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }
});
