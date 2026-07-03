const API_URL = "https://oursongapp.com/api/pizzas";
const INITIAL_PIZZA_ID = "pepperoni-blast";
const SIZES = ["S", "M", "L"];
const SIZE_PIXELS = { S: 196, M: 244, L: 274 };
const SPLASH_ORDER = [2, 3, 4, 5, 6, 7, 0, 1];
const SLICE_MASKS = [
  { start: -87, sweep: 52 },
  { start: -35, sweep: 39 },
  { start: 4, sweep: 38 },
  { start: 42, sweep: 47 },
  { start: 89, sweep: 42 },
  { start: 131, sweep: 43 },
  { start: 174, sweep: 47 },
  { start: -139, sweep: 52 }
];
const SLICE_ANIM_MS = 18;
const SLICE_STAGGER_MS = 24;
const SLICE_STEP_MS = SLICE_ANIM_MS + SLICE_STAGGER_MS;
const SPLASH_RELEASE_MS = SPLASH_ORDER.length * SLICE_STEP_MS + 50;
const CATALOG_BG_ENTER_DELAY_MS = 35;
const CATALOG_BG_ENTER_MS = 120;
const CATALOG_CONTENT_ENTER_DELAY_MS = 95;
const CATALOG_CONTENT_ENTER_MS = 130;
const MAX_ZOOM = 5.2;
const ZOOM_PAN_MULTIPLIER = 3.4;
const ZOOM_ANIMATION_DURATION_MS = 475;
const ZOOM_IN_OVERSHOOT = 1.018;
const ZOOM_OUT_UNDERSHOOT = 0.94;
const SIZE_BOUNCE_DURATION_MS = 220;
const SIZE_L_TO_M_SHRINK_DURATION_MS = 260;
const PAGE_SETTLE_PULL_DURATION_MS = 315;
const PAGE_SETTLE_PULL_DISTANCE = 8;
const INFO_PANEL_ZOOM_EXIT = 620;
const INFO_PANEL_BOUNCE_DURATION_MS = 240;
const INFO_PANEL_BOUNCE_DISTANCE = 12;
const FALLBACK_PIZZAS = [
  {
    id: "midnight-harvest",
    name: "Midnight Harvest",
    description:
      "This pizza celebrates the rich and bold flavors of black olives paired with a medley of cheeses. The deep, earthy taste of black olives harmonizes beautifully with the creamy, melted cheeses.",
    imageUrl: "https://oursongapp.com/images/pizzas/pizza_midnight_harvest.png",
    variants: [
      { size: "S", price: 14.99 },
      { size: "M", price: 17.99 },
      { size: "L", price: 21.99 }
    ],
    defaultSize: "M"
  },
  {
    id: "pepperoni-blast",
    name: "Pepperoni Blast",
    description:
      "The combination of perfectly melted mozzarella cheese, tangy tomato sauce, and a crispy yet chewy crust creates a harmonious balance that leaves you wanting more.",
    imageUrl: "https://oursongapp.com/images/pizzas/pizza_pepperoni_blast.png",
    variants: [
      { size: "S", price: 15.5 },
      { size: "M", price: 17.99 },
      { size: "L", price: 22.5 }
    ],
    defaultSize: "M"
  },
  {
    id: "shrimptastic",
    name: "Shrimptastic",
    description:
      "This pizza showcases the perfect combination of shrimp and cheese, with gooey melted cheeses complementing the savory shrimp toppings for a truly indulgent experience.",
    imageUrl: "https://oursongapp.com/images/pizzas/pizza_shrimptastic.png",
    variants: [
      { size: "S", price: 18.99 },
      { size: "M", price: 21.99 },
      { size: "L", price: 25.99 }
    ],
    defaultSize: "M"
  }
];

const state = {
  route: "splash",
  pizzas: [],
  activeIndex: 0,
  selectedSize: "M",
  quantities: new Map(),
  loadError: null,
  retrying: false,
  zoom: null,
  toast: "",
  favoriteIds: new Set(),
  deferredInstallPrompt: null,
  installPanelVisible: new URLSearchParams(window.location.search).get("install") === "1",
  previousSize: "M",
  settleDirection: 0
};

const app = document.querySelector("#app");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  if (state.installPanelVisible && state.route === "catalog") render();
});

window.addEventListener("appinstalled", () => {
  state.deferredInstallPrompt = null;
  state.installPanelVisible = false;
  state.toast = "App installed";
  render();
  queueToastClear();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

boot();

async function boot() {
  renderSplash();
  const loadPromise = loadPizzas();
  await delay(SPLASH_RELEASE_MS);
  state.route = "catalog";
  render();
  await loadPromise;
  if (state.route === "catalog") render();
}

async function loadPizzas() {
  state.loadError = null;
  try {
    const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const mapped = mapPizzas(body.pizzas);
    if (!mapped.length) throw new Error("No valid pizzas");
    applyPizzas(mapped);
  } catch (error) {
    const cached = readCachedPizzas();
    if (cached.length) {
      applyPizzas(cached);
      state.toast = "Showing saved menu";
      queueToastClear();
      return;
    }
    state.pizzas = [];
    state.loadError = "NetworkUnavailable";
  }
}

function applyPizzas(pizzas) {
  state.pizzas = pizzas;
  try {
    localStorage.setItem("pizza-pwa:last-menu", JSON.stringify(pizzas));
  } catch (error) {
    // Storage can be disabled in private contexts; the service worker still caches network assets.
  }
  const initial = pizzas.findIndex((pizza) => pizza.id === INITIAL_PIZZA_ID);
  state.activeIndex = initial >= 0 ? initial : 0;
  state.selectedSize = activePizza()?.defaultSize ?? "M";
}

function readCachedPizzas() {
  try {
    const parsed = JSON.parse(localStorage.getItem("pizza-pwa:last-menu") || "[]");
    const mapped = mapPizzas(parsed);
    return mapped.length ? mapped : FALLBACK_PIZZAS;
  } catch (error) {
    return FALLBACK_PIZZAS;
  }
}

function mapPizzas(rawPizzas) {
  if (!Array.isArray(rawPizzas)) return [];
  return rawPizzas
    .map((pizza) => {
      const variants = Array.isArray(pizza.variants)
        ? pizza.variants
            .map((variant) => ({
              size: normalizeSize(variant.size),
              price: Number(variant.price)
            }))
            .filter((variant) => variant.size && Number.isFinite(variant.price))
        : [];
      if (!variants.length) return null;
      const defaultSize = normalizeSize(pizza.default_size ?? pizza.defaultSize) ?? variants[0].size;
      return {
        id: String(pizza.id),
        name: String(pizza.name),
        description: String(pizza.description),
        imageUrl: String(pizza.image_url ?? pizza.imageUrl),
        variants,
        defaultSize
      };
    })
    .filter(Boolean);
}

function normalizeSize(raw) {
  const value = String(raw || "").toUpperCase();
  return SIZES.includes(value) ? value : null;
}

function renderSplash() {
  app.innerHTML = `
    <main class="phone-stage splash" aria-label="Loading pizza catalog">
      <div class="splash-pizza" aria-hidden="true">
        ${SPLASH_ORDER.map(
          (slice, order) =>
            `<img class="splash-slice" style="clip-path:${wedgeClipPath(SLICE_MASKS[slice])}; animation-delay:${order * SLICE_STEP_MS}ms" src="./assets/images/splash_pizza.png" alt="">`
        ).join("")}
      </div>
    </main>
  `;
}

function render() {
  if (state.route === "splash") {
    renderSplash();
    return;
  }

  if (state.loadError) {
    renderError();
    return;
  }

  if (!state.pizzas.length) {
    app.innerHTML = `
      <main class="phone-stage">
        <div class="catalog-bg"></div>
        <section class="loading" aria-label="Loading catalog"><div class="spinner"></div></section>
        ${state.installPanelVisible ? installPanelMarkup() : ""}
      </main>
    `;
    return;
  }

  const pizza = activePizza();
  const prev = pizzaAt(state.activeIndex - 1);
  const next = pizzaAt(state.activeIndex + 1);
  const quantity = quantityFor(pizza.id);
  const price = totalPriceFor(pizza, state.selectedSize, quantity);
  const sizePx = SIZE_PIXELS[state.selectedSize];
  const isFavorite = state.favoriteIds.has(pizza.id);
  const sizeDuration = state.previousSize === "L" && state.selectedSize === "M" ? SIZE_L_TO_M_SHRINK_DURATION_MS : 0;

  app.innerHTML = `
    <main class="phone-stage">
      <section class="catalog" aria-label="Pizza catalog">
        <div class="catalog-bg"></div>
        <header class="nav">
          <button class="round-button" data-action="install" aria-label="Install app">
            <span class="material-symbols-rounded" aria-hidden="true">install_desktop</span>
          </button>
          <h1 class="nav-title">
            <span class="nav-kicker">Pizzas</span>
            <span class="nav-name">${escapeHtml(pizza.name)}</span>
          </h1>
          <button class="round-button" data-action="favorite" aria-label="${isFavorite ? "Remove favorite" : "Add favorite"}">
            <span class="material-symbols-rounded" aria-hidden="true">${isFavorite ? "favorite" : "favorite_border"}</span>
          </button>
        </header>

        <div class="carousel" data-carousel style="--settle-distance:${state.settleDirection * PAGE_SETTLE_PULL_DISTANCE}px">
          <button class="pizza-side prev" data-action="prev" aria-label="Previous pizza">
            <img class="pizza-image" src="${escapeAttribute(prev.imageUrl)}" alt="${escapeAttribute(prev.name)}">
          </button>
          <div class="pizza-center-wrap" style="--pizza-size:${sizePx}px; --size-duration:${sizeDuration}ms">
            <img class="pizza-image pizza-center ${sizeChangeAnimationClass()}" data-center-pizza src="${escapeAttribute(pizza.imageUrl)}" alt="${escapeAttribute(pizza.name)}">
            <button class="zoom-button" data-action="zoom" aria-label="Zoom pizza">
              <span class="material-symbols-rounded" aria-hidden="true">search</span>
            </button>
          </div>
          <button class="pizza-side next" data-action="next" aria-label="Next pizza">
            <img class="pizza-image" src="${escapeAttribute(next.imageUrl)}" alt="${escapeAttribute(next.name)}">
          </button>
        </div>

        <section class="info-panel">
          <div class="banana-wrap" aria-hidden="true">
            <div class="banana-text">${bananaLetters()}</div>
            <img class="banana" src="./assets/images/banana_scale.png" alt="">
          </div>

          <div class="size-selector" role="radiogroup" aria-label="Pizza size">
            ${SIZES.map(
              (size) => `
                <button class="size-pill ${size === state.selectedSize ? "active" : ""}" data-size="${size}" role="radio" aria-checked="${size === state.selectedSize}">
                  <span class="size-pill-inner">${size}</span>
                </button>
              `
            ).join("")}
          </div>

          <p class="description">${escapeHtml(pizza.description)}</p>

          <div class="order-bar">
            <div class="quantity" aria-label="Quantity">
              <button class="quantity-button" data-action="decrement" ${quantity <= 1 ? "disabled" : ""} aria-label="Decrease quantity">-</button>
              <span class="quantity-value">${quantity}</span>
              <button class="quantity-button" data-action="increment" aria-label="Increase quantity">+</button>
            </div>
            <strong class="price">$${formatPrice(price)}</strong>
            <button class="add-button" data-action="add">Add</button>
          </div>
        </section>
      </section>
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
      ${state.installPanelVisible ? installPanelMarkup() : ""}
      ${state.zoom ? zoomMarkup(state.zoom) : ""}
    </main>
  `;

  bindCatalogEvents();
  playPostRenderMotion();
}

function renderError() {
  app.innerHTML = `
    <main class="phone-stage">
      <div class="catalog-bg"></div>
      <section class="loading"><div class="spinner"></div></section>
      ${state.installPanelVisible ? installPanelMarkup() : ""}
      <div class="dialog-backdrop">
        <article class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
          <h2 id="offline-title">No internet connection</h2>
          <p>Check your connection and try again.</p>
          <button data-action="retry">${state.retrying ? "Trying..." : "Try again"}</button>
        </article>
      </div>
    </main>
  `;
  app.querySelector("[data-action='retry']").addEventListener("click", retryLoad);
}

function bindCatalogEvents() {
  app.querySelector("[data-action='prev']").addEventListener("click", () => selectPizza(state.activeIndex - 1));
  app.querySelector("[data-action='next']").addEventListener("click", () => selectPizza(state.activeIndex + 1));
  app.querySelector("[data-action='zoom']").addEventListener("click", openZoom);
  app.querySelector("[data-center-pizza]").addEventListener("click", openZoom);
  app.querySelector("[data-action='favorite']").addEventListener("click", toggleFavorite);
  app.querySelector("[data-action='install']").addEventListener("click", installOrToast);
  app.querySelector("[data-action='increment']").addEventListener("click", incrementQuantity);
  app.querySelector("[data-action='decrement']").addEventListener("click", decrementQuantity);
  app.querySelector("[data-action='add']").addEventListener("click", addToOrder);
  app.querySelector("[data-action='confirm-install']")?.addEventListener("click", installOrToast);
  app.querySelector("[data-action='dismiss-install']")?.addEventListener("click", dismissInstallPanel);
  app.querySelectorAll("[data-size]").forEach((button) => {
    button.addEventListener("click", () => selectSize(button.dataset.size));
  });
  bindSwipe(app.querySelector("[data-carousel]"));
  if (state.zoom) bindZoom();
}

function bindSwipe(element) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  element.addEventListener("pointerdown", (event) => {
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
  });
  element.addEventListener("pointerup", (event) => {
    if (!tracking) return;
    tracking = false;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy)) {
      selectPizza(state.activeIndex + (dx < 0 ? 1 : -1));
    }
  });
}

function zoomMarkup(zoom) {
  const pizza = activePizza();
  return `
    <div class="zoom-layer" data-zoom-layer style="--pan-x:${zoom.panX}px; --pan-y:${zoom.panY}px" role="dialog" aria-label="Zoomed pizza">
      <img src="${escapeAttribute(pizza.imageUrl)}" alt="${escapeAttribute(pizza.name)}">
    </div>
  `;
}

function installPanelMarkup() {
  const installCopy = state.deferredInstallPrompt
    ? "Install Pizza MA as a desktop app for quick launch and fullscreen browsing."
    : "Open your browser install menu to add Pizza MA to the desktop.";
  return `
    <div class="install-panel" role="dialog" aria-modal="false" aria-labelledby="install-title">
      <article class="install-card">
        <div>
          <h2 id="install-title">Install Pizza MA</h2>
          <p>${installCopy}</p>
        </div>
        <div class="install-actions">
          <button class="install-secondary" data-action="dismiss-install">Later</button>
          <button class="install-primary" data-action="confirm-install">Install</button>
        </div>
      </article>
    </div>
  `;
}

function playPostRenderMotion() {
  const carousel = app.querySelector("[data-carousel]");
  if (carousel && state.settleDirection !== 0) {
    carousel.classList.add("settle-pull");
    carousel.addEventListener(
      "animationend",
      () => {
        state.settleDirection = 0;
        carousel.classList.remove("settle-pull");
      },
      { once: true }
    );
  }

  state.previousSize = state.selectedSize;
}

function sizeChangeAnimationClass() {
  if (state.previousSize === state.selectedSize) return "";
  if (state.previousSize === "L" && state.selectedSize === "M") return "smooth-shrink";
  return "bounce";
}

function animateInfoPanelOut() {
  const panel = app.querySelector(".info-panel");
  if (!panel) return;
  panel.animate(
    [
      { transform: "translateY(0px)" },
      { transform: `translateY(${INFO_PANEL_ZOOM_EXIT}px)` }
    ],
    {
      duration: ZOOM_ANIMATION_DURATION_MS,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards"
    }
  );
}

function animateInfoPanelBounce() {
  const panel = app.querySelector(".info-panel");
  if (!panel) return;
  panel.animate(
    [
      { transform: "translateY(0px)" },
      { transform: `translateY(${-INFO_PANEL_BOUNCE_DISTANCE}px)`, offset: 0.29 },
      { transform: `translateY(${INFO_PANEL_BOUNCE_DISTANCE * 0.2}px)`, offset: 0.65 },
      { transform: "translateY(0px)" }
    ],
    {
      duration: INFO_PANEL_BOUNCE_DURATION_MS,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)"
    }
  );
}

function bindZoom() {
  const layer = app.querySelector("[data-zoom-layer]");
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let moved = false;

  layer.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    moved = false;
    layer.classList.add("dragging");
    layer.setPointerCapture(pointerId);
  });

  layer.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId || !state.zoom) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
    state.zoom.panX += dx * ZOOM_PAN_MULTIPLIER;
    state.zoom.panY += dy * ZOOM_PAN_MULTIPLIER;
    lastX = event.clientX;
    lastY = event.clientY;
    layer.style.setProperty("--pan-x", `${state.zoom.panX}px`);
    layer.style.setProperty("--pan-y", `${state.zoom.panY}px`);
  });

  layer.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) return;
    layer.classList.remove("dragging");
    pointerId = null;
    if (!moved) closeZoom();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.zoom) closeZoom();
  if (event.key === "ArrowLeft" && state.pizzas.length && !state.zoom) selectPizza(state.activeIndex - 1);
  if (event.key === "ArrowRight" && state.pizzas.length && !state.zoom) selectPizza(state.activeIndex + 1);
});

function openZoom() {
  state.zoom = { panX: 0, panY: 0 };
  render();
  animateInfoPanelOut();
}

async function closeZoom() {
  const layer = app.querySelector("[data-zoom-layer]");
  const image = layer?.querySelector("img");
  const panel = app.querySelector(".info-panel");
  const zoom = state.zoom;
  if (image && zoom) {
    layer.classList.remove("dragging");
    await Promise.all([
      image.animate(
        [
          { transform: `translate(${zoom.panX}px, ${zoom.panY}px) scale(${MAX_ZOOM})` },
          { transform: `translate(0px, 0px) scale(${ZOOM_OUT_UNDERSHOOT})`, offset: 0.82 },
          { transform: "translate(0px, 0px) scale(1)" }
        ],
        {
          duration: ZOOM_ANIMATION_DURATION_MS,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards"
        }
      ).finished.catch(() => {}),
      panel
        ? panel.animate(
            [
              { transform: `translateY(${INFO_PANEL_ZOOM_EXIT}px)` },
              { transform: "translateY(0px)" }
            ],
            {
              duration: ZOOM_ANIMATION_DURATION_MS,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              fill: "forwards"
            }
          ).finished.catch(() => {})
        : Promise.resolve()
    ]);
  }
  state.zoom = null;
  render();
  animateInfoPanelBounce();
}

function selectPizza(index) {
  const fromIndex = state.activeIndex;
  state.activeIndex = modulo(index, state.pizzas.length);
  state.selectedSize = activePizza().defaultSize;
  state.zoom = null;
  state.settleDirection = state.activeIndex === fromIndex ? 0 : index > fromIndex ? -1 : 1;
  render();
}

function selectSize(size) {
  if (!SIZES.includes(size) || size === state.selectedSize) return;
  state.previousSize = state.selectedSize;
  state.selectedSize = size;
  render();
}

function incrementQuantity() {
  const pizza = activePizza();
  state.quantities.set(pizza.id, quantityFor(pizza.id) + 1);
  render();
}

function decrementQuantity() {
  const pizza = activePizza();
  state.quantities.set(pizza.id, Math.max(1, quantityFor(pizza.id) - 1));
  render();
}

function addToOrder() {
  const pizza = activePizza();
  state.toast = `${quantityFor(pizza.id)} ${pizza.name} added`;
  render();
  queueToastClear();
}

function toggleFavorite() {
  const id = activePizza().id;
  if (state.favoriteIds.has(id)) {
    state.favoriteIds.delete(id);
  } else {
    state.favoriteIds.add(id);
  }
  render();
}

async function installOrToast() {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice.catch(() => null);
    state.deferredInstallPrompt = null;
    state.installPanelVisible = false;
    render();
    return;
  }
  state.toast = "Install from your browser menu";
  render();
  queueToastClear();
}

function dismissInstallPanel() {
  state.installPanelVisible = false;
  render();
}

async function retryLoad() {
  state.retrying = true;
  renderError();
  await loadPizzas();
  state.retrying = false;
  render();
}

function queueToastClear() {
  window.clearTimeout(queueToastClear.timer);
  queueToastClear.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 1800);
}

function activePizza() {
  return state.pizzas[state.activeIndex];
}

function pizzaAt(index) {
  return state.pizzas[modulo(index, state.pizzas.length)];
}

function quantityFor(id) {
  return state.quantities.get(id) ?? 1;
}

function totalPriceFor(pizza, size, quantity) {
  const variant = pizza.variants.find((item) => item.size === size) ?? pizza.variants[0];
  return variant.price * quantity;
}

function formatPrice(value) {
  const cents = Math.round(value * 100);
  const whole = Math.trunc(cents / 100);
  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function modulo(value, size) {
  return ((value % size) + size) % size;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bananaLetters() {
  const text = "Banana for scale";
  const start = -56;
  const step = 8.6;
  return [...text]
    .map((letter, index) => {
      const angle = start + index * step;
      return `<span style="transform: rotate(${angle}deg)">${letter === " " ? "&nbsp;" : escapeHtml(letter)}</span>`;
    })
    .join("");
}

function wedgeClipPath(mask) {
  const points = ["50% 50%"];
  const steps = Math.max(8, Math.ceil(Math.abs(mask.sweep) / 4));
  for (let i = 0; i <= steps; i++) {
    const degrees = mask.start + (mask.sweep * i) / steps;
    const radians = (degrees * Math.PI) / 180;
    const x = 50 + Math.cos(radians) * 50;
    const y = 50 + Math.sin(radians) * 50;
    points.push(`${x.toFixed(3)}% ${y.toFixed(3)}%`);
  }
  return `polygon(${points.join(",")})`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
