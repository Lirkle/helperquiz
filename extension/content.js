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
        width: min(280px, calc(100vw - 32px));
        border-radius: 8px;
        padding: 10px 12px;
        background: #111827;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 13px;
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
        border-radius: 6px !important;
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
    }, 4000);
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

  function normalizeAnswers(data) {
    if (Array.isArray(data.answers)) {
      return data.answers
        .map((item, index) => ({
          questionNumber: Number(item.questionNumber || item.number || item.question || index + 1),
          answer: normalizeAnswer(item.answer || item.letter || item.correct)
        }))
        .filter((item) => item.answer !== "UNKNOWN" && Number.isFinite(item.questionNumber));
    }

    const answer = normalizeAnswer(data.answer);
    if (answer === "UNKNOWN") {
      return [];
    }

    return [{ questionNumber: 1, answer }];
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

  function isOwnUi(element) {
    return Boolean(
      element.id === BUTTON_ID ||
        element.id === TOAST_ID ||
        element.closest(`#${BUTTON_ID}, #${TOAST_ID}`)
    );
  }

  function findQuestionBlock(questionNumber) {
    const number = Number(questionNumber);
    if (!Number.isFinite(number)) {
      return null;
    }

    const questionPattern = new RegExp(`^\\s*${number}\\s*[\\).]`);
    const candidates = Array.from(
      document.body.querySelectorAll("section, article, form, fieldset, li, div")
    ).filter((element) => {
      if (isOwnUi(element)) {
        return false;
      }

      const text = getVisibleText(element);
      return text.length >= 20 && text.length <= 6000 && questionPattern.test(text);
    });

    candidates.sort((a, b) => {
      const lengthDifference = getVisibleText(a).length - getVisibleText(b).length;
      if (lengthDifference !== 0) {
        return lengthDifference;
      }

      return a.querySelectorAll("*").length - b.querySelectorAll("*").length;
    });

    return candidates[0] || null;
  }

  function hasLetterBadge(element, letter) {
    return Array.from(element.querySelectorAll("*")).some((child) => {
      const childText = getVisibleText(child);
      return childText === letter && !child.querySelector("input, textarea, select, button");
    });
  }

  function hasLetterPrefix(element, letter) {
    const text = getVisibleText(element);
    const escapedLetter = letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`^\\s*${escapedLetter}\\s*[\\).:\\-]\\s+`, "i"),
      new RegExp(`^\\s*\\(?\\s*${escapedLetter}\\s*\\)\\s+`, "i")
    ];

    return patterns.some((pattern) => pattern.test(text));
  }

  function isLikelyOptionRow(element, letter) {
    const text = getVisibleText(element);
    if (!text || text.length < 2 || text.length > 900) {
      return false;
    }

    if (text === letter) {
      return false;
    }

    return hasLetterPrefix(element, letter) || hasLetterBadge(element, letter);
  }

  function scoreOptionRow(element, letter) {
    const text = getVisibleText(element);
    let score = 0;

    if (element.querySelector("input[type='radio'], input[type='checkbox']")) {
      score += 8;
    }

    if (hasLetterBadge(element, letter)) {
      score += 6;
    }

    if (hasLetterPrefix(element, letter)) {
      score += 5;
    }

    if (["label", "li", "button"].includes(element.tagName.toLowerCase())) {
      score += 2;
    }

    if (text.length <= 220) {
      score += 3;
    }

    score -= Math.min(element.querySelectorAll("*").length, 30) / 10;
    return score;
  }

  function findAnswerElement(letter, root) {
    const searchRoot = root || document.body;
    const candidates = Array.from(
      searchRoot.querySelectorAll("label, li, button, p, div, span")
    ).filter((element) => !isOwnUi(element) && isLikelyOptionRow(element, letter));

    candidates.sort((a, b) => scoreOptionRow(b, letter) - scoreOptionRow(a, letter));
    return candidates[0] || null;
  }

  function findMarkerTarget(answerElement, letter) {
    const descendants = Array.from(answerElement.querySelectorAll("span, p, div, strong, em, b"));
    const textTargets = descendants
      .filter((element) => {
        const text = getVisibleText(element);
        return text.length > 3 && text !== letter && !element.querySelector("input, textarea, select");
      })
      .sort((a, b) => getVisibleText(a).length - getVisibleText(b).length);

    return textTargets[0] || answerElement;
  }

  function addPlusMarker(letter, root) {
    const answerElement = findAnswerElement(letter, root);
    if (!answerElement) {
      return false;
    }

    const marker = document.createElement("span");
    marker.className = MARKER_CLASS;
    marker.textContent = "+";
    marker.title = `Предполагаемый ответ: ${letter}`;

    const markerTarget = findMarkerTarget(answerElement, letter);
    markerTarget.appendChild(marker);
    answerElement.classList.add(HIGHLIGHT_CLASS);
    return true;
  }

  function addPlusMarkers(answers) {
    clearPreviousMarkers();

    let markedCount = 0;

    answers.forEach((item) => {
      const questionBlock = findQuestionBlock(item.questionNumber);
      if (!questionBlock && answers.length > 1) {
        return;
      }

      const markerAdded = addPlusMarker(item.answer, questionBlock || document.body);
      if (markerAdded) {
        markedCount += 1;
      }
    });

    return markedCount;
  }

  async function handleAskClick() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) {
      return;
    }

    clearPreviousMarkers();
    button.disabled = true;
    button.textContent = "Думаю...";
    showToast("Ищу ответы...", false);

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

      const answers = normalizeAnswers(data);
      if (!answers.length) {
        showToast("ИИ не уверен в ответах.", false);
        return;
      }

      const markedCount = addPlusMarkers(answers);
      if (markedCount > 0) {
        showToast(`Плюсиков поставлено: ${markedCount}`, false);
      } else {
        showToast("Ответы получены, но варианты на странице не найдены.", false);
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
