const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const archiver = require("archiver");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const PRIMARY_PROVIDER = normalizeProvider(process.env.PRIMARY_PROVIDER) || "openai";
const AI_PROVIDER_TIMEOUT_MS = normalizePositiveInteger(process.env.AI_PROVIDER_TIMEOUT_MS, 3000);
const OPEN_QUESTION_MAX_TOKENS = normalizePositiveInteger(process.env.OPEN_QUESTION_MAX_TOKENS, 180);
const MULTI_GROUP_PROMPT =
  "If options contain multiple groupNumber values, treat each groupNumber as a separate visible question and return answers for every group you can solve. In every answer object, set questionNumber equal to that option's groupNumber. For radio/single-choice questions, return one best option per groupNumber.";
const OPEN_QUESTION_SYSTEM_PROMPT =
  "You answer the user's selected question directly. If it is a riddle or logic question, solve it. Return only the shortest useful plain-text answer, usually one sentence. Do not use JSON or markdown. Do not answer UNKNOWN unless the text is unreadable.";

const SYSTEM_PROMPT =
  "You are a study quiz assistant. You receive pageText and, when detected, an options array with optionId, groupNumber, inputType, letter, and text. Choose answers only from the provided options. Solve from the question and option text; ignore UI feedback such as Correct, Incorrect, Правильно, Неправильно, colors, buttons, timers, ads, and old answers. For radio/single-choice questions, return one best option. For checkbox/multiple-choice questions, return every correct option as separate objects in answers, using the same questionNumber if needed. For checkbox questions be conservative: select an option only when it directly and independently satisfies the exact question wording; do not select related-but-wrong, movable, immovable, opposite, or merely same-topic options. If a checkbox option is not clearly correct, omit it. Return only JSON, no markdown, exactly like {\"answers\":[{\"questionNumber\":1,\"answer\":\"A\",\"optionId\":\"pn-opt-1\"},{\"questionNumber\":1,\"answer\":\"C\",\"optionId\":\"pn-opt-3\"}]}. Do not invent questions, numbers, letters, or optionIds. If unsure, return {\"answers\":[]}.";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.type("text/plain").send("online");
});

app.get("/extension", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Quiz Helper AI Extension</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #111827;
        font-family: Arial, sans-serif;
      }

      main {
        width: min(520px, calc(100vw - 32px));
      }

      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.2;
      }

      p {
        margin: 0 0 20px;
        color: #4b5563;
        font-size: 16px;
        line-height: 1.5;
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 8px;
        background: #166534;
        color: #ffffff;
        font-size: 16px;
        font-weight: 700;
        text-decoration: none;
      }

      a:hover {
        background: #15803d;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Quiz Helper AI</h1>
      <p>Скачай архив расширения, распакуй его и загрузи папку extension через chrome://extensions/.</p>
      <a href="/dwn">Скачать расширение</a>
    </main>
  </body>
</html>`);
});

app.get("/dwn", downloadExtension);
app.get("/download-extension", downloadExtension);

function downloadExtension(req, res, next) {
  const extensionDirectory = path.resolve(__dirname, "..", "extension");

  res.attachment("page-notes.zip");

  const archive = archiver("zip", {
    zlib: {
      level: 9
    }
  });

  archive.on("error", (error) => {
    next(error);
  });

  archive.pipe(res);
  archive.directory(extensionDirectory, "extension");
  archive.finalize();
}

app.post("/ask", async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    const options = normalizeOptions(req.body.options);

    if (!text) {
      return res.status(400).json({
        error: "Request body must include a non-empty text field"
      });
    }

    const result = await askWithFallback(text, options);

    res.json({
      answer: result.answer,
      answers: result.answers,
      provider: result.provider,
      model: result.model,
      textAnswer: result.textAnswer
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not found"
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  res.status(500).json({
    error: error.publicMessage || "Internal server error"
  });
});

async function askWithFallback(text, options) {
  const errors = [];
  const providers = getProviderOrder();

  for (const provider of providers) {
    const config = getProviderConfig(provider);

    if (!config.apiKey) {
      errors.push(`${provider}: ${config.apiKeyName} is not configured`);
      continue;
    }

    try {
      return await askProvider({
        provider,
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model: config.model,
        text,
        options
      });
    } catch (error) {
      errors.push(formatProviderError(provider, error));
      console.warn(`${provider} request failed, trying fallback:`, getErrorMessage(error));
    }
  }

  const error = new Error(`All AI providers failed. ${errors.join("; ")}`);
  error.publicMessage = "All AI providers failed or are not configured";
  throw error;
}

function normalizeProvider(value) {
  const provider = typeof value === "string" ? value.trim().toLowerCase() : "";
  return provider === "openai" || provider === "deepseek" ? provider : "";
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function getProviderOrder() {
  return PRIMARY_PROVIDER === "deepseek" ? ["deepseek", "openai"] : ["openai", "deepseek"];
}

function getProviderConfig(provider) {
  if (provider === "deepseek") {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      apiKeyName: "DEEPSEEK_API_KEY",
      baseURL: DEEPSEEK_BASE_URL,
      model: DEEPSEEK_MODEL
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY,
    apiKeyName: "OPENAI_API_KEY",
    model: OPENAI_MODEL
  };
}

async function askProvider({ provider, apiKey, baseURL, model, text, options }) {
  const client = new OpenAI({
    apiKey,
    baseURL,
    timeout: AI_PROVIDER_TIMEOUT_MS,
    maxRetries: 0
  });

  const request = {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: options.length ? `${SYSTEM_PROMPT} ${MULTI_GROUP_PROMPT}` : OPEN_QUESTION_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildUserPrompt(text, options)
      }
    ]
  };

  if (!options.length) {
    if (provider === "openai") {
      request.max_completion_tokens = OPEN_QUESTION_MAX_TOKENS;
    } else {
      request.max_tokens = OPEN_QUESTION_MAX_TOKENS;
    }
  }

  const completion = await client.chat.completions.create(request);

  let rawAnswer = completion.choices?.[0]?.message?.content || "UNKNOWN";
  if (!options.length && isUnknownOpenAnswer(rawAnswer)) {
    rawAnswer = await retryOpenQuestion(client, provider, model, text, rawAnswer);
  }

  if (!options.length) {
    if (isUnknownOpenAnswer(rawAnswer)) {
      throw new Error("Provider returned UNKNOWN for open question");
    }

    return {
      answer: "UNKNOWN",
      answers: [],
      textAnswer: rawAnswer.trim(),
      provider,
      model
    };
  }

  const answers = parseAnswers(rawAnswer);

  return {
    answer: answers[0]?.answer || normalizeAnswer(rawAnswer),
    answers,
    provider,
    model
  };
}

async function retryOpenQuestion(client, provider, model, text, fallbackAnswer) {
  const request = {
    model,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: "Solve the selected question or riddle. Return the direct answer in plain text. Never return UNKNOWN unless the question text is unreadable."
      },
      {
        role: "user",
        content: text.slice(0, 60000)
      }
    ]
  };

  if (provider === "openai") {
    request.max_completion_tokens = OPEN_QUESTION_MAX_TOKENS;
  } else {
    request.max_tokens = OPEN_QUESTION_MAX_TOKENS;
  }

  try {
    const completion = await client.chat.completions.create(request);
    const rawAnswer = completion.choices?.[0]?.message?.content || "";
    return rawAnswer.trim() || fallbackAnswer;
  } catch (error) {
    console.warn(`${provider} open-question retry failed:`, getErrorMessage(error));
    return fallbackAnswer;
  }
}

function isUnknownOpenAnswer(value) {
  return /^unknown[.!?]*$/i.test(String(value || "").trim());
}

function parseAnswers(value) {
  if (typeof value !== "string") {
    return [];
  }

  const jsonText = extractJsonText(value);

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const list = Array.isArray(parsed) ? parsed : parsed.answers;

      if (Array.isArray(list)) {
        return list
          .map((item, index) => {
            if (typeof item === "string") {
              return {
                questionNumber: index + 1,
                answer: normalizeAnswer(item)
              };
            }

            return {
              questionNumber: Number(item.questionNumber || item.groupNumber || item.number || item.question || index + 1),
              answer: normalizeAnswer(item.answer || item.letter || item.correct),
              optionId: normalizeOptionId(item.optionId || item.id)
            };
          })
          .filter((item) => item.answer !== "UNKNOWN" && Number.isFinite(item.questionNumber));
      }
    } catch (error) {
      console.warn("Could not parse model JSON answer:", getErrorMessage(error));
    }
  }

  const singleAnswer = normalizeAnswer(value);
  if (singleAnswer === "UNKNOWN") {
    return [];
  }

  return [
    {
      questionNumber: 1,
      answer: singleAnswer
    }
  ];
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      optionId: normalizeOptionId(item.optionId),
      groupNumber: Number(item.groupNumber),
      inputType: normalizeInputType(item.inputType),
      letter: normalizeAnswer(item.letter),
      text: typeof item.text === "string" ? item.text.trim().slice(0, 500) : ""
    }))
    .filter((item) => item.optionId && item.letter !== "UNKNOWN" && item.text);
}

function normalizeInputType(value) {
  if (value === "checkbox" || value === "radio" || value === "choice") {
    return value;
  }

  return "";
}

function normalizeOptionId(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function buildUserPrompt(text, options) {
  if (!options.length) {
    return text.slice(0, 60000);
  }

  const payload = {
    pageText: text.slice(0, 60000),
    options: options.slice(0, 250)
  };

  return JSON.stringify(payload);
}

function extractJsonText(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");

  if (objectStart !== -1 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return "";
}

function normalizeAnswer(value) {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const match = value.trim().toUpperCase().match(/\b([A-Z]|UNKNOWN)\b/);
  return match ? match[1] : "UNKNOWN";
}

function formatProviderError(provider, error) {
  return `${provider}: ${getErrorMessage(error)}`;
}

function getErrorMessage(error) {
  if (!error) {
    return "unknown error";
  }

  if (error.status && error.message) {
    return `${error.status} ${error.message}`;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
  console.log(`Primary provider: ${PRIMARY_PROVIDER}`);
  console.log(`AI provider timeout: ${AI_PROVIDER_TIMEOUT_MS}ms`);
  console.log(`OpenAI model: ${OPENAI_MODEL}`);
  console.log(`DeepSeek model: ${DEEPSEEK_MODEL}`);
});
