const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = { window: {} };
for (const catalog of ["site", "repository"]) {
  vm.runInNewContext(fs.readFileSync(path.join(root, "locales", `${catalog}.js`), "utf8"), context);
}

const messages = context.window.PortfolioMessages;
const languages = ["en", "uk"];
const pages = ["index.html", "repository-pizza.html"];
const checkOnly = process.argv.includes("--check");
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

for (const language of languages) {
  const englishKeys = Object.keys(messages.en).sort();
  const keys = Object.keys(messages[language]).sort();
  if (JSON.stringify(keys) !== JSON.stringify(englishKeys)) {
    throw new Error(`Translation keys do not match for ${language}`);
  }
}

function translate(source, language) {
  const message = (key) => {
    if (typeof messages[language][key] !== "string" || !messages[language][key]) {
      throw new Error(`Missing ${language} translation: ${key}`);
    }
    return escapeHtml(messages[language][key]);
  };

  let html = source.replace(/<html lang="[^"]+">/, `<html lang="${language}">`)
    .replace('<base href="./">', '<base href="../">');

  html = html.replace(/<([\w-]+)([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/g,
    (_match, tag, attributes, key) => `<${tag}${attributes}>${message(key)}</${tag}>`);

  html = html.replace(/<[^>]+>/g, (tag) => {
    for (const attribute of ["aria-label", "alt", "title", "content"]) {
      const key = tag.match(new RegExp(`\\bdata-i18n-${attribute}="([^"]+)"`))?.[1];
      if (key) {
        tag = tag.replace(new RegExp(`(?<![\\w-])${attribute}="[^"]*"`), () => `${attribute}="${message(key)}"`);
      }
    }

    const localizedLink = tag.match(/\bdata-i18n-link="([^"]+)"/)?.[1];
    if (localizedLink) {
      const target = localizedLink.replace(/^index\.html(?=[?#]|$)/, "");
      tag = tag.replace(/\bhref="[^"]*"/, `href="${language}/${target}"`);
    }

    const selectedLanguage = tag.match(/\bdata-language="(en|uk)"/)?.[1];
    if (selectedLanguage) {
      tag = tag.replace(/\saria-current="[^"]*"/, "");
      if (selectedLanguage === language) tag = tag.replace(/>$/, ' aria-current="true">');
    }

    if (tag.includes("data-i18n-store-link")) tag = tag.replace(/hl=(en|uk)/, `hl=${language}`);
    if (tag.includes('rel="canonical"')) tag = tag.replace(/\/(en|uk)\//, `/${language}/`);
    return tag;
  });

  const usedKeys = [...html.matchAll(/\bdata-i18n(?:-(?:aria-label|alt|title|content))?="([^"]+)"/g)];
  usedKeys.forEach(([, key]) => message(key));
  return html;
}

let stalePages = false;
for (const page of pages) {
  const source = fs.readFileSync(path.join(root, page), "utf8");
  for (const language of languages) {
    const destination = path.join(root, language, page);
    const html = translate(source, language);
    if (checkOnly) {
      if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== html) {
        console.error(`Generated page is out of date: ${language}/${page}`);
        stalePages = true;
      }
    } else {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, html);
    }
  }
}

if (stalePages) process.exitCode = 1;
else console.log(checkOnly ? "Localized pages are up to date." : "Built EN and UK portfolio and repository pages.");
