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

  function getLetterFromPrefix(element) {
    const text = getVisibleText(element);
    const match = text.match(/^\s*\(?\s*([A-E])\s*[\).:\-]?\s+/i);
    return match ? match[1].toUpperCase() : "";
  }

  function getLetterFromBadge(element) {
    const letters = Array.from(element.querySelectorAll("*"))
      .map((child) => getVisibleText(child))
      .filter((text) => VALID_ANSWERS.has(text));

    const uniqueLetters = Array.from(new Set(letters));
    return uniqueLetters.length === 1 ? uniqueLetters[0] : "";
  }

  function getOptionLetter(element) {
    return getLetterFromPrefix(element) || getLetterFromBadge(element);
  }

  function isLikelyOptionRow(element) {
    const text = getVisibleText(element);
    if (!text || text.length < 2 || text.length > 900) {
      return false;
    }

    const letter = getOptionLetter(element);
    if (!letter || text === letter) {
      return false;
    }

    return true;
  }

  function scoreOptionRow(element) {
    const text = getVisibleText(element);
    let score = 0;

    if (element.querySelector("input[type='radio'], input[type='checkbox']")) {
      score += 8;
    }

    if (getLetterFromBadge(element)) {
      score += 6;
    }

    if (getLetterFromPrefix(element)) {
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

  function collectOptionRows(root = document.body) {
    const searchRoot = root || document.body;
    const rawCandidates = Array.from(
      searchRoot.querySelectorAll("label, li, button, [role='radio'], [role='option'], div, p")
    )
      .filter((element) => !isOwnUi(element) && isLikelyOptionRow(element))
      .map((element) => ({
        element,
        letter: getOptionLetter(element),
        score: scoreOptionRow(element)
      }));

    rawCandidates.sort((a, b) => b.score - a.score);

    const selected = [];
    rawCandidates.forEach((candidate) => {
      const overlaps = selected.some((existing) => {
        return (
          existing.element === candidate.element ||
          existing.element.contains(candidate.element) ||
          candidate.element.contains(existing.element)
        );
      });

      if (!overlaps) {
        selected.push(candidate);
      }
    });

    selected.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }

      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }

      return 0;
    });

    return selected;
  }

  function groupOptionRows(rows) {
    const groups = [];
    let currentGroup = {};
    let previousLetterIndex = -1;

    rows.forEach((row) => {
      const letterIndex = ["A", "B", "C", "D", "E"].indexOf(row.letter);
      const shouldStartNewGroup =
        row.letter === "A" ||
        currentGroup[row.letter] ||
        letterIndex <= previousLetterIndex;

      if (shouldStartNewGroup && Object.keys(currentGroup).length > 0) {
        groups.push(currentGroup);
        currentGroup = {};
      }

      currentGroup[row.letter] = row.element;
      previousLetterIndex = letterIndex;
    });

    if (Object.keys(currentGroup).length > 0) {
      groups.push(currentGroup);
    }

    return groups.filter((group) => Object.keys(group).length >= 2);
  }

  function findAnswerElement(answer, answerIndex, groups) {
    const directGroup = groups[answer.questionNumber - 1];
    if (directGroup && directGroup[answer.answer]) {
      return directGroup[answer.answer];
    }

    if (groups.length === 1 && groups[0][answer.answer]) {
      return groups[0][answer.answer];
    }

    if (groups.length > answerIndex && groups[answerIndex][answer.answer]) {
      return groups[answerIndex][answer.answer];
    }

    return null;
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

  function addPlusMarker(answerElement, letter) {
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

    const optionRows = collectOptionRows();
    const groups = groupOptionRows(optionRows);
    let markedCount = 0;

    answers.forEach((item, index) => {
      const answerElement = findAnswerElement(item, index, groups);
      const markerAdded = addPlusMarker(answerElement, item.answer);
      if (markerAdded) {
        markedCount += 1;
      }
    });

    return {
      markedCount,
      optionRowCount: optionRows.length,
      groupCount: groups.length
    };
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

      const result = addPlusMarkers(answers);
      if (result.markedCount > 0) {
        showToast(`Плюсиков поставлено: ${result.markedCount}`, false);
      } else {
        showToast(`Не нашёл строки вариантов. Найдено строк: ${result.optionRowCount}, групп: ${result.groupCount}.`, false);
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
