const config = window.BOOK_AUDIO_CONFIG || {};

document.addEventListener("DOMContentLoaded", () => {
  hydrateText();
  renderChapters();
  initializeAccess();
  initializeRegistration();
});

function hydrateText() {
  setText("[data-book-title]", config.bookTitle);
  setText("[data-site-name]", config.siteName);
  setText("[data-book-subtitle]", config.subtitle);
  setText("[data-author-name]", config.authorName);
  setText("[data-book-isbn]", config.isbn);
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
    if (config.coverSmallImage) {
      image.srcset = `${config.coverSmallImage} 285w, ${config.coverImage} 1817w`;
      image.sizes = "(max-width: 860px) 220px, 300px";
    }
    image.alt = `${config.bookTitle || "Bok"} omslag`;
  });

  document.querySelectorAll("[data-purchase-link]").forEach((link) => {
    link.href = config.purchaseUrl;
  });
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value || node.textContent;
  });
}

function renderChapters(protectedManifest = [], hasAccess = false) {
  const list = document.querySelector("[data-chapter-list]");
  if (!list) return;
  const protectedById = new Map(protectedManifest.map((chapter) => [chapter.id, chapter]));
  const chapters = Array.isArray(config.chapters) ? config.chapters : [];
  list.innerHTML = "";

  chapters.forEach((chapter, index) => {
    const published = chapter.published === true;
    const unlocked = published && (chapter.access === "public" || protectedById.has(chapter.id));
    const playable = protectedById.get(chapter.id) || chapter;
    const description = published
      ? chapter.duration || (chapter.access === "public" ? "Fri provlyssning" : "Ljud till boken")
      : "Ännu inte publicerat";
    const item = document.createElement("article");
    item.className = `chapter${unlocked ? "" : " chapter--locked"}`;
    item.innerHTML = `
      <div class="chapter__meta">
        <span class="chapter__number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3>${escapeHtml(playable.title || `Kapitel ${index + 1}`)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
      </div>
      ${!published ? '<span class="status-badge status-badge--upcoming">Kommer snart</span>' : unlocked ? renderAudio(playable) : renderLockedChapter(hasAccess)}
    `;
    list.appendChild(item);
  });
}

function renderAudio(chapter) {
  return `
    <audio controls controlsList="nodownload" disablepictureinpicture preload="metadata" crossorigin="anonymous">
      <source src="${escapeAttribute(chapter.audioUrl || chapter.src || "")}" type="audio/mpeg">
    </audio>
  `;
}

function renderLockedChapter(hasAccess) {
  if (hasAccess) return '<span class="status-badge">Ljudet förbereds för publicering</span>';
  if (!config.registrationOpen) return '<a class="text-link" href="../register/">Registrering öppnar snart</a>';
  return `
    <div class="chapter__gate">
      <span class="status-badge">Registrering krävs</span>
      <a class="button button--compact" href="../register/">Lås upp ljudet</a>
    </div>
  `;
}

async function initializeAccess() {
  if (!document.querySelector("[data-chapter-list]")) return;
  const saved = readSavedAccess();
  if (!saved) {
    setAccessState(false);
    return;
  }

  try {
    const response = await apiRequest(`/api/books/${encodeURIComponent(config.bookSlug)}/manifest`, {
      headers: { authorization: `Bearer ${saved.accessToken}` }
    });
    if (response.status === 401) {
      clearSavedAccess();
      setAccessState(false, null, "Din åtkomst har gått ut. Registrera dig igen.");
      return;
    }
    if (!response.ok) throw new Error("Åtkomsten kunde inte kontrolleras just nu.");
    const body = await response.json();
    renderChapters(body.chapters || [], true);
    setAccessState(true, saved.expiresAt);
  } catch {
    setAccessState(false, null, "Åtkomsten kunde inte kontrolleras just nu. Försök igen om en stund.");
  }
}

function setAccessState(unlocked, expiresAt, message) {
  const summary = document.querySelector("[data-access-summary]");
  const unlockLink = document.querySelector("[data-unlock-link]");
  const forgetButton = document.querySelector("[data-forget-access]");
  const hasPublished = (config.chapters || []).some((chapter) => chapter.published);
  if (summary) {
    summary.textContent = message || (unlocked
      ? `Ljudet är upplåst på den här enheten till ${formatDate(expiresAt)}.`
      : hasPublished
        ? "De fyra första avsnitten är fria att lyssna på. Från kapitel 1 krävs registrering."
        : "Välj ett avsnitt i ljudförteckningen.");
    summary.dataset.tone = message ? "error" : unlocked ? "success" : "neutral";
  }
  if (unlockLink) unlockLink.hidden = unlocked || !hasPublished || !config.registrationOpen;
  if (forgetButton) forgetButton.hidden = !unlocked;
}

function initializeRegistration() {
  const form = document.querySelector("[data-registration-form]");
  if (!form) return;
  const pendingNotice = document.querySelector("[data-registration-pending]");
  const panel = document.querySelector("[data-registration-panel]");
  if (!config.registrationOpen) return;
  if (pendingNotice) pendingNotice.hidden = true;
  if (panel) panel.hidden = false;
  form.addEventListener("submit", submitRegistration);
  form.querySelector("[data-new-question]")?.addEventListener("click", loadQuestion);
  loadQuestion();
}

async function loadQuestion() {
  const prompt = document.querySelector("[data-question-prompt]");
  const challenge = document.querySelector("[name=challenge]");
  const submit = document.querySelector("[data-registration-submit]");
  const options = document.querySelector("[data-question-options]");
  const reloadButton = document.querySelector("[data-new-question]");
  if (challenge) challenge.value = "";
  if (options) options.replaceChildren();
  if (reloadButton) reloadButton.disabled = true;
  setFormStatus("Frågan hämtas ...", "neutral");
  if (submit) submit.disabled = true;

  try {
    const response = await apiRequest(`/api/books/${encodeURIComponent(config.bookSlug)}/question`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Frågan kunde inte hämtas.");
    if (!Array.isArray(body.options) || body.options.length < 2 || !body.challenge) {
      throw new Error("Svarsalternativen är inte tillgängliga just nu. Försök igen senare.");
    }
    if (prompt) prompt.textContent = body.question;
    if (challenge) challenge.value = body.challenge;
    body.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "answer-option";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "answer";
      radio.value = option.id;
      radio.required = true;
      const text = document.createElement("span");
      text.textContent = `${option.id.toUpperCase()}. ${option.text}`;
      label.append(radio, text);
      options.appendChild(label);
    });
    if (submit) submit.disabled = false;
    setFormStatus("", "neutral");
  } catch (error) {
    if (prompt) prompt.textContent = "Frågan är inte tillgänglig just nu.";
    setFormStatus(error.message, "error");
  } finally {
    if (reloadButton) reloadButton.disabled = false;
  }
}

async function submitRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = form.querySelector("[data-registration-submit]");
  const reloadButton = form.querySelector("[data-new-question]");
  submit.disabled = true;
  if (reloadButton) reloadButton.disabled = true;
  setFormStatus("Registreringen kontrolleras ...", "neutral");
  const data = new FormData(form);

  try {
    const response = await apiRequest(`/api/books/${encodeURIComponent(config.bookSlug)}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        answer: data.get("answer"),
        challenge: data.get("challenge"),
        consent: data.get("consent") === "on"
      })
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Registreringen misslyckades.");
    saveAccess(body.accessToken, body.expiresAt);
    setFormStatus("Klart. Du skickas tillbaka till ljudsidan ...", "success");
    window.setTimeout(() => window.location.assign("../audio/"), 500);
  } catch (error) {
    setFormStatus(error.message, "error");
    submit.disabled = false;
    if (reloadButton) reloadButton.disabled = false;
  }
}

function apiRequest(path, options = {}) {
  const baseUrl = String(config.apiBaseUrl || "").replace(/\/$/, "");
  if (!baseUrl || baseUrl.includes("REPLACE-WITH-YOUR-WORKER")) {
    return Promise.reject(new Error("Testtjänsten är inte ansluten ännu. Ange Worker-adressen i site-config.js."));
  }
  return fetch(`${baseUrl}${path}`, options);
}

function readSavedAccess() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.accessStorageKey) || "null");
    if (!saved?.accessToken || !saved?.expiresAt || Date.parse(saved.expiresAt) <= Date.now()) {
      clearSavedAccess();
      return null;
    }
    return saved;
  } catch {
    clearSavedAccess();
    return null;
  }
}

function saveAccess(accessToken, expiresAt) {
  localStorage.setItem(config.accessStorageKey, JSON.stringify({ accessToken, expiresAt }));
}

function clearSavedAccess() {
  localStorage.removeItem(config.accessStorageKey);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-forget-access]")) return;
  clearSavedAccess();
  window.location.reload();
});

function setFormStatus(message, tone) {
  const status = document.querySelector("[data-registration-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "angivet datum" : new Intl.DateTimeFormat("sv-SE").format(date);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
