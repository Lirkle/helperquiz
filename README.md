# Quiz Helper AI

Проект состоит из двух частей:

- `extension` — Chrome extension Manifest V3, которое добавляет кнопку "Спросить ИИ" на страницу.
- `server` — Node.js + Express backend для Railway, который обращается к OpenAI.

Расширение не выбирает ответ автоматически и не нажимает кнопки за пользователя. Оно только показывает уведомление и пытается добавить зелёный символ `+` рядом с найденным вариантом.

## Структура

```text
extension/
  manifest.json
  content.js

server/
  server.js
  package.json
  .gitignore

README.md
```

## Запуск server локально

Перейдите в папку backend:

```bash
cd server
```

Установите зависимости:

```bash
npm install
```

Добавьте переменную окружения `OPENAI_API_KEY`.

Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="your_openai_api_key_here"
```

macOS или Linux:

```bash
export OPENAI_API_KEY="your_openai_api_key_here"
```

Запустите сервер:

```bash
npm start
```

Проверьте, что сервер работает:

```bash
curl http://localhost:3000/
```

Ответ должен быть:

```text
online
```

## Как добавить OPENAI_API_KEY

Локально ключ задаётся через переменную окружения:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

Сервер читает ключ только из:

```js
process.env.OPENAI_API_KEY
```

Не вставляйте API ключ в код extension или server.

## Загрузка extension в Chrome

1. Откройте Chrome.
2. Перейдите на страницу:

```text
chrome://extensions/
```

3. Включите `Developer mode` / `Режим разработчика`.
4. Нажмите `Load unpacked` / `Загрузить распакованное расширение`.
5. Выберите папку:

```text
extension
```

После загрузки расширение будет добавлять кнопку "Спросить ИИ" на страницы.

## Настройка SERVER_URL в extension

В файле `extension/content.js` в начале есть переменная:

```js
const SERVER_URL = "http://localhost:3000";
```

Для локального запуска оставьте:

```js
const SERVER_URL = "http://localhost:3000";
```

После деплоя на Railway замените значение на ваш Railway domain, например:

```js
const SERVER_URL = "https://your-project-name.up.railway.app";
```

После изменения `SERVER_URL` откройте:

```text
chrome://extensions/
```

Найдите расширение и нажмите кнопку обновления.

## Деплой server на Railway

1. Создайте аккаунт или войдите в Railway:

```text
https://railway.app/
```

2. Создайте новый проект.
3. Выберите деплой из GitHub repository или загрузите проект через Railway CLI.
4. Убедитесь, что Railway запускает backend из папки `server`.
5. В настройках сервиса добавьте переменную окружения:

```text
OPENAI_API_KEY=your_openai_api_key_here
```

6. Railway автоматически задаёт переменную `PORT`, а сервер использует:

```js
process.env.PORT || 3000
```

7. Команда запуска:

```bash
npm start
```

Если Railway просит указать root directory, укажите:

```text
server
```

## Как получить Railway domain

1. Откройте ваш сервис в Railway.
2. Перейдите в раздел `Settings`.
3. Найдите блок `Networking` или `Domains`.
4. Нажмите `Generate Domain`, если домен ещё не создан.
5. Скопируйте домен вида:

```text
https://your-project-name.up.railway.app
```

## Как заменить SERVER_URL на Railway domain

Откройте файл:

```text
extension/content.js
```

Замените:

```js
const SERVER_URL = "http://localhost:3000";
```

на ваш Railway domain:

```js
const SERVER_URL = "https://your-project-name.up.railway.app";
```

Затем обновите extension в `chrome://extensions/`.

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
  "answer": "A"
}
```

Возможные значения `answer`:

```text
A, B, C, D, E, UNKNOWN
```
