const SERVER_URL = "https://joker67.up.railway.app";

(function () {
  const TOAST_ID = "page-notes-toast";
  const MARKER_CLASS = "page-notes-marker";
  const STYLE_ID = "page-notes-style";
  const OPTION_ID_ATTR = "data-page-notes-option-id";
  const VALID_ANSWERS = new Set(["A", "B", "C", "D", "E"]);

  let autoAskTimer = null;
  let isAutoAsking = false;
  let lastAutoAskSignature = "";
  let markerTextEdits = [];

  function addStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        width: min(260px, calc(100vw - 32px));
        border-radius: 8px;
        padding: 9px 11px;
        background: #111827;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 12px;
        line-height: 1.35;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }

      .${MARKER_CLASS} {
        display: inline;
        margin-left: 3px;
        color: inherit;
        font: inherit;
        line-height: inherit;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(message) {
    const previousToast = document.getElementById(TOAST_ID);
    if (previousToast) {
      previousToast.remove();
    }

    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    toast.textContent = message;
    document.documentElement.appendChild(toast);

    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3500);
  }

  function clearPreviousMarkers() {
    document.querySelectorAll(`.${MARKER_CLASS}`).forEach((marker) => marker.remove());
    markerTextEdits.forEach((edit) => {
      if (!edit.node.parentNode) {
        return;
      }

      if (edit.originalText === null) {
        edit.node.remove();
      } else {
        edit.node.nodeValue = edit.originalText;
      }
    });
    markerTextEdits = [];
  }

  function normalizeAnswer(answer) {
    if (typeof answer !== "string") {
      return "UNKNOWN";
    }

    const normalized = answer.trim().toUpperCase();
    return VALID_ANSWERS.has(normalized) ? normalized : "UNKNOWN";
  }

  function normalizeOptionId(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  }

  function normalizeAnswers(data) {
    if (Array.isArray(data.answers)) {
      return data.answers
        .map((item, index) => ({
          questionNumber: Number(item.questionNumber || item.number || item.question || index + 1),
          answer: normalizeAnswer(item.answer || item.letter || item.correct),
          optionId: normalizeOptionId(item.optionId || item.id)
        }))
        .filter((item) => item.answer !== "UNKNOWN" && Number.isFinite(item.questionNumber));
    }

    const answer = normalizeAnswer(data.answer);
    return answer === "UNKNOWN" ? [] : [{ questionNumber: 1, answer, optionId: "" }];
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
    return Boolean(element.id === TOAST_ID || element.closest(`#${TOAST_ID}`));
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
    return Boolean(letter && text !== letter);
  }

  function scoreOptionRow(element) {
    let score = 0;

    if (element.querySelector("input[type='radio'], input[type='checkbox']")) {
      score += 10;
    }

    if (element.getAttribute("role") === "radio" || element.getAttribute("role") === "option") {
      score += 8;
    }

    if (getLetterFromBadge(element)) {
      score += 6;
    }

    if (getLetterFromPrefix(element)) {
      score += 5;
    }

    if (["label", "li", "button"].includes(element.tagName.toLowerCase())) {
      score += 3;
    }

    score -= Math.min(element.querySelectorAll("*").length, 40) / 10;
    return score;
  }

  function compareDocumentOrder(a, b) {
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  }

  function collectOptionRows(root = document.body) {
    const rawCandidates = Array.from(
      root.querySelectorAll("label, li, button, [role='radio'], [role='option'], div, p")
    )
      .filter((element) => !isOwnUi(element) && isLikelyOptionRow(element))
      .map((element) => ({
        element,
        letter: getOptionLetter(element),
        score: scoreOptionRow(element)
      }))
      .sort((a, b) => b.score - a.score);

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

    selected.sort((a, b) => compareDocumentOrder(a.element, b.element));
    selected.forEach((row, index) => {
      const optionId = row.element.getAttribute(OPTION_ID_ATTR) || `pn-opt-${index + 1}`;
      row.element.setAttribute(OPTION_ID_ATTR, optionId);
      row.optionId = optionId;
    });

    return selected;
  }

  function groupOptionRows(rows) {
    const groups = [];
    let currentGroup = {};
    let previousLetterIndex = -1;
    const letters = ["A", "B", "C", "D", "E"];

    rows.forEach((row) => {
      const letterIndex = letters.indexOf(row.letter);
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

  function cleanOptionText(text, letter) {
    return text
      .replace(new RegExp(`^\\s*\\(?\\s*${letter}\\s*\\)?\\s*[:.\\-]?\\s*`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildOptionPayload(rows, groups) {
    const groupByElement = new Map();
    groups.forEach((group, groupIndex) => {
      Object.keys(group).forEach((letter) => {
        groupByElement.set(group[letter], groupIndex + 1);
      });
    });

    return rows.map((row) => ({
      optionId: row.optionId,
      groupNumber: groupByElement.get(row.element) || 0,
      letter: row.letter,
      text: cleanOptionText(getVisibleText(row.element), row.letter)
    }));
  }

  function buildAskPayload() {
    const rows = collectOptionRows();
    const groups = groupOptionRows(rows);

    return {
      text: document.body ? document.body.innerText : "",
      options: buildOptionPayload(rows, groups)
    };
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

  function findMarkerTextNode(answerElement, letter) {
    const walker = document.createTreeWalker(answerElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        const text = node.nodeValue || "";
        const trimmed = text.trim();

        if (
          !parent ||
          !trimmed ||
          trimmed === letter ||
          parent.closest("input, textarea, select, script, style") ||
          isOwnUi(parent)
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let candidate = null;
    while (walker.nextNode()) {
      candidate = walker.currentNode;
    }

    return candidate;
  }

  function findAnswerElement(answer, answerIndex, groups) {
    const optionId = normalizeOptionId(answer.optionId);
    if (optionId) {
      const element = document.querySelector(`[${OPTION_ID_ATTR}="${optionId}"]`);
      if (element) {
        return element;
      }
    }

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

  function addMarker(answerElement, letter) {
    if (!answerElement) {
      return false;
    }

    const textNode = findMarkerTextNode(answerElement, letter);

    if (textNode) {
      markerTextEdits.push({
        node: textNode,
        originalText: textNode.nodeValue
      });
      textNode.nodeValue += "..";
      return true;
    }

    const marker = document.createTextNode("..");
    findMarkerTarget(answerElement, letter).appendChild(marker);
    markerTextEdits.push({
      node: marker,
      originalText: null
    });
    return true;
  }

  function addMarkers(answers) {
    clearPreviousMarkers();

    const rows = collectOptionRows();
    const groups = groupOptionRows(rows);
    let markedCount = 0;

    answers.forEach((answer, index) => {
      if (addMarker(findAnswerElement(answer, index, groups), answer.answer)) {
        markedCount += 1;
      }
    });

    return markedCount;
  }

  function getAutoAskSignature(payload) {
    return payload.options
      .map((option) => `${option.groupNumber}:${option.letter}:${option.text}`)
      .join("|");
  }

  function scheduleAutoAsk(delay = 0) {
    if (autoAskTimer) {
      return;
    }

    autoAskTimer = window.setTimeout(() => {
      autoAskTimer = null;
      runAutoAsk();
    }, delay);
  }

  async function runAutoAsk() {
    if (isAutoAsking) {
      return;
    }

    const payload = buildAskPayload();
    if (payload.options.length < 2) {
      return;
    }

    const signature = getAutoAskSignature(payload);
    if (signature === lastAutoAskSignature && document.querySelector(`.${MARKER_CLASS}`)) {
      return;
    }

    isAutoAsking = true;
    lastAutoAskSignature = signature;

    try {
      const response = await fetch(`${SERVER_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Server error ${response.status}`);
      }

      const currentPayload = buildAskPayload();
      if (getAutoAskSignature(currentPayload) !== signature) {
        scheduleAutoAsk();
        return;
      }

      const answers = normalizeAnswers(data);
      if (answers.length) {
        addMarkers(answers);
      }
    } catch (error) {
      showToast(`Error: ${error.message}`);
    } finally {
      isAutoAsking = false;
    }
  }

  function startAutoMode() {
    scheduleAutoAsk();

    const observer = new MutationObserver(() => {
      scheduleAutoAsk();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  addStyles();
  startAutoMode();
})();
