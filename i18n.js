(() => {
  "use strict";

  const supportedLanguages = ["en", "uk"];
  const siteRoot = new URL("./", document.currentScript.src);
  const sourceLanguage = document.documentElement.lang;
  let initialized = false;

  const isSupported = (value) => supportedLanguages.includes(value);

  const resolveLanguage = () => {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("lang");
    if (isSupported(requested)) return requested;

    const pathLanguage = url.pathname.slice(siteRoot.pathname.length).split("/")[0];
    if (isSupported(pathLanguage)) return pathLanguage;

    return "en";
  };

  let language = resolveLanguage();
  document.documentElement.lang = language;
  if (language !== sourceLanguage) document.documentElement.dataset.localizing = "";

  const base = document.querySelector("base");
  if (base) base.href = siteRoot.href;

  const t = (key, params = {}) => {
    const messages = window.PortfolioMessages || {};
    const value = messages[language]?.[key] ?? messages.en?.[key];
    if (value === undefined) return key;
    return value.replace(/\{(\w+)\}/g, (match, name) => String(params[name] ?? match));
  };

  const pagePath = () => {
    const relativePath = window.location.pathname.slice(siteRoot.pathname.length);
    return relativePath.replace(/^(en|uk)(\/|$)/, "") || "index.html";
  };

  const localizedUrl = (path, locale) => {
    const url = new URL(path, siteRoot);
    const relativePath = url.pathname.slice(siteRoot.pathname.length).replace(/^(en|uk)(\/|$)/, "");
    const localePrefix = locale === "uk" ? "uk/" : "";
    url.pathname = `${siteRoot.pathname}${localePrefix}${relativePath === "index.html" ? "" : relativePath}`;
    url.searchParams.delete("lang");
    return url;
  };

  const refreshLanguageLinks = () => {
    document.querySelectorAll("[data-language]").forEach((link) => {
      const locale = link.dataset.language;
      if (!isSupported(locale)) return;
      const url = localizedUrl(pagePath(), locale);
      url.search = window.location.search;
      url.searchParams.delete("lang");
      url.hash = window.location.hash;
      link.href = url.href;
      if (locale === language) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  };

  const applyTranslations = () => {
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });

    ["aria-label", "alt", "title", "content"].forEach((attribute) => {
      document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
        element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
      });
    });

    document.querySelectorAll("[data-i18n-link]").forEach((link) => {
      link.href = localizedUrl(link.dataset.i18nLink, language).href;
    });

    refreshLanguageLinks();

    document.querySelectorAll("[data-i18n-store-link]").forEach((link) => {
      const url = new URL(link.href);
      url.searchParams.set("hl", language);
      link.href = url.href;
    });
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const url = new URL(localizedUrl(pagePath(), language).pathname, canonical.href);
      canonical.href = url.href;
    }
    delete document.documentElement.dataset.localizing;
  };

  const setLanguage = (nextLanguage) => {
    if (!isSupported(nextLanguage)) return;
    const previousLanguage = language;
    language = nextLanguage;
    const url = localizedUrl(pagePath(), language);
    url.search = window.location.search;
    url.searchParams.delete("lang");
    url.hash = window.location.hash;
    window.history.replaceState(window.history.state, "", url.href);
    applyTranslations();
    if (language !== previousLanguage) {
      document.dispatchEvent(new CustomEvent("localechange", { detail: { language } }));
    }
  };

  const formatDate = (value) => {
    const normalized = String(value).replace(
      /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/,
      "$1T$2$3:$4"
    );
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(language === "uk" ? "uk-UA" : "en-GB", {
      year: "numeric", month: "short", day: "numeric"
    }).format(date);
  };

  const initialize = () => {
    if (initialized) return;
    initialized = true;
    applyTranslations();
    document.addEventListener("click", (event) => {
      const link = event.target instanceof Element ? event.target.closest("[data-language]") : null;
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setLanguage(link.dataset.language);
    });
  };

  window.PortfolioI18n = { initialize, t, setLanguage, refreshLanguageLinks, formatDate, get language() { return language; } };
})();
