const SERVER_URL = "https://joker67.up.railway.app";

(function () {
  const BUTTON_ID = "quiz-helper-ai-button";
  const TOAST_ID = "quiz-helper-ai-toast";
  const MARKER_CLASS = "quiz-helper-ai-plus-marker";
  const HIGHLIGHT_CLASS = "quiz-helper-ai-answer-highlight";
  const STYLE_ID = "quiz-helper-ai-style";
  const VALID_ANSWERS = new Set(["A", "B", "C", "D", "E"]);

  function addStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        border: 0;
        border-radius: 8px;
        padding: 10px 14px;
        min-width: 112px;
        max-width: 180px;
        background: #166534;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.2;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
      }

      #${BUTTON_ID}:hover {
        background: #15803d;
      }

      #${BUTTON_ID}:disabled {
        cursor: wait;
        opacity: 0.75;
      }

      #${TOAST_ID} {
        position: fixed;
        top: 64px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: min(320px, calc(100vw - 32px));
        border-radius: 8px;
        padding: 12px 14px;
        background: #111827;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 14px;
        line-height: 1.35;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }

      .${MARKER_CLASS} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin-left: 8px;
        border-radius: 50%;
        background: #16a34a;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 15px;
        font-weight: 800;
        line-height: 1;
        vertical-align: middle;
      }

      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #16a34a !important;
        outline-offset: 2px !important;
        border-radius: 4px !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Спросить ИИ";
    button.addEventListener("click", handleAskClick);
    document.documentElement.appendChild(button);
  }

  function showToast(message, isError) {
    const previousToast = document.getElementById(TOAST_ID);
    if (previousToast) {
      previousToast.remove();
    }

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = message;
    if (isError) {
      toast.style.background = "#7f1d1d";
    }

    document.documentElement.appendChild(toast);

    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 5000);
  }

  function clearPreviousMarkers() {
    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((marker) => marker.remove());
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
      element.classList.remove(HIGHLIGHT_CLASS);
    });
  }

  function normalizeAnswer(answer) {
    if (typeof answer !== "string") {
      return "UNKNOWN";
    }

    const normalized = answer.trim().toUpperCase();
    return VALID_ANSWERS.has(normalized) ? normalized : "UNKNOWN";
  }

  function getVisibleText(element) {
    if (!element) {
      return "";
    }

    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return "";
    }

    return (element.innerText || element.textContent || "").trim();
  }

  function isLikelyAnswerElement(element, letter) {
    const text = getVisibleText(element);
    if (!text || text.length > 500) {
      return false;
    }

    const escapedLetter = letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^\\s*${escapedLetter}\\s*[\\).:\\-]\\s+`, "i"),
      new RegExp(`^\\s*\\(?\\s*${escapedLetter}\\s*\\)\\s+`, "i"),
      new RegExp(`^\\s*вариант\\s+${escapedLetter}\\b`, "i"),
      new RegExp(`^\\s*answer\\s+${escapedLetter}\\b`, "i"),
      new RegExp(`^\\s*option\\s+${escapedLetter}\\b`, "i")
    ];

    return patterns.some((pattern) => pattern.test(text));
  }

  function scoreCandidate(element) {
    const tagName = element.tagName.toLowerCase();
    const text = getVisibleText(element);
    let score = 0;

    if (["label", "li", "button"].includes(tagName)) {
      score += 4;
    }

    if (["p", "div", "span"].includes(tagName)) {
      score += 2;
    }

    if (element.querySelector("input[type='radio'], input[type='checkbox']")) {
      score += 3;
    }

    if (text.length <= 160) {
      score += 2;
    }

    if (text.length <= 80) {
      score += 1;
    }

    return score;
  }

  function findAnswerElement(letter) {
    const candidates = Array.from(
      document.body.querySelectorAll("label, li, button, p, div, span")
    ).filter((element) => {
      if (element.id === BUTTON_ID || element.id === TOAST_ID) {
        return false;
      }

      if (element.closest(`#${BUTTON_ID}, #${TOAST_ID}`)) {
        return false;
      }

      return isLikelyAnswerElement(element, letter);
    });

    candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    return candidates[0] || null;
  }

  function addPlusMarker(letter) {
    clearPreviousMarkers();

    const answerElement = findAnswerElement(letter);
    if (!answerElement) {
      return false;
    }

    const marker = document.createElement("span");
    marker.className = MARKER_CLASS;
    marker.textContent = "+";
    marker.title = `Предполагаемый ответ: ${letter}`;
    answerElement.appendChild(marker);
    answerElement.classList.add(HIGHLIGHT_CLASS);
    return true;
  }

  async function handleAskClick() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    clearPreviousMarkers();
    button.disabled = true;
    button.textContent = "Думаю...";
    showToast("Отправляю текст страницы на сервер...", false);

    try {
      const response = await fetch(`${SERVER_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: document.body ? document.body.innerText : ""
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = data.error || `Сервер вернул ошибку ${response.status}`;
        throw new Error(errorMessage);
      }

      const answer = normalizeAnswer(data.answer);
      if (answer === "UNKNOWN") {
        showToast("ИИ не уверен в ответе.", false);
        return;
      }

      const markerAdded = addPlusMarker(answer);
      if (markerAdded) {
        showToast(`Предполагаемый ответ: ${answer}. Вариант отмечен зелёным плюсиком.`, false);
      } else {
        showToast(`Предполагаемый ответ: ${answer}. Вариант на странице не найден.`, false);
      }
    } catch (error) {
      showToast(`Ошибка: ${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = "Спросить ИИ";
    }
  }

  addStyles();
  createButton();
})();
