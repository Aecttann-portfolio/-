const repositoryData = window.PIZZA_REPOSITORY;

const icons = {
  folder: '<svg class="file-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"/></svg>',
  file: '<svg class="file-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
};

const state = {
  currentDirectory: "",
  selectedFile: "",
  expandedDirectories: new Set(["", "androidApp", "shared", "iosApp", "gradle"])
};

const elements = {
  fileList: document.querySelector("[data-file-list]"),
  breadcrumbs: document.querySelector("[data-breadcrumbs]"),
  latestCommit: document.querySelector("[data-latest-commit]"),
  upDirectoryButton: document.querySelector("[data-up-directory]"),
  browserPanel: document.querySelector("[data-browser-panel]"),
  codePanel: document.querySelector("[data-code-panel]"),
  codeBody: document.querySelector("[data-code-body]"),
  fileTitle: document.querySelector("[data-file-title]"),
  fileSubtitle: document.querySelector("[data-file-subtitle]"),
  fileGithub: document.querySelector("[data-file-github]"),
  readmePanel: document.querySelector("[data-readme-panel]"),
  readme: document.querySelector("[data-readme]"),
  languageMeter: document.querySelector("[data-language-meter]"),
  languageList: document.querySelector("[data-language-list]")
};

const fileMap = new Map(repositoryData.files.map((file) => [file.path, file]));
const rootNode = createTree(repositoryData.files);
let ignoreNextHashRestore = false;

function createTree(files) {
  const root = createDirectoryNode("", "");

  files.forEach((file) => {
    const parts = file.path.split("/");
    let current = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");

      if (!current.children.has(part)) {
        current.children.set(part, isFile ? createFileNode(part, path, file) : createDirectoryNode(part, path));
      }

      current = current.children.get(part);
    });
  });

  sortTree(root);
  return root;
}

function createDirectoryNode(name, path) {
  return { type: "directory", name, path, children: new Map() };
}

function createFileNode(name, path, file) {
  return { type: "file", name, path, file };
}

function sortTree(node) {
  if (node.type !== "directory") return;

  const sortedEntries = [...node.children.entries()].sort(([, first], [, second]) => {
    if (first.type !== second.type) return first.type === "directory" ? -1 : 1;
    return first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
  });

  node.children = new Map(sortedEntries);
  node.children.forEach(sortTree);
}

function findNode(path) {
  if (!path) return rootNode;

  return path.split("/").reduce((node, segment) => {
    if (!node || node.type !== "directory") return null;
    return node.children.get(segment) || null;
  }, rootNode);
}

function renderRepositoryMeta() {
  document.querySelectorAll("[data-branch]").forEach((item) => {
    item.textContent = repositoryData.repository.branch;
  });

  const releaseLink = document.querySelector("[data-release-tag]");
  releaseLink.textContent = repositoryData.repository.release.tag;
  document.querySelector("[data-release-time]").textContent = repositoryData.repository.release.relativeTime;
}

function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();

  const rootButton = createBreadcrumbButton(repositoryData.repository.name, "");
  elements.breadcrumbs.append(rootButton);

  if (!state.currentDirectory) return;

  const parts = state.currentDirectory.split("/");
  parts.forEach((part, index) => {
    elements.breadcrumbs.append(createSeparator());
    elements.breadcrumbs.append(createBreadcrumbButton(part, parts.slice(0, index + 1).join("/")));
  });
}

function createBreadcrumbButton(label, path) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => openDirectory(path));
  return button;
}

function createSeparator() {
  const separator = document.createElement("span");
  separator.textContent = "/";
  return separator;
}

function renderFileList() {
  const directory = findNode(state.currentDirectory) || rootNode;
  const rows = [...directory.children.values()];

  elements.fileList.replaceChildren();
  rows.forEach((node) => elements.fileList.append(createFileRow(node)));
}

function createFileRow(node) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `file-row ${node.type === "directory" ? "is-directory" : "is-file"}`;

  const commit = getCommitForNode(node);
  button.innerHTML = `
    ${node.type === "directory" ? icons.folder : icons.file}
    <span class="file-name">${escapeHtml(node.name)}</span>
    <span class="file-message">${escapeHtml(commit?.message || repositoryData.repository.latestCommit.message)}</span>
    <span class="file-time">${escapeHtml(commit?.relativeTime || repositoryData.repository.latestCommit.relativeTime)}</span>
  `;

  button.addEventListener("click", () => {
    if (node.type === "directory") {
      state.expandedDirectories.add(node.path);
      openDirectory(node.path);
      return;
    }

    openFile(node.path);
  });

  return button;
}

function getCommitForNode(node) {
  if (node.type === "file") return node.file.commit;
  return repositoryData.topLevelCommits[node.path] || repositoryData.repository.latestCommit;
}

function renderLatestCommit() {
  const commit = repositoryData.repository.latestCommit;
  elements.latestCommit.innerHTML = `
    <span><strong>Latest commit</strong> ${escapeHtml(commit.message)}</span>
    <span><code>${escapeHtml(commit.shortHash)}</code> · ${escapeHtml(commit.relativeTime)}</span>
  `;
}

function renderCodeViewer(file) {
  elements.fileTitle.textContent = file.path;
  elements.fileSubtitle.textContent = `${formatBytes(file.size)} · ${file.language || "File"} · ${file.isText ? `${lineCount(file.content)} lines` : "binary file"}`;
  const fileGithubUrl = resolveRepositoryBlobUrl(file.path);
  elements.fileGithub.href = fileGithubUrl || "#";
  elements.fileGithub.hidden = !fileGithubUrl;
  elements.codeBody.replaceChildren();

  if (file.isText) {
    elements.codeBody.append(createCodeTable(file.content, file.language));
    return;
  }

  const preview = document.createElement("div");
  preview.className = "binary-preview";

  if (file.asset && /\.(png|webp|jpg|jpeg|gif)$/i.test(file.asset)) {
    preview.innerHTML = `<img src="${escapeAttribute(file.asset)}" alt="${escapeAttribute(file.name)} preview">`;
  } else {
    preview.textContent = "Binary file preview is not available in this browser view.";
  }

  elements.codeBody.append(preview);
}

function createCodeTable(content, language) {
  const table = document.createElement("table");
  table.className = "code-table";
  table.setAttribute("aria-label", "Source code");

  const tbody = document.createElement("tbody");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const row = document.createElement("tr");
    const numberCell = document.createElement("td");
    const codeCell = document.createElement("td");

    numberCell.className = "line-number";
    numberCell.textContent = index + 1;
    codeCell.className = "code-line";
    codeCell.innerHTML = line ? highlightCodeLine(line, language) : " ";

    row.append(numberCell, codeCell);
    tbody.append(row);
  });

  table.append(tbody);
  return table;
}

function highlightCodeLine(line, language = "") {
  const normalizedLanguage = language.toLowerCase();

  if (normalizedLanguage === "xml") return highlightWithRules(line, xmlTokenPattern, classifyXmlToken);
  if (normalizedLanguage === "json") return highlightWithRules(line, jsonTokenPattern, classifyJsonToken);

  return highlightWithRules(line, codeTokenPattern, classifyCodeToken);
}

const codeKeywords = new Set([
  "actual", "abstract", "as", "by", "catch", "class", "companion", "const", "constructor",
  "data", "else", "enum", "expect", "false", "finally", "for", "fun", "if", "import", "in",
  "init", "inline", "interface", "internal", "is", "lateinit", "null", "object", "open",
  "override", "package", "private", "protected", "public", "return", "sealed", "super",
  "suspend", "this", "throw", "true", "try", "typealias", "val", "var", "when", "where",
  "while", "let", "func", "struct", "extension", "protocol", "guard", "switch", "case",
  "default", "defer", "do", "throws", "async", "await", "static"
]);

const codeTokenPattern = /\/\/.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_][\w.]*\b|\b[A-Za-z_][\w]*\b|\b\d+(?:\.\d+)?\b/g;
const xmlTokenPattern = /<!--.*?-->|<\/?[A-Za-z_:][\w:.-]*|[A-Za-z_:][\w:.-]*(?=\s*=)|"(?:[^"]*)"|'(?:[^']*)'/g;
const jsonTokenPattern = /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\btrue\b|\bfalse\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

function highlightWithRules(line, pattern, classifyToken) {
  let html = "";
  let lastIndex = 0;

  line.replace(pattern, (token, offset) => {
    html += escapeHtml(line.slice(lastIndex, offset));
    const tokenClass = classifyToken(token);
    html += tokenClass ? `<span class="${tokenClass}">${escapeHtml(token)}</span>` : escapeHtml(token);
    lastIndex = offset + token.length;
    return token;
  });

  html += escapeHtml(line.slice(lastIndex));
  return html;
}

function classifyCodeToken(token) {
  if (token.startsWith("//")) return "syntax-comment";
  if (token.startsWith("\"") || token.startsWith("'")) return "syntax-string";
  if (token.startsWith("@")) return "syntax-annotation";
  if (/^\d/.test(token)) return "syntax-number";
  if (token === "true" || token === "false") return "syntax-boolean";
  if (token === "null") return "syntax-null";
  if (codeKeywords.has(token)) return "syntax-keyword";
  if (/^[A-Z]/.test(token)) return "syntax-type";
  return "";
}

function classifyXmlToken(token) {
  if (token.startsWith("<!--")) return "syntax-comment";
  if (token.startsWith("<")) return "syntax-tag";
  if (token.startsWith("\"") || token.startsWith("'")) return "syntax-string";
  return "syntax-attribute";
}

function classifyJsonToken(token) {
  if (token.startsWith("\"") && token.endsWith("\"")) return "syntax-string";
  if (token === "true" || token === "false") return "syntax-boolean";
  if (token === "null") return "syntax-null";
  return "syntax-number";
}

function renderReadme() {
  const readmeFile = fileMap.get("README.md");
  const previewContent = (readmeFile?.content || "").split(/\r?\n\* \[\/iosApp\]/)[0].trim();
  elements.readme.innerHTML = renderMarkdown(previewContent);
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  const closeList = () => {
    if (!inList) return;
    html.push("</ul>");
    inList = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed === "<a href=\"assets/demo.mp4\">" || trimmed === "</a>") {
      closeList();
      return;
    }

    const imageMatch = trimmed.match(/<img\s+src="([^"]+)"\s+alt="([^"]*)"[^>]*>/i);
    if (imageMatch) {
      closeList();
      html.push(`<img src="${escapeAttribute(resolveReadmeAsset(imageMatch[1]))}" alt="${escapeAttribute(imageMatch[2])}">`);
      return;
    }

    if (trimmed === "---") {
      closeList();
      html.push("<hr>");
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      return;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
  });

  closeList();
  return html.join("");
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeAttribute(resolveReadmeLink(href))}" target="_blank" rel="noreferrer">${label}</a>`;
    });
}

function resolveReadmeAsset(path) {
  const assetFile = repositoryData.files.find((file) => file.path === path);
  return assetFile?.asset || resolveReadmeLink(path);
}

function resolveReadmeLink(path) {
  if (/^https?:\/\//.test(path)) return path;
  return resolveRepositoryBlobUrl(path.replace(/^\.\//, "")) || "#";
}

function resolveRepositoryBlobUrl(path) {
  if (!repositoryData.repository.remoteUrl) return "";
  return `${repositoryData.repository.remoteUrl}/blob/${repositoryData.repository.branch}/${encodeURIComponentPath(path)}`;
}

function renderLanguages() {
  elements.languageMeter.replaceChildren();
  elements.languageList.replaceChildren();

  repositoryData.repository.languages.forEach((language) => {
    const segment = document.createElement("span");
    segment.className = "language-segment";
    segment.style.setProperty("--language-color", language.color);
    segment.style.width = `${language.percent}%`;
    elements.languageMeter.append(segment);

    const item = document.createElement("span");
    item.className = "language-item";
    item.style.setProperty("--language-color", language.color);
    item.innerHTML = `<span class="language-dot"></span><strong>${escapeHtml(language.name)}</strong><span class="language-percent">${language.percent}%</span>`;
    elements.languageList.append(item);
  });
}

function openDirectory(path, shouldPushState = true) {
  state.currentDirectory = path;
  state.selectedFile = "";
  if (path) state.expandedDirectories.add(path);
  setPanels("directory");
  renderAll();
  updateBackButton();
  if (shouldPushState) setHash(path ? `dir=${encodeURIComponent(path)}` : "");
}

function openFile(path, shouldPushState = true) {
  const file = fileMap.get(path);
  if (!file) return;

  state.selectedFile = path;
  state.currentDirectory = path.includes("/") ? path.split("/").slice(0, -1).join("/") : "";
  expandParents(path);
  setPanels("file");
  renderCodeViewer(file);
  renderAll();
  updateBackButton();
  if (shouldPushState) setHash(`file=${encodeURIComponent(path)}`);
}

function setPanels(mode) {
  const isFileMode = mode === "file";
  elements.codePanel.hidden = !isFileMode;
  elements.browserPanel.hidden = isFileMode;
  elements.readmePanel.hidden = isFileMode;
}

function renderAll() {
  renderBreadcrumbs();
  renderLatestCommit();
  renderFileList();
}

function openParentDirectory(shouldPushState = true) {
  if (state.selectedFile) {
    openDirectory(state.currentDirectory, shouldPushState);
    return;
  }

  if (!state.currentDirectory) return;

  const segments = state.currentDirectory.split("/");
  segments.pop();
  openDirectory(segments.join("/"), shouldPushState);
}

function updateBackButton() {
  const canGoBack = Boolean(state.selectedFile || state.currentDirectory);
  elements.upDirectoryButton.disabled = !canGoBack;
}

function expandParents(path) {
  const parts = path.split("/");
  parts.pop();

  parts.forEach((_, index) => {
    state.expandedDirectories.add(parts.slice(0, index + 1).join("/"));
  });
}

function setHash(value) {
  syncBrowserBackGuard(value);
}

function buildUrl(hashValue = getCurrentHashValue()) {
  const baseUrl = `${location.pathname}${location.search}`;
  return hashValue ? `${baseUrl}#${hashValue}` : baseUrl;
}

function getCurrentHashValue() {
  if (state.selectedFile) return `file=${encodeURIComponent(state.selectedFile)}`;
  if (state.currentDirectory) return `dir=${encodeURIComponent(state.currentDirectory)}`;
  return "";
}

function createHistoryState() {
  return { repositoryBrowser: true };
}

function syncBrowserBackGuard(hashValue = getCurrentHashValue()) {
  const nextUrl = buildUrl(hashValue);
  history.replaceState(createHistoryState(), "", nextUrl);
  history.pushState(createHistoryState(), "", nextUrl);
}

function initializeBrowserBackGuard() {
  syncBrowserBackGuard();
}

function handleBrowserBack() {
  ignoreNextHashRestore = true;
  openParentDirectory(false);
  syncBrowserBackGuard();
  window.setTimeout(() => {
    ignoreNextHashRestore = false;
  }, 0);
}

function handleInputBack(event) {
  if (!isBackInputEvent(event)) return;

  event.preventDefault();
  event.stopPropagation();
  openParentDirectory();
}

function isBackInputEvent(event) {
  if (event.type === "keydown") {
    return (event.altKey && event.key === "ArrowLeft") || event.key === "BrowserBack";
  }

  const isBackButton = event.button === 3;
  const hasBackButtonMask = typeof event.buttons === "number" && (event.buttons & 8) === 8;
  return isBackButton || hasBackButtonMask;
}

function restoreFromHash() {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));

  if (hash.startsWith("file=")) {
    openFile(hash.slice(5), false);
    return;
  }

  if (hash.startsWith("dir=")) {
    openDirectory(hash.slice(4), false);
    return;
  }

  openDirectory("", false);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function lineCount(content) {
  return content ? content.split(/\r?\n/).length : 0;
}

function encodeURIComponentPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

document.querySelector("[data-close-file]").addEventListener("click", () => openParentDirectory());
elements.upDirectoryButton.addEventListener("click", () => openParentDirectory());
document.querySelector("[data-open-readme]").addEventListener("click", () => openFile("README.md"));

window.addEventListener("popstate", handleBrowserBack);
window.addEventListener("hashchange", () => {
  if (ignoreNextHashRestore) return;
  restoreFromHash();
});
window.addEventListener("keydown", handleInputBack, { capture: true });
window.addEventListener("pointerdown", handleInputBack, { capture: true });
window.addEventListener("pointerup", handleInputBack, { capture: true });
window.addEventListener("mousedown", handleInputBack, { capture: true });
window.addEventListener("mouseup", handleInputBack, { capture: true });
window.addEventListener("auxclick", handleInputBack, { capture: true });

renderRepositoryMeta();
renderReadme();
renderLanguages();
restoreFromHash();
initializeBrowserBackGuard();
