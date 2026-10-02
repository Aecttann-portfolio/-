# Portfolio

Static portfolio published with GitHub Pages. The English and Ukrainian versions live at `/en/` and `/uk/`.

## Localization

Edit `index.html` or `repository-pizza.html` and the corresponding `locales/site.js` or `locales/repository.js` dictionary. `data-i18n` marks text elements; `data-i18n-aria-label`, `data-i18n-alt`, and `data-i18n-content` mark translated attributes. `data-i18n-link` points to a page that follows the selected language.

Generate the static language pages after changing content, translations, or media references:

```sh
node tools/build-locales.cjs
```

Commit the generated `en/` and `uk/` pages with their source changes. They provide translated text and metadata even without JavaScript. The shared runtime switches language in place and preserves form values, slideshow state, and repository navigation.

At the root URL, language priority is the `lang` query parameter, saved preference, browser language, then English. A language-specific URL takes priority over saved and browser preferences. The Pizza PWA demo, source code, README excerpts, commit messages, and text inside screenshots or videos retain their original language.

## Checks

```sh
node tests/i18n.test.cjs
node tools/build-locales.cjs --check
```

Serve this directory with any static HTTP server to preview the site.
