const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT =
  "Ты помощник для учебной тренировки. Найди вопрос и варианты ответа в тексте страницы. Верни только одну букву правильного варианта: A, B, C, D или E. Если не уверен, верни UNKNOWN.";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.type("text/plain").send("online");
});

app.post("/ask", async (req, res, next) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";

    if (!text) {
      return res.status(400).json({
        error: "Request body must include a non-empty text field"
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
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
    const answer = normalizeAnswer(rawAnswer);

    res.json({
      answer
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
    error: "Internal server error"
  });
});

function normalizeAnswer(value) {
  if (typeof value !== "string") {
    return "UNKNOWN";
  }

  const match = value.trim().toUpperCase().match(/\b(A|B|C|D|E|UNKNOWN)\b/);
  return match ? match[1] : "UNKNOWN";
}

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
