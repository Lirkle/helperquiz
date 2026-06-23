# Quiz Helper AI

Проект состоит из двух частей:

- `extension` - Chrome extension Manifest V3, которое добавляет кнопку "Спросить ИИ" на страницу.
- `server` - Node.js + Express backend для Railway, который обращается к OpenAI, а если OpenAI недоступен, автоматически переключается на DeepSeek.

Расширение не выбирает ответ автоматически и не нажимает кнопки за пользователя. Оно только показывает уведомление и пытается добавить зелёный символ `+` рядом с найденными вариантами. Если на странице несколько вопросов, расширение пытается отметить правильный вариант у каждого вопроса.

## Структура

```text
extension/
  manifest.json
  content.js

server/
  server.js
  package.json
  .gitignore

package.json
README.md
```

## Railway variables

В Railway открой свой backend service, затем `Variables`, и добавь:

```text
OPENAI_API_KEY=your_openai_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

Опционально можно задать модели:

```text
OPENAI_MODEL=gpt-5.4-mini
DEEPSEEK_MODEL=deepseek-v4-flash
```

Если `OPENAI_MODEL` не задан, сервер использует:

```text
gpt-5.4-mini
```

`PORT` добавлять не нужно. Railway сам задаёт `PORT`, а сервер использует:

```js
process.env.PORT || 3000
```

## Как работает fallback

Сервер делает так:

1. Пробует OpenAI с `OPENAI_API_KEY`.
2. Если OpenAI вернул ошибку, закончилась квота, ключ не настроен или запрос не прошёл, сервер пробует DeepSeek с `DEEPSEEK_API_KEY`.
3. Если оба провайдера недоступны, сервер возвращает ошибку.

Ответ `/ask` содержит:

```json
{
  "answer": "A",
  "answers": [
    {
      "questionNumber": 1,
      "answer": "A"
    }
  ],
  "provider": "openai",
  "model": "gpt-5.4-mini"
}
```

Расширение использует только поле `answer`.

## Запуск server локально

Из корня проекта:

```bash
npm install
```

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_openai_api_key_here"
$env:DEEPSEEK_API_KEY="your_deepseek_api_key_here"
$env:OPENAI_MODEL="gpt-5.4-mini"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm start
```

macOS или Linux:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
export DEEPSEEK_API_KEY="your_deepseek_api_key_here"
export OPENAI_MODEL="gpt-5.4-mini"
export DEEPSEEK_MODEL="deepseek-v4-flash"
npm start
```

Проверка:

```bash
curl http://localhost:3000/
```

Ответ:

```text
online
```

## Загрузка extension в Chrome

Готовый архив можно скачать с Railway:

```text
https://joker67.up.railway.app/dwn
```

Также есть страница с кнопкой скачивания:

```text
https://joker67.up.railway.app/extension
```

После скачивания распакуй архив. Внутри будет папка `extension`.

1. Открой Chrome.
2. Перейди на страницу:

```text
chrome://extensions/
```

3. Включи `Developer mode` / `Режим разработчика`.
4. Нажми `Load unpacked` / `Загрузить распакованное расширение`.
5. Выбери папку:

```text
extension
```

## Настройка SERVER_URL в extension

В файле `extension/content.js` в начале есть переменная:

```js
const SERVER_URL = "http://localhost:3000";
```

После деплоя на Railway замени значение на свой Railway domain:

```js
const SERVER_URL = "https://your-project-name.up.railway.app";
```

Не добавляй `/ask` в `SERVER_URL`, код расширения сам отправляет запрос на `${SERVER_URL}/ask`.

После изменения обнови extension в:

```text
chrome://extensions/
```

## Деплой server на Railway

1. Открой Railway.
2. Создай проект из GitHub repo.
3. Выбери репозиторий `helperquiz`.
4. Root directory можно оставить `/`.
5. Start command:

```bash
npm start
```

6. В `Variables` добавь:

```text
OPENAI_API_KEY=your_openai_api_key_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
OPENAI_MODEL=gpt-5.4-mini
DEEPSEEK_MODEL=deepseek-v4-flash
```

7. Сделай redeploy.

## Как получить Railway domain

1. Открой свой service в Railway.
2. Перейди в `Settings`.
3. Найди `Networking` / `Public Networking`.
4. Нажми `Generate Domain`, если домен ещё не создан.
5. Скопируй домен вида:

```text
https://your-project-name.up.railway.app
```

## API server

### GET /

Возвращает:

```text
online
```

### POST /ask

Принимает JSON:

```json
{
  "text": "..."
}
```

Возвращает JSON:

```json
{
  "answer": "A",
  "answers": [
    {
      "questionNumber": 1,
      "answer": "A"
    }
  ],
  "provider": "openai",
  "model": "gpt-5.4-mini"
}
```

Возможные значения `answer`:

```text
A, B, C, D, E, UNKNOWN
```
