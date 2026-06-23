const SERVER_URL = "https://joker67.up.railway.app";

(function () {
  const TOAST_ID = "page-notes-toast";
  const DEBUG_BUTTON_ID = "page-notes-debug";
  const MARKER_CLASS = "page-notes-marker";
  const STYLE_ID = "page-notes-style";
  const OPTION_ID_ATTR = "data-page-notes-option-id";
  const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const VALID_ANSWERS = new Set(OPTION_LETTERS);

  let autoAskTimer = null;
  let isAutoAsking = false;
  let lastAutoAskSignature = "";
  let markerTextEdits = [];
  const answerCache = new Map();
  let lastDebug = {
    status: "not-started",
    events: []
  };

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

      #${DEBUG_BUTTON_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        min-width: 64px;
        min-height: 32px;
        border: 0;
        border-radius: 8px;
        padding: 0 10px;
        background: #0f172a;
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.22);
      }

      #${DEBUG_BUTTON_ID}:hover {
        background: #1e293b;
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
    return Boolean(
      element.id === TOAST_ID ||
      element.id === DEBUG_BUTTON_ID ||
      element.closest(`#${TOAST_ID}, #${DEBUG_BUTTON_ID}`)
    );
  }

  function addDebugEvent(type, details = {}) {
    lastDebug.events = [
      ...(lastDebug.events || []).slice(-19),
      {
        type,
        at: new Date().toISOString(),
        ...details
      }
    ];
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.documentElement.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  async function copyDebugReport() {
    const payload = buildAskPayload();
    const report = {
      createdAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      lastDebug,
      currentSignature: getAutoAskSignature(payload),
      currentPayload: payload,
      markerCount: markerTextEdits.length,
      cacheSize: answerCache.size
    };
    const text = JSON.stringify(report, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      showToast("Debug copied");
    } catch (error) {
      if (copyTextFallback(text)) {
        showToast("Debug copied");
        return;
      }

      console.log("Quiz helper debug report:", report);
      showToast("Debug printed to console");
    }
  }

  function addDebugButton() {
    if (document.getElementById(DEBUG_BUTTON_ID)) {
      return;
    }

    const button = document.createElement("button");
    button.id = DEBUG_BUTTON_ID;
    button.type = "button";
    button.textContent = "Debug";
    button.title = "Copy quiz helper debug report";
    button.addEventListener("click", copyDebugReport);
    document.documentElement.appendChild(button);
  }

  function getLetterFromPrefix(element) {
    const text = getVisibleText(element);
    const match = text.match(/^\s*\(?\s*([A-Z])\s*[\).:\-]?\s+/i);
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

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return value.replace(/["\\]/g, "\\$&");
  }

  function getOptionInput(element) {
    return element.matches("input[type='radio'], input[type='checkbox']")
      ? element
      : element.querySelector("input[type='radio'], input[type='checkbox']");
  }

  function hasOptionInput(element) {
    return Boolean(getOptionInput(element));
  }

  function getOptionGroupKey(element) {
    const input = getOptionInput(element);
    if (!input) {
      return "";
    }

    return input.name || input.getAttribute("data-name") || "";
  }

  function getOptionInputType(element) {
    const input = getOptionInput(element);
    if (!input) {
      return hasOptionRole(element) ? "choice" : "";
    }

    return input.type === "checkbox" ? "checkbox" : "radio";
  }

  function getAssociatedLabel(input) {
    if (!input || input.tagName.toLowerCase() !== "input") {
      return null;
    }

    if (input.labels && input.labels.length) {
      return input.labels[0];
    }

    if (input.id) {
      return document.querySelector(`label[for="${cssEscape(input.id)}"]`);
    }

    return input.closest("label");
  }

  function normalizeOptionCandidate(element) {
    if (element.matches("input[type='radio'], input[type='checkbox']")) {
      const label = getAssociatedLabel(element);
      if (label) {
        return label;
      }

      return element.closest("label, li, tr, p, div, section, article") || element;
    }

    return element;
  }

  function hasOptionRole(element) {
    const role = element.getAttribute("role");
    return role === "radio" || role === "option" || role === "menuitemradio";
  }

  function hasOptionHint(element) {
    const hint = `${element.className || ""} ${element.id || ""} ${Array.from(element.attributes)
      .map((attribute) => `${attribute.name} ${attribute.value}`)
      .join(" ")}`.toLowerCase();

    return /\b(choice|option|answer|variant|response|radio)\b/.test(hint);
  }

  function isLikelyOptionRow(element) {
    const text = getVisibleText(element);
    if (!text || text.length < 2 || text.length > 900) {
      return false;
    }

    const letter = getOptionLetter(element);
    return Boolean((letter && text !== letter) || hasOptionInput(element) || hasOptionRole(element));
  }

  function scoreOptionRow(element) {
    let score = 0;

    if (hasOptionInput(element)) {
      score += 10;
    }

    if (hasOptionRole(element)) {
      score += 8;
    }

    if (hasOptionHint(element)) {
      score += 4;
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
      root.querySelectorAll(
        [
          "input[type='radio']",
          "input[type='checkbox']",
          "label",
          "li",
          "button",
          "tr",
          "[role='radio']",
          "[role='option']",
          "[role='menuitemradio']",
          "[aria-checked]",
          "[data-option]",
          "[data-answer]",
          "[class*='option' i]",
          "[class*='choice' i]",
          "[class*='answer' i]",
          "div",
          "p"
        ].join(", ")
      )
    )
      .map(normalizeOptionCandidate)
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .filter((element) => !isOwnUi(element) && isLikelyOptionRow(element))
      .map((element) => ({
        element,
        letter: getOptionLetter(element),
        groupKey: getOptionGroupKey(element),
        inputType: getOptionInputType(element),
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
    const syntheticLetterIndexes = new Map();
    selected.forEach((row, index) => {
      if (!row.letter) {
        const groupKey = row.groupKey || "default";
        const letterIndex = syntheticLetterIndexes.get(groupKey) || 0;
        row.letter = OPTION_LETTERS[letterIndex] || OPTION_LETTERS[OPTION_LETTERS.length - 1];
        syntheticLetterIndexes.set(groupKey, letterIndex + 1);
      }

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
    const letters = OPTION_LETTERS;

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
    return stripMarkerSuffixes(text)
      .replace(new RegExp(`^\\s*\\(?\\s*${letter}\\s*\\)?\\s*[:.\\-]?\\s*`, "i"), "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripMarkerSuffixes(text) {
    return text
      .split("\n")
      .map((line) => line.replace(/\s*\.\.\s*$/g, ""))
      .join("\n");
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
      inputType: row.inputType || "",
      letter: row.letter,
      text: cleanOptionText(getVisibleText(row.element), row.letter)
    }));
  }

  function getFocusedQuizText(rows, options) {
    const firstRow = rows[0]?.element;
    if (!firstRow) {
      return document.body ? document.body.innerText : "";
    }

    const optionTextLength = options.reduce((total, option) => total + option.text.length, 0);
    let element = firstRow;
    let bestText = "";

    while (element && element !== document.body) {
      const text = getVisibleText(element);
      if (
        text.length > optionTextLength + 20 &&
        text.length < 5000 &&
        options.every((option) => text.includes(option.text))
      ) {
        bestText = text;
      }

      element = element.parentElement;
    }

    const questionText = stripMarkerSuffixes(
      bestText || (document.body ? document.body.innerText.slice(0, 5000) : "")
    );
    const optionLines = options
      .map((option) => `${option.letter}. ${option.text}`)
      .join("\n");

    return `Current quiz question and options:\n${questionText}\n\nDetected options:\n${optionLines}`;
  }

  function buildAskPayload() {
    const rows = collectOptionRows();
    const groups = groupOptionRows(rows);
    const options = buildOptionPayload(rows, groups);

    return {
      text: getFocusedQuizText(rows, options),
      options
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
      addDebugEvent("skip", { reason: "already-running" });
      return;
    }

    const payload = buildAskPayload();
    if (payload.options.length < 2) {
      lastDebug = {
        status: "no-options",
        at: new Date().toISOString(),
        optionCount: payload.options.length,
        payload,
        events: lastDebug.events || []
      };
      addDebugEvent("skip", { reason: "not-enough-options", optionCount: payload.options.length });
      return;
    }

    const signature = getAutoAskSignature(payload);
    lastDebug = {
      status: "ready",
      at: new Date().toISOString(),
      signature,
      payload,
      events: lastDebug.events || []
    };

    if (signature === lastAutoAskSignature && markerTextEdits.length) {
      lastDebug.status = "skipped-existing-marker";
      addDebugEvent("skip", { reason: "same-signature-with-marker", signature });
      return;
    }

    if (answerCache.has(signature)) {
      const cachedAnswers = answerCache.get(signature);
      const markedCount = addMarkers(cachedAnswers);
      lastAutoAskSignature = signature;
      lastDebug.status = "used-cache";
      lastDebug.answers = cachedAnswers;
      lastDebug.markedCount = markedCount;
      addDebugEvent("cache-hit", { signature, markedCount, answers: cachedAnswers });
      return;
    }

    isAutoAsking = true;
    lastAutoAskSignature = signature;
    lastDebug.status = "requesting";
    addDebugEvent("request", { signature, optionCount: payload.options.length });

    try {
      const response = await fetch(`${SERVER_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      lastDebug.response = {
        ok: response.ok,
        status: response.status,
        data
      };
      if (!response.ok) {
        throw new Error(data.error || `Server error ${response.status}`);
      }

      const currentPayload = buildAskPayload();
      if (getAutoAskSignature(currentPayload) !== signature) {
        lastDebug.status = "stale-response";
        lastDebug.currentPayload = currentPayload;
        addDebugEvent("stale-response", {
          requestSignature: signature,
          currentSignature: getAutoAskSignature(currentPayload)
        });
        scheduleAutoAsk();
        return;
      }

      const answers = normalizeAnswers(data);
      lastDebug.answers = answers;
      if (answers.length) {
        answerCache.set(signature, answers);
        const markedCount = addMarkers(answers);
        lastDebug.status = "marked";
        lastDebug.markedCount = markedCount;
        addDebugEvent("marked", { signature, markedCount, answers });
      } else {
        lastDebug.status = "no-answers";
        addDebugEvent("no-answers", { signature, data });
      }
    } catch (error) {
      lastDebug.status = "error";
      lastDebug.error = error.message;
      addDebugEvent("error", { message: error.message });
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
  addDebugButton();
  startAutoMode();
})();
