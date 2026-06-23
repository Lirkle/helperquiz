# Quiz Helper AI

Проект состоит из двух частей:

- `extension` - Chrome extension Manifest V3, которое автоматически анализирует открытые варианты на странице.
- `server` - Node.js + Express backend для Railway, который обращается к OpenAI, а если OpenAI недоступен, автоматически переключается на DeepSeek.

Расширение не выбирает ответ автоматически и не нажимает кнопки за пользователя. Оно только добавляет тихую текстовую метку `..` в конец найденного варианта. Если на странице несколько вопросов, расширение пытается отметить правильный вариант у каждого вопроса.

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
PRIMARY_PROVIDER=openai
AI_PROVIDER_TIMEOUT_MS=3000
```

Опционально можно задать модели:

```text
OPENAI_MODEL=gpt-5.4
DEEPSEEK_MODEL=deepseek-v4-flash
```

`PRIMARY_PROVIDER` controls which provider is tried first:

```text
PRIMARY_PROVIDER=openai
PRIMARY_PROVIDER=deepseek
```

If `PRIMARY_PROVIDER` is missing or invalid, the server uses `openai` first.

`AI_PROVIDER_TIMEOUT_MS` controls how long the backend waits for one provider before trying the fallback provider.

Если `OPENAI_MODEL` не задан, сервер использует:

```text
gpt-5.4
```

`PORT` добавлять не нужно. Railway сам задаёт `PORT`, а сервер использует:

```js
process.env.PORT || 3000
```

## Как работает fallback

Сервер делает так:

1. Tries the provider from `PRIMARY_PROVIDER`.
2. If the primary provider fails, has no quota, has no key, or the request fails, the server tries the other provider.
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
  "model": "gpt-5.4"
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
$env:PRIMARY_PROVIDER="openai"
$env:OPENAI_MODEL="gpt-5.4"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
npm start
```

macOS или Linux:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
export DEEPSEEK_API_KEY="your_deepseek_api_key_here"
export PRIMARY_PROVIDER="openai"
export OPENAI_MODEL="gpt-5.4"
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
PRIMARY_PROVIDER=openai
AI_PROVIDER_TIMEOUT_MS=3000
OPENAI_MODEL=gpt-5.4
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
  "model": "gpt-5.4"
}
```

Возможные значения `answer`:

```text
A, B, C, D, E, UNKNOWN
```
