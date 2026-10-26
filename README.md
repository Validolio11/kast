# Kast

To-do з блокнотом для Windows, що не перевантажує. Цикл: **Записати → Вибрати 3 → Зробити → Закрити день**.

| Прийом | Звідки | Де в Kast |
|---|---|---|
| Конкретний план знімає «зависання» незавершеного в голові | Masicampo & Baumeister, 2011 | Запис за 1 дію (`Ctrl+Shift+Space` з будь-якої програми) |
| Намір «коли саме» підвищує виконання | Gollwitzer & Sheeran, 2006 | Чіп «Коли?» біля кожної головної задачі |
| Малий вибір не паралізує | Iyengar & Lepper, 2000; метод Айві Лі | 3 головні + 5 дрібниць на день, решта — у Вхідних |
| Видимий прогрес мотивує | Amabile & Kramer | Вкладка «Готово», без «прострочено» |
| Ритуал завершення дня | Newport | «Закрити день» — 3 кроки на одному екрані |
| Вивантаження думок перед сном | Scullin et al., 2018 | Крок «Що в голові на завтра?» |
| Наступна фізична дія | GTD | «Перший крок» у режимі фокусу |
| Таймбоксинг | Zao-Sanders, HBR 2018 | Таймер 15/25/45 хв |
| Без вічного беклогу | — | Записи старші 14 днів тихо йдуть у «Колись»; раз на тиждень — «Ще актуально?» |

## Розробка

```bash
pnpm install
pnpm dev
```

- `pnpm typecheck` — перевірка типів main + renderer
- `pnpm build:win` — інсталятор у `dist/` без публікації
- `KAST_NOW=2026-11-02T19:00 pnpm dev` — запуск із підміненим «зараз» (перевірка вечора, перенесень, тижневого перегляду)
- `node_modules/electron/dist/electron.exe scripts/make-icon.cjs` — перегенерувати іконку

Структура: `src/main` (вікна, трей, гаряча клавіша, оновлення), `src/preload` (типізований `window.kast`), `src/renderer/src` (React: `views/` — 4 вкладки, `flows/` — фокус, закриття дня, тижневий перегляд, `data/` — Dexie та правила, `sync/` — Supabase, `design-system/` — Karkas Pulse + щільний шар у `app.tsx`).

## Синхронізація (необов'язково)

Без ключів Kast працює лише локально. Щоб увімкнути:

1. Створіть проєкт на [supabase.com](https://supabase.com).
2. SQL Editor → виконайте `supabase/schema.sql`.
3. Скопіюйте `.env.example` у `.env` і впишіть URL та anon key (Settings → API).
4. Для релізів додайте ті самі значення в GitHub → Settings → Secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

### Вхід через Google (головний спосіб)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → OAuth client ID → тип **Web application**. В Authorized redirect URIs додайте `https://<ваш-проєкт>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Sign In / Providers → **Google**: увімкніть і вставте Client ID та Client Secret.
3. Supabase → Authentication → URL Configuration → **Redirect URLs**: додайте `http://127.0.0.1:53682/auth/callback`, `http://127.0.0.1:53683/auth/callback`, `http://127.0.0.1:53684/auth/callback`.

Як це працює: «Увійти через Google» відкриває ваш браузер; після вибору акаунта Google повертає на локальну адресу Kast (`127.0.0.1`, доступна лише з цього ПК й лише на час входу), і Kast обмінює одноразовий код на сесію (PKCE). Синхронізація вмикається сама.

### Запасний вхід кодом з пошти

Authentication → Email Templates → «Magic Link»: додайте в текст листа `{{ .Token }}` — Kast входить 6-значним кодом, без переходів у браузер.

## Оновлення

Kast перевіряє GitHub Releases при старті й кожні 4 години, тихо завантажує нову версію і показує «Оновлення готове · Перезапустити». Якщо проігнорувати — встановиться при закритті.

Один раз: створіть **публічний** репозиторій `Validolio11/kast` (логін уже вписано в `electron-builder.yml` → `publish.owner`).

Кожен реліз:

```bash
npm version patch
```

```bash
git push --follow-tags
```

Workflow `.github/workflows/release.yml` збере інсталятор і опублікує його разом із `latest.yml`.

Без сертифіката підпису Windows SmartScreen покаже попередження під час першого встановлення («Докладніше → Усе одно запустити»). Самі оновлення працюють і без підпису.
