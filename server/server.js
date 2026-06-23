const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const archiver = require("archiver");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

const SYSTEM_PROMPT =
  "Ты помощник для учебной тренировки. Найди вопрос и варианты ответа в тексте страницы. Верни только одну букву правильного варианта: A, B, C, D или E. Если не уверен, верни UNKNOWN.";

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
      <a href="/download-extension">Скачать расширение</a>
    </main>
  </body>
</html>`);
});

app.get("/download-extension", (req, res, next) => {
  const extensionDirectory = path.resolve(__dirname, "..", "extension");

  res.attachment("quiz-helper-extension.zip");

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
});

app.post("/ask", async (req, res, next) => {
  try {
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        error: "Request body must include a non-empty text field"
      });
    }

    const result = await askWithFallback(text);

    res.json({
      answer: result.answer,
      provider: result.provider,
      model: result.model
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

async function askWithFallback(text) {
  const errors = [];

  if (process.env.OPENAI_API_KEY) {
    try {
      return await askProvider({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY,
        model: OPENAI_MODEL,
        text
      });
    } catch (error) {
      errors.push(formatProviderError("openai", error));
      console.warn("OpenAI request failed, trying DeepSeek fallback:", getErrorMessage(error));
    }
  } else {
    errors.push("openai: OPENAI_API_KEY is not configured");
  }

  if (process.env.DEEPSEEK_API_KEY) {
    try {
      return await askProvider({
        provider: "deepseek",
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
        model: DEEPSEEK_MODEL,
        text
      });
    } catch (error) {
      errors.push(formatProviderError("deepseek", error));
      console.error("DeepSeek fallback failed:", getErrorMessage(error));
    }
  } else {
    errors.push("deepseek: DEEPSEEK_API_KEY is not configured");
  }

  const error = new Error(`All AI providers failed. ${errors.join("; ")}`);
  error.publicMessage = "All AI providers failed or are not configured";
  throw error;
}

async function askProvider({ provider, apiKey, baseURL, model, text }) {
  const client = new OpenAI({
    apiKey,
    baseURL
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: text
      }
    ]
  });

  const rawAnswer = completion.choices?.[0]?.message?.content || "UNKNOWN";

  return {
    answer: normalizeAnswer(rawAnswer),
    provider,
    model
  };
}

function normalizeAnswer(value) {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const match = value.trim().toUpperCase().match(/\b(A|B|C|D|E|UNKNOWN)\b/);
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
  console.log(`OpenAI model: ${OPENAI_MODEL}`);
  console.log(`DeepSeek model: ${DEEPSEEK_MODEL}`);
});
