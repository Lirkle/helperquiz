const SERVER_URL = "https://joker67.up.railway.app";

(function () {
  const TOAST_ID = "page-notes-toast";
  const PANEL_ID = "page-notes-panel";
  const DEBUG_BUTTON_ID = "page-notes-debug";
  const ANSWER_HINT_ID = "page-notes-answer-hint";
  const STATUS_ID = "page-notes-status";
  const MARKER_CLASS = "page-notes-marker";
  const STYLE_ID = "page-notes-style";
  const OPTION_ID_ATTR = "data-page-notes-option-id";
  const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const VALID_ANSWERS = new Set(OPTION_LETTERS);
  const ASK_TIMEOUT_MS = 8000;
  const MAX_GROUPS_PER_REQUEST = 1;

  let autoAskTimer = null;
  let isAutoAsking = false;
  let lastAutoAskSignature = "";
  let markerTextEdits = [];
  const answerCache = new Map();
  let lastDebug = {
    status: "not-started",
    events: []
  };
  let lastCompletedDebug = null;
  let quizBankEntries = null;
  let statusTimer = null;

  function addStyles() {
    document.getElementById(TOAST_ID)?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(DEBUG_BUTTON_ID)?.remove();
    document.getElementById(ANSWER_HINT_ID)?.remove();
    document.getElementById(STATUS_ID)?.remove();

    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      html, body, body *:not(input):not(textarea):not(select):not(option) {
        -webkit-user-select: text !important;
        user-select: text !important;
        -webkit-touch-callout: default !important;
      }

      .${MARKER_CLASS} {
        display: inline;
        margin-left: 3px;
        color: inherit;
        font: inherit;
        line-height: inherit;
      }

      #${PANEL_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483647;
        box-sizing: border-box;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 6px 8px;
        align-items: center;
        min-width: 116px;
        max-width: min(360px, calc(100vw - 28px));
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 8px;
        padding: 7px;
        background: rgba(15, 23, 42, 0.88);
        color: #f8fafc;
        font-family: Arial, sans-serif;
        font-size: 12px;
        line-height: 1.25;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
        user-select: none !important;
      }

      #${STATUS_ID} {
        color: #cbd5e1;
        font-weight: 700;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${ANSWER_HINT_ID} {
        grid-column: 1 / -1;
        display: none;
        color: #ffffff;
        font-size: 13px;
        font-weight: 700;
        overflow-wrap: anywhere;
        user-select: text !important;
      }

      #${ANSWER_HINT_ID}:not(:empty) {
        display: block;
      }

      #${DEBUG_BUTTON_ID} {
        border: 0;
        border-radius: 6px;
        padding: 5px 7px;
        background: rgba(30, 41, 59, 0.96);
        color: #ffffff;
        font-family: Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        user-select: none !important;
      }

      #${DEBUG_BUTTON_ID}:hover {
        background: #1e293b;
      }

    `;
    document.documentElement.appendChild(style);
  }

  function enableTextSelection() {
    document.onselectstart = null;
    document.onmousedown = null;

    if (document.body) {
      document.body.onselectstart = null;
      document.body.onmousedown = null;
    }

    document.addEventListener(
      "selectstart",
      (event) => {
        event.stopPropagation();
      },
      true
    );
  }

  function showToast(message) {
    console.debug("Quiz helper:", message);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.documentElement.appendChild(panel);
    }

    let status = document.getElementById(STATUS_ID);
    if (!status) {
      status = document.createElement("div");
      status.id = STATUS_ID;
      panel.appendChild(status);
    } else if (status.parentElement !== panel) {
      panel.appendChild(status);
    }

    let button = document.getElementById(DEBUG_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = DEBUG_BUTTON_ID;
      button.type = "button";
      button.textContent = "Debug";
      button.title = "Copy quiz helper debug report";
      button.addEventListener("click", copyDebugReport);
      panel.appendChild(button);
    } else if (button.parentElement !== panel) {
      panel.appendChild(button);
    }

    let hint = document.getElementById(ANSWER_HINT_ID);
    if (!hint) {
      hint = document.createElement("div");
      hint.id = ANSWER_HINT_ID;
      panel.appendChild(hint);
    } else if (hint.parentElement !== panel) {
      panel.appendChild(hint);
    }

    return {
      panel,
      status,
      button,
      hint
    };
  }

  function setStatus(message, persistMs = 3500) {
    if (statusTimer) {
      window.clearTimeout(statusTimer);
      statusTimer = null;
    }

    if (!message) {
      const status = document.getElementById(STATUS_ID);
      if (status) {
        status.textContent = "";
      }
      return;
    }

    const { status } = ensurePanel();
    status.textContent = message;

    if (persistMs > 0) {
      statusTimer = window.setTimeout(() => {
        const currentStatus = document.getElementById(STATUS_ID);
        if (currentStatus) {
          currentStatus.textContent = "";
        }
        statusTimer = null;
      }, persistMs);
    }
  }

  function showAnswerHint(answerText) {
    if (!answerText) {
      return;
    }

    const { hint } = ensurePanel();
    hint.textContent = answerText;
  }

  function hideAnswerHint() {
    const hint = document.getElementById(ANSWER_HINT_ID);
    if (hint) {
      hint.textContent = "";
    }
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
    const selectionText = getSelectionText();
    const rawSelectionText = getRawSelectionText();
    const optionPayload = selectionText ? buildOptionOnlyPayload(selectionText, rawSelectionText) : { rows: [], options: [] };
    const payload = {
      text: selectionText,
      options: optionPayload.options
    };
    const report = {
      createdAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      selectionText,
      rawSelectionText,
      lastDebug,
      currentSignature: getAutoAskSignature(payload),
      currentPayload: payload,
      markerCount: markerTextEdits.length,
      cacheSize: answerCache.size,
      bankEntryCount: getQuizBankEntries().length,
      lastCompletedDebug
    };
    const text = JSON.stringify(report, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      console.debug("Quiz helper debug copied");
    } catch (error) {
      if (copyTextFallback(text)) {
        console.debug("Quiz helper debug copied");
        return;
      }

      console.log("Quiz helper debug report:", report);
    }
  }

  function addDebugButton() {
    ensurePanel();
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

  function normalizeBankText(value) {
    return String(value || "")
      .replace(/\s*\.\.\s*$/g, "")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function parseQuizBankRaw(raw, answers) {
    if (typeof raw !== "string" || !Array.isArray(answers)) {
      return [];
    }

    const questionPattern = /(?:^|\n)\s*(\d+)\.\s+([\s\S]*?)(?=\n\s*\d+\.\s+|$)/g;
    const entries = [];
    let match;

    while ((match = questionPattern.exec(raw))) {
      const questionNumber = Number(match[1]);
      const block = match[2].trim();
      const optionPattern = /^\s*([A-E])\)\s+(.+)$/gm;
      const optionMatches = Array.from(block.matchAll(optionPattern));
      const firstOptionIndex = block.search(/^\s*A\)\s+/m);
      const questionText = firstOptionIndex === -1 ? block : block.slice(0, firstOptionIndex).trim();
      const options = optionMatches.map((optionMatch) => ({
        letter: optionMatch[1].toUpperCase(),
        text: optionMatch[2].trim(),
        normalizedText: normalizeBankText(optionMatch[2])
      }));
      const answerText = answers[questionNumber - 1];

      if (questionNumber && questionText && options.length >= 2 && answerText) {
        entries.push({
          questionNumber,
          questionText,
          normalizedQuestion: normalizeBankText(questionText),
          options,
          answerText,
          normalizedAnswer: normalizeBankText(answerText)
        });
      }
    }

    return entries;
  }

  function getQuizBankEntries() {
    if (quizBankEntries) {
      return quizBankEntries;
    }

    const banks = window.QUIZ_BANKS || {};
    quizBankEntries = Object.values(banks).flatMap((bank) =>
      parseQuizBankRaw(bank.raw, bank.answers)
    );
    return quizBankEntries;
  }

  function scoreBankEntry(entry, payloadOptions, payloadText) {
    const currentOptionTexts = new Set(
      payloadOptions
        .map((option) => normalizeBankText(option.text))
        .filter(isMeaningfulOptionText)
    );
    const matchedOptions = entry.options.filter((option) =>
      isMeaningfulOptionText(option.normalizedText) &&
      currentOptionTexts.has(option.normalizedText)
    ).length;
    const questionMatched = normalizeBankText(payloadText).includes(entry.normalizedQuestion);
    const score = matchedOptions + (questionMatched ? 2 : 0);

    return {
      matchedOptions,
      questionMatched,
      score
    };
  }

  function isMeaningfulOptionText(text) {
    const normalized = normalizeBankText(text);
    return normalized.length > 1 && !/^\d+$/.test(normalized) && !/^-+$/.test(normalized);
  }

  function findBankEntryByQuestion(questionText) {
    const normalizedQuestion = normalizeBankText(questionText);
    if (!normalizedQuestion) {
      return null;
    }

    return getQuizBankEntries()
      .map((entry) => {
        const selectedIncludesBank = normalizedQuestion.includes(entry.normalizedQuestion);
        const bankIncludesSelected = entry.normalizedQuestion.includes(normalizedQuestion);
        const score = selectedIncludesBank ? entry.normalizedQuestion.length : bankIncludesSelected ? normalizedQuestion.length : 0;

        return {
          entry,
          score
        };
      })
      .filter((item) => item.score >= Math.min(20, normalizedQuestion.length))
      .sort((a, b) => b.score - a.score)[0]?.entry || null;
  }

  function findBankAnswers(payload) {
    const payloadOptions = payload.options || [];
    const questionEntry = findBankEntryByQuestion(payload.text || "");
    if (payloadOptions.length < 2) {
      return [];
    }

    if (!questionEntry) {
      return [];
    }

    const match = scoreBankEntry(questionEntry, payloadOptions, payload.text || "");
    if (!match.questionMatched) {
      return [];
    }

    const matchedOption = payloadOptions.find((option) =>
      normalizeBankText(option.text) === questionEntry.normalizedAnswer
    );

    if (!matchedOption) {
      showAnswerHint(questionEntry.answerText);
      return [];
    }

    return [
      {
        questionNumber: Number(matchedOption.groupNumber) || 1,
        answer: matchedOption.letter,
        optionId: matchedOption.optionId,
        answerText: questionEntry.answerText
      }
    ];
  }

  function normalizeAnswers(data) {
    if (Array.isArray(data.answers)) {
      return data.answers
        .map((item, index) => ({
          questionNumber: Number(item.questionNumber || item.groupNumber || item.number || item.question || index + 1),
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

    return getElementTextWithMath(element);
  }

  function getElementTextWithMath(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.("mjx-container").forEach((mathElement) => {
      mathElement.replaceWith(document.createTextNode(getMathJaxText(mathElement)));
    });

    return (clone.innerText || clone.textContent || getMathJaxText(element) || "").trim();
  }

  function getMathJaxText(element) {
    if (!element) {
      return "";
    }

    const mathContainers = element.matches?.("mjx-container")
      ? [element]
      : Array.from(element.querySelectorAll?.("mjx-container") || []);

    return mathContainers
      .map((container) => {
        const ariaLabel = container.getAttribute("aria-label");
        if (ariaLabel) {
          return ariaLabel.trim();
        }

        const math = container.querySelector("mjx-assistive-mml math");
        if (!math) {
          return "";
        }

        return Array.from(math.querySelectorAll("mn, mi, mo, mtext"))
          .map((node) => node.textContent || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(Boolean)
      .join(" ");
  }

  function isOwnUi(element) {
    return Boolean(
      element.id === TOAST_ID ||
      element.id === PANEL_ID ||
      element.id === DEBUG_BUTTON_ID ||
      element.id === ANSWER_HINT_ID ||
      element.id === STATUS_ID ||
      element.closest(`#${TOAST_ID}, #${PANEL_ID}, #${DEBUG_BUTTON_ID}, #${ANSWER_HINT_ID}, #${STATUS_ID}`)
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
      if (label && !isLikelyQuizUiControl(getVisibleText(label))) {
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

    if (isLikelyQuizUiControl(text)) {
      return false;
    }

    const letter = getOptionLetter(element);
    return Boolean((letter && text !== letter) || hasOptionInput(element) || hasOptionRole(element));
  }

  function isLikelyQuizUiControl(text) {
    const trimmed = text.trim();
    return (
      /^\d+\)\s/.test(trimmed) ||
      /^(сложный|ответить!?|спросить|голос|выбери один вариант(?:\s*\([^)]+\))?|закрепление:.*|выбери.*вариант)$/i.test(
        trimmed
      ) ||
      /^(difficult|answer!?|ask|voice)$/i.test(trimmed) ||
      (trimmed.length > 120 && /ответить!?|сложный|закрепление:/i.test(trimmed))
    );
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

  function groupOptionRowObjects(rows) {
    const groups = [];
    let currentGroup = [];
    let currentLetters = new Set();
    let previousLetterIndex = -1;

    rows.forEach((row) => {
      const letterIndex = OPTION_LETTERS.indexOf(row.letter);
      const shouldStartNewGroup =
        row.letter === "A" ||
        currentLetters.has(row.letter) ||
        letterIndex <= previousLetterIndex;

      if (shouldStartNewGroup && currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
        currentLetters = new Set();
      }

      currentGroup.push(row);
      currentLetters.add(row.letter);
      previousLetterIndex = letterIndex;
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups.filter((group) => group.length >= 2);
  }

  function getViewportScore(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));

    if (!visibleWidth || !visibleHeight) {
      return 0;
    }

    const centerY = rect.top + rect.height / 2;
    const distancePenalty = Math.abs(centerY - viewportHeight / 2) / Math.max(viewportHeight, 1);
    return visibleWidth * visibleHeight * (1 - Math.min(distancePenalty, 0.9));
  }

  function hasAnswerMarker(element) {
    return /(?:\.\.)+\s*$/.test(getVisibleText(element));
  }

  function selectActiveRows(rows) {
    const rowGroups = groupOptionRowObjects(rows);
    const unmarkedRowGroups = rowGroups.filter((group) =>
      group.every((row) => !hasAnswerMarker(row.element))
    );

    if (!unmarkedRowGroups.length) {
      return [];
    }

    if (unmarkedRowGroups.length <= 1) {
      return unmarkedRowGroups[0];
    }

    const scoredGroups = unmarkedRowGroups
      .map((group) => ({
        group,
        score: group.reduce((total, row) => total + getViewportScore(row.element), 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scoredGroups.length > 1) {
      return scoredGroups
        .sort((a, b) => compareDocumentOrder(a.group[0].element, b.group[0].element))
        .slice(0, MAX_GROUPS_PER_REQUEST)
        .flatMap((item) => item.group);
    }

    return scoredGroups[0]?.group || rows;
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
      .map((line) => line.replace(/\s*(?:\.\.)+\s*$/g, ""))
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

  function getSelectionText() {
    return getRawSelectionText()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getRawSelectionText() {
    const selectionText = window.getSelection()?.toString() || "";
    const selectionElement = getSelectionElement();
    const mathText = selectionElement ? getMathJaxText(selectionElement) : "";
    const combinedText = mathText && !selectionText.includes(mathText)
      ? `${selectionText} ${mathText}`
      : selectionText;

    return stripMarkerSuffixes(combinedText).trim();
  }

  function getSelectionElement() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const node = selection.getRangeAt(0).commonAncestorContainer;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function findSelectionOptionRows(selectionElement) {
    let element = selectionElement;

    while (element && element !== document.body) {
      const rows = collectOptionRows(element);
      if (rows.length >= 2) {
        return rows;
      }

      element = element.parentElement;
    }

    return selectActiveRows(collectOptionRows());
  }

  function getSelectionContextText(selectionElement, selectionText) {
    let element = selectionElement;
    let bestText = selectionText || "";

    while (element && element !== document.body) {
      const text = stripMarkerSuffixes(getVisibleText(element)).replace(/\s+/g, " ").trim();
      if (
        text.length > bestText.length &&
        text.length <= 800 &&
        (!selectionText || text.includes(selectionText))
      ) {
        bestText = text;
      }

      element = element.parentElement;
    }

    return bestText;
  }

  function parseSelectedQuestionAndOptions(selectionText) {
    const rawLines = String(selectionText || "")
      .split(/\r?\n/)
      .map((line) => stripMarkerSuffixes(line).trim())
      .filter((line) => line && !isLikelyQuizUiControl(line));
    const lines = [];
    for (let index = 0; index < rawLines.length; index += 1) {
      if (/^[A-E]$/i.test(rawLines[index]) && rawLines[index + 1]) {
        lines.push(`${rawLines[index]}) ${rawLines[index + 1]}`);
        index += 1;
      } else {
        lines.push(rawLines[index]);
      }
    }
    const options = [];
    const questionLines = [];
    let implicitOptionMode = false;

    const firstNumberIndex = lines.findIndex((line) => /^\d+$/.test(line));
    if (firstNumberIndex >= 0) {
      const numberedOptions = [];
      for (let index = firstNumberIndex; index < lines.length - 1; index += 2) {
        const expectedNumber = String(numberedOptions.length + 1);
        if (lines[index] !== expectedNumber) {
          break;
        }

        numberedOptions.push({
          letter: OPTION_LETTERS[numberedOptions.length],
          text: lines[index + 1]
        });
      }

      if (numberedOptions.length >= 2) {
        return {
          questionText: lines.slice(0, firstNumberIndex).join(" "),
          options: numberedOptions.map((option) => ({
            ...option,
            text: cleanOptionText(option.text, option.letter)
          }))
        };
      }
    }

    if (lines.length === 1) {
      const line = lines[0];
      const inlineNumberOptionPattern = /(?:^|\s)(\d+)\s+([\s\S]*?)(?=\s+\d+\s+|$)/g;
      const inlineNumberMatches = Array.from(line.matchAll(inlineNumberOptionPattern));

      if (inlineNumberMatches.length >= 2) {
        const firstOptionIndex = inlineNumberMatches[0].index || 0;
        return {
          questionText: line.slice(0, firstOptionIndex).trim(),
          options: inlineNumberMatches.map((match, index) => ({
            letter: OPTION_LETTERS[index],
            text: cleanOptionText(match[2], OPTION_LETTERS[index])
          }))
        };
      }

      const inlineOptionPattern = /(?:^|\s)([A-E])(?:[\).:\-]|\s)\s+([\s\S]*?)(?=\s+[A-E](?:[\).:\-]|\s)\s+|$)/g;
      const inlineMatches = Array.from(line.matchAll(inlineOptionPattern));

      if (inlineMatches.length >= 2) {
        const firstOptionIndex = inlineMatches[0].index || 0;
        return {
          questionText: line.slice(0, firstOptionIndex).trim(),
          options: inlineMatches.map((match) => ({
            letter: match[1].toUpperCase(),
            text: cleanOptionText(match[2], match[1].toUpperCase())
          }))
        };
      }
    }

    lines.forEach((line) => {
      const explicitMatch = line.match(/^\s*(?:\(?\s*([A-E])\s*\)?\s*[\).:\-]?)\s+(.+)$/i);
      if (explicitMatch) {
        if (isLikelyQuizUiControl(explicitMatch[2])) {
          return;
        }

        options.push({
          letter: explicitMatch[1].toUpperCase(),
          text: explicitMatch[2].trim()
        });
        implicitOptionMode = true;
        return;
      }

      if (implicitOptionMode || (questionLines.length > 0 && options.length > 0)) {
        const letter = OPTION_LETTERS[options.length];
        if (letter && !isLikelyQuizUiControl(line)) {
          options.push({
            letter,
            text: line
          });
          return;
        }
      }

      questionLines.push(line);
    });

    if (options.length < 2 && lines.length >= 3) {
      const firstPlainOptionIndex = lines.findIndex((line, index) =>
        index > 0 &&
        !/[?]$/.test(lines[index - 1]) &&
        (
          /^-?\d+(?:[.,]\d+)?$/.test(line) ||
          (index >= lines.length - 4 && line.length <= 80)
        )
      );
      const optionStartIndex = firstPlainOptionIndex === -1 ? 1 : firstPlainOptionIndex;
      const optionLines = lines.slice(optionStartIndex).filter((line) => !isLikelyQuizUiControl(line));
      return {
        questionText: lines.slice(0, optionStartIndex).join(" "),
        options: optionLines.slice(0, OPTION_LETTERS.length).map((line, index) => ({
          letter: OPTION_LETTERS[index],
          text: cleanOptionText(line, OPTION_LETTERS[index])
        }))
      };
    }

    return {
      questionText: questionLines.join(" "),
      options: options.map((option) => ({
        ...option,
        text: cleanOptionText(option.text, option.letter)
      }))
    };
  }

  function matchSelectionOptionsToRows(selectionOptions, rows) {
    if (!selectionOptions.length) {
      return [];
    }

    const unusedRows = [...rows];
    return selectionOptions.map((option, index) => {
      const normalizedOptionText = normalizeBankText(option.text);
      let matchedIndex = unusedRows.findIndex((row) =>
        normalizeBankText(getVisibleText(row.element)).includes(normalizedOptionText)
      );

      if (matchedIndex === -1) {
        matchedIndex = unusedRows.findIndex((row) => row.letter === option.letter);
      }

      const row = matchedIndex === -1 ? null : unusedRows.splice(matchedIndex, 1)[0];
      const optionId = row?.optionId || `pn-selected-${index + 1}`;

      return {
        ...option,
        optionId,
        groupNumber: 1,
        inputType: row?.inputType || "",
        element: row?.element || null
      };
    });
  }

  function getFocusedQuizText(rows, options) {
    const firstRow = rows[0]?.element;
    if (!firstRow) {
      return document.body ? getVisibleText(document.body) : "";
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
      bestText || (document.body ? getVisibleText(document.body).slice(0, 5000) : "")
    );
    const optionLines = options
      .map((option) => `${option.letter}. ${option.text}`)
      .join("\n");

    return `Current quiz question and options:\n${questionText}\n\nDetected options:\n${optionLines}`;
  }

  function buildOptionOnlyPayload(selectionText = "", rawSelectionText = "") {
    const selectionElement = selectionText ? getSelectionElement() : null;
    const contextText = selectionElement
      ? getSelectionContextText(selectionElement, selectionText)
      : selectionText;
    const nearbyRows = selectionElement
      ? findSelectionOptionRows(selectionElement)
      : selectActiveRows(collectOptionRows());
    const selectedQuiz = parseSelectedQuestionAndOptions(rawSelectionText || selectionText);
    const selectedOptions = selectedQuiz.options.length >= 2
      ? matchSelectionOptionsToRows(selectedQuiz.options, nearbyRows)
      : [];
    const rows = selectedOptions.some((option) => option.element)
      ? selectedOptions
          .filter((option) => option.element)
          .map((option) => ({
            element: option.element,
            letter: option.letter,
            optionId: option.optionId,
            inputType: option.inputType || ""
          }))
      : nearbyRows;
    const groups = groupOptionRows(rows);
    const options = selectedOptions.length >= 2
      ? selectedOptions.map(({ element, ...option }) => option)
      : buildOptionPayload(rows, groups);
    const selectedQuestionText = selectedQuiz.questionText || contextText || selectionText;

    return {
      rows,
      options,
      selectionText: selectedQuestionText,
      selectedText: selectionText,
      contextText,
      rawSelectionText,
      selectionOptions: selectedOptions
    };
  }

  function buildAskPayload(optionPayload = buildOptionOnlyPayload()) {
    const selectedQuestion = optionPayload.selectionText || "";
    const focusedText = selectedQuestion
      ? `Selected quiz question:\n${selectedQuestion}`
      : getFocusedQuizText(optionPayload.rows, optionPayload.options);
    const optionLines = optionPayload.options
      .map((option) => `${option.letter}. ${option.text}`)
      .join("\n");

    return {
      text: `${focusedText}\n\nDetected options:\n${optionLines}`,
      options: optionPayload.options
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

    if (hasAnswerMarker(answerElement)) {
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

  function addMarkers(answers, rows = collectOptionRows()) {
    const groups = groupOptionRows(rows);
    let markedCount = 0;

    answers.forEach((answer, index) => {
      if (addMarker(findAnswerElement(answer, index, groups), answer.answer)) {
        markedCount += 1;
      }
    });

    return markedCount;
  }

  function attachAnswerTexts(answers, options) {
    return answers.map((answer) => {
      if (answer.answerText) {
        return answer;
      }

      const option = options.find((item) => item.letter === answer.answer);
      return {
        ...answer,
        answerText: option?.text || answer.answerText || ""
      };
    });
  }

  function getAutoAskSignature(payload) {
    const questionPart = normalizeBankText(payload.text || "");
    const optionsPart = payload.options
      .map((option) => `${option.groupNumber}:${option.letter}:${option.text}`)
      .join("|");

    return `${questionPart}::${optionsPart}`;
  }

  function payloadHasMarker(payload) {
    return payload.options.some((option) => {
      const optionId = normalizeOptionId(option.optionId);
      const element = optionId ? document.querySelector(`[${OPTION_ID_ATTR}="${optionId}"]`) : null;
      return element ? hasAnswerMarker(element) : false;
    });
  }

  function scheduleSelectionAsk(delay = 450) {
    if (autoAskTimer) {
      window.clearTimeout(autoAskTimer);
    }

    setStatus("selected...", 1200);
    autoAskTimer = window.setTimeout(() => {
      autoAskTimer = null;
      runAutoAsk(getSelectionText(), getRawSelectionText());
    }, delay);
  }

  async function runAutoAsk(selectionText = "", rawSelectionText = "") {
    if (isAutoAsking) {
      addDebugEvent("skip", { reason: "already-running" });
      setStatus("AI still thinking...", 1500);
      return;
    }

    if (!selectionText || selectionText.length < 3) {
      hideAnswerHint();
      setStatus("", 0);
      lastDebug = {
        status: "no-selection",
        at: new Date().toISOString(),
        events: lastDebug.events || []
      };
      addDebugEvent("skip", { reason: "no-selection" });
      return;
    }

    hideAnswerHint();
    const optionPayload = buildOptionOnlyPayload(selectionText, rawSelectionText);
    const payload = {
      text: selectionText,
      options: optionPayload.options
    };
    if (payload.options.length < 2) {
      const bankEntry = findBankEntryByQuestion(selectionText);
      lastDebug = {
        status: bankEntry ? "used-bank-hint" : "no-options",
        at: new Date().toISOString(),
        optionCount: payload.options.length,
        payload,
        bankAnswer: bankEntry?.answerText,
        events: lastDebug.events || []
      };
      if (bankEntry) {
        showAnswerHint(bankEntry.answerText);
        setStatus("bank hint", 4500);
        addDebugEvent("bank-hint", { answer: bankEntry.answerText });
        lastCompletedDebug = { ...lastDebug };
      } else {
        setStatus("no options found", 3500);
        addDebugEvent("skip", { reason: "not-enough-options", optionCount: payload.options.length });
      }
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

    if (signature === lastAutoAskSignature && payloadHasMarker(payload)) {
      lastDebug.status = "skipped-existing-marker";
      setStatus("already marked", 2500);
      addDebugEvent("skip", { reason: "same-signature-with-marker", signature });
      return;
    }

    const bankAnswers = findBankAnswers(payload);
    if (bankAnswers.length) {
      answerCache.set(signature, bankAnswers);
      const markedCount = addMarkers(bankAnswers, optionPayload.rows);
      lastAutoAskSignature = signature;
      lastDebug.status = "used-bank";
      lastDebug.answers = bankAnswers;
      lastDebug.markedCount = markedCount;
      if (!markedCount) {
        showAnswerHint(bankAnswers[0].answerText || "");
        lastDebug.status = "used-bank-hint";
        setStatus("bank hint", 4500);
      } else {
        setStatus("bank done", 3000);
      }
      addDebugEvent("bank-hit", { signature, markedCount, answers: bankAnswers });
      lastCompletedDebug = { ...lastDebug };
      return;
    }

    if (document.getElementById(ANSWER_HINT_ID)) {
      lastAutoAskSignature = signature;
      lastDebug.status = "used-bank-hint";
      setStatus("bank hint", 4500);
      lastCompletedDebug = { ...lastDebug };
      return;
    }

    if (answerCache.has(signature)) {
      const cachedAnswers = answerCache.get(signature);
      const markedCount = addMarkers(cachedAnswers, optionPayload.rows);
      lastAutoAskSignature = signature;
      lastDebug.status = "used-cache";
      lastDebug.answers = cachedAnswers;
      lastDebug.markedCount = markedCount;
      if (!markedCount) {
        showAnswerHint(cachedAnswers[0]?.answerText || "");
        lastDebug.status = "used-cache-hint";
        setStatus("cache hint", 4500);
      } else {
        setStatus("cache done", 3000);
      }
      addDebugEvent("cache-hit", { signature, markedCount, answers: cachedAnswers });
      lastCompletedDebug = { ...lastDebug };
      return;
    }

    const askPayload = buildAskPayload(optionPayload);
    isAutoAsking = true;
    lastAutoAskSignature = signature;
    lastDebug.status = "requesting";
    lastDebug.payload = askPayload;
    setStatus("AI thinking...", 0);
    addDebugEvent("request", { signature, optionCount: payload.options.length });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, ASK_TIMEOUT_MS);

    try {
      const response = await fetch(`${SERVER_URL}/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(askPayload),
        signal: controller.signal
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

      const currentSelectionText = getSelectionText();
      const currentRawSelectionText = getRawSelectionText();
      const currentOptionPayload = buildOptionOnlyPayload(currentSelectionText, currentRawSelectionText);
      const currentPayload = {
        text: currentSelectionText,
        options: currentOptionPayload.options
      };
      if (getAutoAskSignature(currentPayload) !== signature) {
        lastDebug.status = "stale-response";
        lastDebug.currentPayload = currentPayload;
        setStatus("selection changed", 2500);
        addDebugEvent("stale-response", {
          requestSignature: signature,
          currentSignature: getAutoAskSignature(currentPayload)
        });
        return;
      }

      const answers = attachAnswerTexts(normalizeAnswers(data), optionPayload.options);
      lastDebug.answers = answers;
      if (answers.length) {
        answerCache.set(signature, answers);
        const markedCount = addMarkers(answers, optionPayload.rows);
        lastDebug.status = "marked";
        lastDebug.markedCount = markedCount;
        if (!markedCount) {
          showAnswerHint(answers[0]?.answerText || answers[0]?.answer || "");
          lastDebug.status = "ai-hint";
        }
        setStatus(markedCount ? "AI done" : "AI hint", 4500);
        addDebugEvent("marked", { signature, markedCount, answers });
        lastCompletedDebug = { ...lastDebug };
      } else {
        lastDebug.status = "no-answers";
        setStatus("AI no answer", 4500);
        addDebugEvent("no-answers", { signature, data });
        lastCompletedDebug = { ...lastDebug };
      }
    } catch (error) {
      lastDebug.status = "error";
      lastDebug.error = error.name === "AbortError" ? "Request timeout" : error.message;
      setStatus(lastDebug.error, 5000);
      addDebugEvent("error", { message: lastDebug.error });
      showToast(`Error: ${lastDebug.error}`);
    } finally {
      window.clearTimeout(timeoutId);
      isAutoAsking = false;
    }
  }

  function startSelectionMode() {
    document.addEventListener("mouseup", () => {
      scheduleSelectionAsk();
    });

    document.addEventListener("touchend", () => {
      scheduleSelectionAsk();
    });

    document.addEventListener("keyup", () => {
      scheduleSelectionAsk();
    });
  }

  addStyles();
  enableTextSelection();
  addDebugButton();
  startSelectionMode();
})();
