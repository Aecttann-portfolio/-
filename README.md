# Portfolio

Static portfolio published with GitHub Pages. The default English version lives at the site root and the Ukrainian version at `/uk/`. Existing `/en/` links remain supported.

## Localization

Edit `index.html` or `repository-pizza.html` and the corresponding `locales/site.js` or `locales/repository.js` dictionary. `data-i18n` marks text elements; `data-i18n-aria-label`, `data-i18n-alt`, and `data-i18n-content` mark translated attributes. `data-i18n-link` points to a page that follows the selected language.

Generate the static language pages after changing content, translations, or media references:

```sh
node tools/build-locales.cjs
```

Commit the generated `en/` and `uk/` pages with their source changes. They provide translated text and metadata even without JavaScript. The shared runtime switches language in place and preserves form values, slideshow state, and repository navigation.

The root URL always defaults to English without changing the address, regardless of browser language or previous language choices. An explicit `lang` query parameter or `/uk/` path selects Ukrainian. Language links preserve the choice in the URL; selecting English returns to the site root. The Pizza PWA demo, source code, README excerpts, commit messages, and text inside screenshots or videos retain their original language.

## Checks

```sh
node tests/i18n.test.cjs
node tools/build-locales.cjs --check
```

Serve this directory with any static HTTP server to preview the site.
