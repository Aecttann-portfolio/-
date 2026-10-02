const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const enginePath = path.resolve(__dirname, '..', 'i18n.js');
const scriptSource = fs.readFileSync(enginePath, 'utf8');
const storageKey = 'portfolio:language';

const messages = {
  en: {
    'test.greeting': 'Hello, {name}!',
    'test.title': 'Project overview',
    'test.description': 'Read the project details.',
    'test.image': 'Application screenshot',
    'test.action': 'Open project',
    'test.englishOnly': 'English fallback',
    'test.values': '{zero} / {flag} / {name}',
  },
  uk: {
    'test.greeting': 'Привіт, {name}!',
    'test.title': 'Огляд проєкту',
    'test.description': 'Перегляньте подробиці проєкту.',
    'test.image': 'Знімок екрана застосунку',
    'test.action': 'Відкрити проєкт',
    'test.values': '{zero} / {flag} / {name}',
  },
};

class FakeElement {
  constructor(tagName, attributes = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map(Object.entries(attributes));
    this.textContent = text;
    this.listeners = new Map();
    this.value = '';
    this.dataset = new Proxy({}, {
      get: (_, property) => this.getAttribute(`data-${toKebab(property)}`) ?? undefined,
      set: (_, property, value) => {
        this.setAttribute(`data-${toKebab(property)}`, value);
        return true;
      },
    });
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  get lang() { return this.getAttribute('lang') || ''; }
  set lang(value) { this.setAttribute('lang', value); }
  get href() { return new URL(this.getAttribute('href') || '', this.ownerDocument.baseURI).href; }
  set href(value) { this.setAttribute('href', value); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    if (event.bubbles) this.ownerDocument.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  matches(selector) {
    return selector.split(',').some((part) => {
      const trimmed = part.trim();
      const tag = trimmed.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const attrs = [...trimmed.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
      return (Boolean(tag) || attrs.length > 0) && attrs.every(([, name, value]) =>
        this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value));
    });
  }
  closest(selector) { return this.matches(selector) ? this : null; }
}

function toKebab(property) {
  return String(property).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function element(tag, attributes, text) { return new FakeElement(tag, attributes, text); }

function createEnvironment(options = {}) {
  let currentUrl = new URL(options.url || 'https://example.test/-/');
  const writes = [];
  const events = [];
  const values = new Map(Object.entries(options.storage || {}));
  const elements = options.elements || [];
  const listeners = new Map();
  const documentElement = element('html', { lang: 'en' });
  const location = {};
  for (const key of ['href', 'origin', 'pathname', 'search', 'hash', 'host', 'hostname', 'protocol']) {
    Object.defineProperty(location, key, {
      get: () => currentUrl[key],
      set: (value) => { currentUrl[key] = value; },
    });
  }
  const document = {
    documentElement,
    currentScript: { src: options.scriptUrl || 'https://example.test/-/i18n.js' },
    readyState: 'complete',
    title: 'Original title',
    get baseURI() { return currentUrl.href; },
    querySelectorAll: (selector) => elements.filter((item) => item.matches(selector)),
    querySelector: (selector) => elements.find((item) => item.matches(selector)) || null,
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatchEvent(event) {
      events.push(event);
      for (const listener of listeners.get(event.type) || []) listener.call(document, event);
      return !event.defaultPrevented;
    },
  };
  documentElement.ownerDocument = document;
  for (const item of elements) item.ownerDocument = document;
  const historyState = options.historyState ?? { portfolioDialog: 'projects', activeSlide: 2 };
  const history = {
    state: historyState,
    replaceState(state, title, target) {
      this.state = state;
      writes.push({ state, title, target: String(target) });
      currentUrl = new URL(target, currentUrl);
    },
  };
  class FakeEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
  }
  const sandbox = {
    URL,
    URLSearchParams,
    Intl,
    Date,
    console,
    document,
    location,
    history,
    navigator: { languages: options.languages || ['en-US'], language: options.languages?.[0] || 'en-US' },
    localStorage: {
      getItem(key) {
        if (options.blockStorage) throw new Error('Storage is unavailable');
        return values.get(key) ?? null;
      },
      setItem(key, value) {
        if (options.blockStorage) throw new Error('Storage is unavailable');
        values.set(key, String(value));
      },
    },
    CustomEvent: FakeEvent,
    Event: FakeEvent,
    Element: FakeElement,
    PortfolioMessages: options.messages || messages,
    addEventListener(type, listener) {
      const group = listeners.get(`window:${type}`) || [];
      group.push(listener);
      listeners.set(`window:${type}`, group);
    },
    dispatchEvent(event) {
      for (const listener of listeners.get(`window:${event.type}`) || []) listener.call(sandbox, event);
      return !event.defaultPrevented;
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(scriptSource, sandbox, { filename: enginePath });
  const api = sandbox.PortfolioI18n;
  assert.ok(api, 'The localization script exposes window.PortfolioI18n');
  api.initialize();
  return { api, document, elements, events, history, historyState, location, values, writes, FakeEvent };
}

test('explicit URLs select the locale and the root defaults to English', () => {
  const cases = [
    { name: 'query beats path and saved preference', url: 'https://example.test/-/uk/?lang=en', storage: { [storageKey]: 'uk' }, expected: 'en' },
    { name: 'path beats saved preference', url: 'https://example.test/-/en/', storage: { [storageKey]: 'uk' }, expected: 'en' },
    { name: 'saved preference does not override the English root', storage: { [storageKey]: 'uk' }, languages: ['en-US'], expected: 'en' },
    { name: 'Ukrainian browser locale does not override the English root', languages: ['de-DE', 'uk-UA', 'en-US'], expected: 'en' },
    { name: 'English browser regional locale is supported', languages: ['fr-FR', 'en-GB', 'uk-UA'], expected: 'en' },
    { name: 'English is the fallback', languages: ['de-DE', 'fr-FR'], expected: 'en' },
    { name: 'invalid query falls through to explicit path', url: 'https://example.test/-/uk/?lang=fr', expected: 'uk' },
    { name: 'locale-like path segments do not select a language', url: 'https://example.test/-/ukulele/', languages: ['en-US'], expected: 'en' },
    { name: 'unsupported saved preference does not affect the default', storage: { [storageKey]: 'fr' }, languages: ['uk-UA'], expected: 'en' },
    { name: 'root index defaults to English', url: 'https://example.test/-/index.html', storage: { [storageKey]: 'uk' }, languages: ['uk-UA'], expected: 'en' },
    { name: 'root without trailing slash defaults to English', url: 'https://example.test/-', storage: { [storageKey]: 'uk' }, languages: ['uk-UA'], expected: 'en' },
    { name: 'Ukrainian URL selects Ukrainian', url: 'https://example.test/-/uk/', expected: 'uk' },
    { name: 'explicit query selects Ukrainian at root', url: 'https://example.test/-/?lang=uk', expected: 'uk' },
  ];
  for (const entry of cases) {
    const { expected, name, ...options } = entry;
    const environment = createEnvironment(options);
    assert.equal(environment.api.language, expected, name);
    assert.equal(environment.document.documentElement.lang, expected, `${name}: document language`);
  }
});

test('unavailable local storage does not stop initialization or switching', () => {
  const environment = createEnvironment({ url: 'https://example.test/-/uk/', blockStorage: true, languages: ['uk-UA'] });
  assert.equal(environment.api.language, 'uk');
  assert.doesNotThrow(() => environment.api.setLanguage('en'));
  assert.equal(environment.api.language, 'en');
});

test('dictionary lookup interpolates parameters and falls back for unavailable keys', () => {
  const { api } = createEnvironment({ url: 'https://example.test/-/uk/', languages: ['uk-UA'] });
  assert.equal(api.t('test.greeting', { name: 'Тарас' }), 'Привіт, Тарас!');
  assert.equal(api.t('test.englishOnly'), 'English fallback');
  assert.equal(api.t('test.missing'), 'test.missing');
  assert.equal(api.t('test.greeting'), 'Привіт, {name}!');
  assert.equal(api.t('test.values', { zero: 0, flag: false, name: '<b>User</b>' }), '0 / false / <b>User</b>');
});

test('translations update text and accessible attributes without replacing existing elements', () => {
  const heading = element('h2', { 'data-i18n': 'test.title' }, 'Original title');
  const paragraph = element('p', { 'data-i18n': 'test.description' }, 'Original description');
  const image = element('img', { 'data-i18n-alt': 'test.image', alt: 'Original alternative' });
  const button = element('button', { 'data-i18n-aria-label': 'test.action', 'data-i18n-title': 'test.action' });
  const metadata = element('meta', { 'data-i18n-content': 'test.description', content: 'Original metadata' });
  const input = element('input', { id: 'contact-name' });
  input.value = 'User draft';
  const environment = createEnvironment({ elements: [heading, paragraph, image, button, metadata, input] });
  environment.api.setLanguage('uk');
  assert.equal(heading.textContent, 'Огляд проєкту');
  assert.equal(paragraph.textContent, 'Перегляньте подробиці проєкту.');
  assert.equal(image.getAttribute('alt'), 'Знімок екрана застосунку');
  assert.equal(button.getAttribute('aria-label'), 'Відкрити проєкт');
  assert.equal(button.getAttribute('title'), 'Відкрити проєкт');
  assert.equal(metadata.getAttribute('content'), 'Перегляньте подробиці проєкту.');
  assert.equal(input.value, 'User draft');
  assert.strictEqual(environment.elements[0], heading);
});

test('only the selected language link is marked current and a click switches the locale', () => {
  const english = element('a', { 'data-language': 'en', href: '/-/en/' }, 'EN');
  const ukrainian = element('a', { 'data-language': 'uk', href: '/-/uk/' }, 'UK');
  const environment = createEnvironment({ url: 'https://example.test/-/en/?install=1#projects', elements: [english, ukrainian] });
  assert.equal(english.getAttribute('aria-current'), 'true');
  assert.notEqual(ukrainian.getAttribute('aria-current'), 'true');
  assert.equal(ukrainian.href, 'https://example.test/-/uk/?install=1#projects');
  const click = new environment.FakeEvent('click', { button: 0, bubbles: true });
  ukrainian.dispatchEvent(click);
  assert.equal(environment.api.language, 'uk');
  assert.equal(ukrainian.getAttribute('aria-current'), 'true');
  assert.notEqual(english.getAttribute('aria-current'), 'true');
  assert.equal(click.defaultPrevented, true);
  assert.equal(environment.values.has(storageKey), false);
});

test('switching preserves existing query parameters, hash, and history state', () => {
  const environment = createEnvironment({ url: 'https://example.test/-/en/?install=1&campaign=a%20b#projects' });
  environment.api.setLanguage('uk');
  const result = new URL(environment.location.href);
  assert.equal(result.origin, 'https://example.test');
  assert.equal(result.pathname, '/-/uk/');
  assert.equal(result.searchParams.get('install'), '1');
  assert.equal(result.searchParams.get('campaign'), 'a b');
  assert.equal(result.hash, '#projects');
  assert.strictEqual(environment.history.state, environment.historyState);
  assert.equal(environment.values.has(storageKey), false);
  const changeEvent = environment.events.find((event) => event.type === 'localechange');
  assert.equal(changeEvent?.detail?.language, 'uk');
});

test('switching replaces a query override so it cannot revert the requested language on reload', () => {
  const environment = createEnvironment({ url: 'https://example.test/-/uk/?lang=en&install=1#contacts' });
  assert.equal(environment.api.language, 'en');
  environment.api.setLanguage('uk');
  const result = new URL(environment.location.href);
  assert.notEqual(result.searchParams.get('lang'), 'en');
  const reload = createEnvironment({ url: result.href, storage: { [storageKey]: 'uk' } });
  assert.equal(reload.api.language, 'uk');
});

test('switching ignores unsupported locales without changing user state', () => {
  const environment = createEnvironment();
  const originalUrl = environment.location.href;
  const originalEvents = environment.events.length;
  for (const invalid of ['fr', 'UK', 'uk-UA', '', null, undefined, 1, {}]) {
    assert.doesNotThrow(() => environment.api.setLanguage(invalid));
    assert.equal(environment.api.language, 'en');
    assert.equal(environment.location.href, originalUrl);
  }
  assert.equal(environment.events.length, originalEvents);
  assert.equal(environment.values.get(storageKey), undefined);
});

test('initialization is idempotent and does not duplicate click listeners', () => {
  const ukrainian = element('a', { 'data-language': 'uk', href: '/-/uk/' }, 'UK');
  const environment = createEnvironment({ elements: [ukrainian] });
  environment.api.initialize();
  environment.api.initialize();
  const before = environment.events.filter((event) => event.type === 'localechange').length;
  ukrainian.dispatchEvent(new environment.FakeEvent('click', { button: 0, bubbles: true }));
  const after = environment.events.filter((event) => event.type === 'localechange').length;
  assert.equal(after - before, 1);
});

test('language links retain native modified-click behavior', () => {
  const ukrainian = element('a', { 'data-language': 'uk', href: '/-/uk/' }, 'UK');
  const environment = createEnvironment({ elements: [ukrainian] });
  for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    const click = new environment.FakeEvent('click', { button: 0, bubbles: true, ...init });
    ukrainian.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false);
    assert.equal(environment.api.language, 'en');
  }
});

test('localized internal and store links preserve their target details', () => {
  const repository = element('a', { 'data-i18n-link': 'repository-pizza.html#history', href: 'repository-pizza.html#history' });
  const home = element('a', { 'data-i18n-link': 'index.html#projects', href: 'index.html#projects' });
  const store = element('a', { 'data-i18n-store-link': '', href: 'https://play.google.com/store/apps/details?id=test.application&hl=en' });
  const environment = createEnvironment({ elements: [repository, home, store] });
  environment.api.setLanguage('uk');
  assert.equal(repository.href, 'https://example.test/-/uk/repository-pizza.html#history');
  assert.equal(home.href, 'https://example.test/-/uk/#projects');
  const storeUrl = new URL(store.href);
  assert.equal(storeUrl.origin, 'https://play.google.com');
  assert.equal(storeUrl.searchParams.get('id'), 'test.application');
  assert.equal(storeUrl.searchParams.get('hl'), 'uk');
});

test('repository switching keeps its page and uses the script directory as the deployment root', () => {
  const cases = [
    { url: 'https://example.test/-/en/repository-pizza.html?install=1#changes', scriptUrl: 'https://example.test/-/i18n.js', expected: '/-/uk/repository-pizza.html' },
    { url: 'http://localhost:8080/en/repository-pizza.html?install=1#changes', scriptUrl: 'http://localhost:8080/i18n.js', expected: '/uk/repository-pizza.html' },
    { url: 'https://example.test/custom/site/en/repository-pizza.html?install=1#changes', scriptUrl: 'https://example.test/custom/site/i18n.js', expected: '/custom/site/uk/repository-pizza.html' },
  ];
  for (const { expected, ...options } of cases) {
    const environment = createEnvironment(options);
    environment.api.setLanguage('uk');
    const result = new URL(environment.location.href);
    assert.equal(result.pathname, expected);
    assert.equal(result.searchParams.get('install'), '1');
    assert.equal(result.hash, '#changes');
  }
});

test('the page base resolves shared assets from the deployment root', () => {
  const base = element('base', { href: './' });
  createEnvironment({ url: 'https://example.test/-/uk/', elements: [base] });
  assert.equal(base.href, 'https://example.test/-/');
});

test('initialization keeps the English root address with Ukrainian preferences', () => {
  const originalUrl = 'https://example.test/-/?campaign=portfolio#projects';
  const environment = createEnvironment({ url: originalUrl, languages: ['uk-UA'], storage: { [storageKey]: 'uk' } });
  assert.equal(environment.api.language, 'en');
  assert.equal(environment.location.href, originalUrl);
  assert.equal(environment.writes.length, 0);
  assert.equal(environment.values.get(storageKey), 'uk');
});

test('selecting English returns to the root and preserves query and hash', () => {
  const environment = createEnvironment({ url: 'https://example.test/-/uk/?campaign=portfolio#projects', languages: ['uk-UA'] });
  environment.api.setLanguage('en');
  assert.equal(environment.api.language, 'en');
  assert.equal(environment.location.href, 'https://example.test/-/?campaign=portfolio#projects');
  const reload = createEnvironment({ url: environment.location.href, languages: ['uk-UA'], storage: { [storageKey]: 'uk' } });
  assert.equal(reload.api.language, 'en');
});

test('selecting the active English language keeps the root address', () => {
  const environment = createEnvironment({ url: 'https://example.test/-/#projects', languages: ['uk-UA'] });
  environment.api.setLanguage('en');
  assert.equal(environment.location.href, 'https://example.test/-/#projects');
});

test('default language resolution does not save a preference', () => {
  const environment = createEnvironment({ languages: ['uk-UA'] });
  assert.equal(environment.api.language, 'en');
  assert.equal(environment.values.has(storageKey), false);
});

test('repository timestamps format in the active locale without producing an invalid date', () => {
  const environment = createEnvironment();
  const english = environment.api.formatDate('2026-06-11 16:14:40 +0200');
  assert.equal(typeof english, 'string');
  assert.ok(english.length > 0);
  assert.doesNotMatch(english, /invalid|nan/i);
  environment.api.setLanguage('uk');
  const ukrainian = environment.api.formatDate('2026-06-11 16:14:40 +0200');
  assert.equal(typeof ukrainian, 'string');
  assert.ok(ukrainian.length > 0);
  assert.doesNotMatch(ukrainian, /invalid|nan/i);
  assert.notEqual(english, ukrainian);
  assert.equal(environment.api.formatDate('not a date'), '');
});
