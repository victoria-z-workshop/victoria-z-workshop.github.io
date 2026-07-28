const config = window.BOOK_AUDIO_CONFIG || {};

document.addEventListener("DOMContentLoaded", () => {
  hydrateText();
  renderChapters();
});

function hydrateText() {
  setText("[data-book-title]", config.bookTitle);
  setText("[data-site-name]", config.siteName);
  setText("[data-book-subtitle]", config.subtitle);
  setText("[data-author-name]", config.authorName);
  setText("[data-feedback-email]", config.feedbackEmail);
  setText("[data-privacy-email]", config.privacyEmail || config.feedbackEmail);

  document.querySelectorAll("[data-feedback-link]").forEach((link) => {
    link.href = `mailto:${config.feedbackEmail || "wei.zhang0319@gmail.com"}`;
  });

  document.querySelectorAll("[data-privacy-link]").forEach((link) => {
    link.href = `mailto:${config.privacyEmail || config.feedbackEmail || "wei.zhang0319@gmail.com"}`;
  });

  document.querySelectorAll("[data-cover-image]").forEach((image) => {
    image.src = config.coverImage || "/assets/cover-placeholder.svg";
    image.alt = `${config.bookTitle || "Bok"} omslag`;
  });
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value || node.textContent;
  });
}

function renderChapters() {
  const list = document.querySelector("[data-chapter-list]");
  if (!list) return;

  const chapters = Array.isArray(config.chapters) ? config.chapters : [];
  list.innerHTML = "";

  chapters.forEach((chapter, index) => {
    const source = resolveChapterSource(chapter);
    const item = document.createElement("article");
    item.className = "chapter";
    item.innerHTML = `
      <div class="chapter__meta">
        <span class="chapter__number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>${escapeHtml(chapter.title || `Kapitel ${index + 1}`)}</h3>
          <p>${escapeHtml(chapter.duration || "Ljudfil")}</p>
        </div>
      </div>
      <audio controls controlsList="nodownload" disablepictureinpicture preload="metadata">
        <source src="${escapeAttribute(source)}" type="audio/mpeg">
      </audio>
    `;
    list.appendChild(item);
  });
}

function resolveChapterSource(chapter) {
  if (chapter.src) return chapter.src;
  const baseUrl = config.mediaBaseUrl || "/audio-files/";
  const separator = baseUrl.endsWith("/") ? "" : "/";
  return `${baseUrl}${separator}${chapter.filename || ""}`;
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
  return escapeHtml(value).replace(/`/g, "&#096;");
}
