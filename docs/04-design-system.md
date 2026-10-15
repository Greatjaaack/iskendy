# 04 · Дизайн-система

Источник правды — Figma «Искенди · Foundations», файл `QDbhShERrxdg5nXHbrr27s`. Значения ниже — снимок от 07.10.2026 (`tokens/*.json`). Если Figma изменилась, правда в Figma: перегенерируй токены (§9).

## 1. Страницы файла

| Страница | ID | Что там | Для нас |
|---|---|---|---|
| 00 · Start | `66:289` | Гайд: структура, токены, правила цвета и типографики | Читать. Часть текста устарела, см. §12 |
| 01 · Foundations | `51:33` | Решения, референсы, правила | Справочно |
| 02 · Brand assets | `66:290` | `Brand/Logo` (on-light, on-dark), `Brand/Rosette`, `Brand/Descriptor`, орнамент | Ассеты |
| 03 · Components · Core | `51:34` | `Menu/Row`, `Menu/Category`, `Queue/Number`, `Accent/Oval`, `Media/Product` | `Queue/Number` — для ТВ (фаза 6) |
| 04 · Components · Web | `66:291` | Все `Web/*` | **Основной источник компонентов** |
| 05 · Templates · TV | `51:35` | `TV 02 / Выдача` (populated / empty / no-connection / overflow), `TV 01` меню | Фаза 6 |
| 06 · Templates · Print | `51:37` | Печать | Вне объёма |
| 07 · Templates · Web · Заказ | `66:292` | Экраны по сценариям | **Основной источник экранов** |
| 09 · Characters · Эмоции | `247:2` | Персонажи Бурк, Кап, Мэх, Тёп, Блик | Изображения для оценки |
| icons | `185:13162` | Библиотека иконок (Regular / Solid) | Иконки |
| 08, 10–13 · Игра | — | «Прыг до кассы» | Вне объёма |
| 90 · Archive, 91 · References | — | Архив и референсы | Не использовать |

## 2. Коллекции переменных и режимы

| Коллекция | Режимы | Для веба |
|---|---|---|
| **Primitives** | Default | Значения для семантики. **В компонентах не используются** |
| **Semantic** | `V3 · базовый`, `V4 · основной` | **Только режим «V4 · основной»** — действующая веб-палитра |
| Deprecated · 1–5 | — | Не использовать |
| Game | — | Вне объёма |

## 3. Слои токенов и CSS-имена

CSS-имена берутся из `codeSyntax.WEB` переменной в Figma — их отдаёт и Figma MCP.

| Слой | CSS-префикс | Использование в компонентах |
|---|---|---|
| Примитивы V3 | `--brand-*` (paper, ink, orange, peach, sky, pistachio, ready, white, line, muted, secondary-accessible, logo-orange, logo-ink) | ❌ запрещено |
| Примитивы-дополнения | `--iskendi-color-*` (transparent, alpha, olive-dark, amber-dark, error-soft) | ❌ запрещено |
| Палитра V4 | Нет CSS-имени в Figma → генератор даёт `--prim-v4-*` | ❌ запрещено |
| Отступы | `--space-0…64` | ✅ |
| Радиусы | `--radius-8…40`, `--radius-capsule` | ✅ |
| Семантика, исходные имена | `--color-*` | ✅ |
| Семантика, роли «Этап 1» | `--iskendi-*` (`fg`, `bg`, `border`) | ✅ |
| Семантика без CSS-имени (11 токенов, §5.3) | Генератор даёт `--color-<путь>` | ✅, с пометкой Q-13 |

**Главное правило.** В компоненте используется **та переменная, к которой привязан узел в Figma**. Компоненты Figma сейчас используют оба семантических слоя. Например, `Web/Status` берёт `--iskendi-fg-primary`, `--color-status-ready-bg`, `--color-surface-hero` и `--iskendi-border-default`. Переводить узлы с `--color-*` на `--iskendi-*` по своей инициативе нельзя: миграция ролей делается сначала в Figma.

## 4. Палитра V4 (примитивы, справочно)

| Примитив | HEX | Где используется через семантику |
|---|---|---|
| `color/v4/paper` | `#FFFCF5` | Фон страницы, поверхности полей, инверсный текст |
| `color/v4/cream` | `#F8F3E7` | Подвал, утопленные зоны |
| `color/v4/sand` | `#EFE6D6` | Disabled, выбранный пункт |
| `color/v4/ink` | `#2D2D2B` | **Основные кнопки, меню, навигация, док** |
| `color/v4/ink-hover` / `ink-press` | `#3D3D3A` / `#1E1E1C` | Hover и pressed чёрной кнопки |
| `color/v4/ink-2` | `#5E5D58` | — |
| `color/v4/cocoa` | `#43342B` | **Основной текст** («меньше чёрного») |
| `color/v4/cocoa-2` | `#6B574A` | Второстепенный текст |
| `color/v4/yellow` / `yellow-soft` | `#F7D66E` / `#FEEFBF` | Статус «Готовим» / поле героя, мягкое предупреждение |
| `color/v4/olive` / `olive-dark` | `#9AAB65` / `#4E602B` | Статус «Готово» / текст и обводка positive |
| `color/v4/sage` | `#E1E6D1` | Мягкое positive, колонка «Готово» |
| `color/v4/blue` / `blue-soft` | `#B6CAEB` / `#EAF0F9` | Инфо, колонка «Готовим» |
| `color/v4/pink` / `pink-soft` | `#FFB2DD` / `#FAE0E4` | Статус «Выдан», стикер / игра |
| `color/v4/orange` | `#DB5D00` | Логотип и розетка, `focus/ring` |
| `color/v4/terracotta` (+ `-hover`, `-press`) | `#A84400` (`#9E3F0A`, `#8C3A12`) | `border/focus`, hover и pressed ссылок |
| `color/v4/field` | `#8F7A6B` | Границы полей и контролов (≥ 3:1) |
| `color/v4/line` | `#2D2D2B` 14 % | Декоративные разделители |
| `color/v4/error` | `#B3261E` | Ошибки |
| `color/amber-dark` | `#715200` | Текст предупреждения |
| `color/error-soft` | `#FBE8E5` | Мягкая поверхность ошибки |

## 5. Семантические токены (режим V4)

### 5.1 Исходные имена `--color-*`

| CSS | Значение | Назначение |
|---|---|---|
| `--color-text-primary` | `#43342B` | Основной текст, цены, заголовки |
| `--color-text-secondary` | `#6B574A` | Мелкий второстепенный текст |
| `--color-text-muted-large` | `#6B574A` | Только крупные необязательные подписи |
| `--color-text-inverse` | `#FFFCF5` | Текст на тёмных и статусных подложках |
| `--color-text-link` | `#43342B` | Ссылки — **всегда с подчёркиванием** |
| `--color-surface-base` | `#FFFCF5` | Основной фон |
| `--color-surface-hero` | `#FEEFBF` | Поле главного блюда |
| `--color-surface-info` | `#EAF0F9` | Инфо, «Готовим» |
| `--color-surface-soft-success` | `#E1E6D1` | Область «Готово» |
| `--color-surface-raised` | `#FFFFFF` | Поле ввода, всплывающее |
| `--color-action-primary-bg` | `#2D2D2B` | **Основная кнопка, меню, активный раздел — чёрные** |
| `--color-action-primary-text` | `#FFFCF5` | Текст на основной кнопке |
| `--color-action-secondary-text` / `-border` | `#43342B` | Вторичная кнопка: прозрачный фон + контур |
| `--color-action-overlay-hover` / `-pressed` | cocoa 8 % / 12 % | Наложение поверх действия; opacity узла 100 % |
| `--color-action-disabled-bg` / `-text` | `#EFE6D6` / `#6B574A` | Недоступная кнопка, вместе с `disabled` или `aria-disabled` |
| `--color-accent-sticker-bg` / `-text` | `#FFB2DD` / `#2D2D2B` | Овальный стикер |
| `--color-status-preparing-bg` / `-text` | `#F7D66E` / `#43342B` | Статус «Готовим»: слово + значок |
| `--color-status-ready-bg` / `-text` | `#9AAB65` / `#43342B` | Статус «Готово» |
| `--color-status-error-text` | `#B3261E` | Ошибка поля: цвет + значок «!» + текст |
| `--color-border-decorative` | ink 14 % | Только декоративные разделители, **не граница поля** |
| `--color-border-control` | `#8F7A6B` | Граница полей и контролов |
| `--color-focus-ring` | `#DB5D00` | Focus-visible 2 px, отступ 3 px (см. Q-05) |
| `--color-brand-logo` / `-logo-ink` | `#DB5D00` / `#2D2D2B` | **Только логотип и розетка** |

### 5.2 Роли «Этап 1» `--iskendi-*`

**Текст и иконки (`fg`)**

| CSS | Значение | Правило |
|---|---|---|
| `--iskendi-fg-primary` | `#43342B` | Основной текст и иконки на светлом |
| `--iskendi-fg-secondary` | `#6B574A` | Вспомогательный текст; контраст проверять на конкретном фоне |
| `--iskendi-fg-placeholder` | `#6B574A` | Плейсхолдер не заменяет подпись поля |
| `--iskendi-fg-disabled` | `#6B574A` | Плюс поведение `disabled` |
| `--iskendi-fg-inverse` | `#FFFCF5` | На тёмных поверхностях |
| `--iskendi-fg-action-primary` | `#FFFCF5` | Только в паре с `--iskendi-bg-action-primary-*` |
| `--iskendi-fg-action-secondary` | `#43342B` | Secondary и tertiary действия |
| `--iskendi-fg-link-default` / `-hover` / `-pressed` | `#43342B` / `#9E3F0A` / `#8C3A12` | Ссылка + подчёркивание |
| `--iskendi-fg-selected` | `#43342B` | Вместе с `bg-selected` и `border-selected` |
| `--iskendi-fg-positive` | `#4E602B` | Успех. Светлую оливу как мелкий текст **не использовать** |
| `--iskendi-fg-danger` | `#B3261E` | Ошибка — плюс текст или значок |
| `--iskendi-fg-warning` | `#715200` | Предупреждение |
| `--iskendi-fg-info` | `#43342B` | Нейтральная информация |
| `--iskendi-fg-on-positive` / `-on-warning` / `-on-info` | `#43342B` | Текст на сильных поверхностях |
| `--iskendi-fg-on-danger` | `#FFFCF5` | Текст на `bg-danger-default` |

**Поверхности (`bg`)**

| CSS | Значение | Правило |
|---|---|---|
| `--iskendi-bg-canvas` | `#FFFCF5` | Фон страницы |
| `--iskendi-bg-surface` | `#FFFFFF` | Приподнятая поверхность |
| `--iskendi-bg-sunken` | `#F8F3E7` | Утопленная поверхность |
| `--iskendi-bg-inverse` | `#2D2D2B` | Тёмная поверхность |
| `--iskendi-bg-disabled` | `#EFE6D6` | Disabled |
| `--iskendi-bg-action-primary-default` / `-hover` / `-pressed` | `#2D2D2B` / `#3D3D3A` / `#1E1E1C` | Основное действие |
| `--iskendi-bg-action-secondary-default` / `-hover` / `-pressed` | прозрачный / cocoa 8 % / cocoa 12 % | Secondary: прозрачный фон, наложение на `canvas` или `surface` |
| `--iskendi-bg-field-default` / `-focus` / `-error` | `#FFFCF5` | Поле |
| `--iskendi-bg-field-hover` | `#FFFFFF` | Hover поля, вместе с `border-field-hover` |
| `--iskendi-bg-field-disabled` | `#EFE6D6` | Неактивное поле |
| `--iskendi-bg-selected` | `#EFE6D6` | Выбранный пункт или чип. Это не pressed кнопки |
| `--iskendi-bg-positive-default` / `-soft` | `#9AAB65` / `#E1E6D1` | С `fg-on-positive` / `fg-positive` |
| `--iskendi-bg-danger-default` / `-soft` | `#B3261E` / `#FBE8E5` | С `fg-on-danger` / `fg-danger` |
| `--iskendi-bg-warning-default` / `-soft` | `#F7D66E` / `#FEEFBF` | С `fg-on-warning` / `fg-warning` |
| `--iskendi-bg-info-default` / `-soft` | `#B6CAEB` / `#EAF0F9` | С `fg-on-info` / `fg-info` |

**Границы и фокус (`border`)**

| CSS | Значение | Правило |
|---|---|---|
| `--iskendi-border-default` | `#8F7A6B` | Обводка интерактивного элемента |
| `--iskendi-border-subtle` | ink 14 % | Декоративный разделитель; не граница единственного контрола |
| `--iskendi-border-strong` | `#43342B` | Сильная граница |
| `--iskendi-border-disabled` | `#EFE6D6` | Только для неактивных |
| `--iskendi-border-focus` | `#A84400` | Внешний фокус 2 px, зазор 2 px цвета фона (см. Q-05) |
| `--iskendi-border-focus-inverse` | `#FFFCF5` | Фокус на тёмном, зазор сохранить |
| `--iskendi-border-field-default` / `-hover` / `-focus` / `-error` / `-disabled` | `#8F7A6B` / `#6B574A` / `#A84400` / `#B3261E` / `#EFE6D6` | Поле. Ошибка — вместе с текстовой подсказкой |
| `--iskendi-border-selected` | `#43342B` | Выбранный чип |
| `--iskendi-border-positive` / `-danger` / `-warning` / `-info` | `#4E602B` / `#B3261E` / `#715200` / `#43342B` | Статусные обводки |
| `--iskendi-border-action-secondary` | `#43342B` | Обводка secondary-действия |

### 5.3 Семантика без CSS-имени в Figma (Q-13)

Генератор выводит имя по пути с префиксом `--color-`. Пока Максим не подтвердит или не задаст `codeSyntax` в Figma, имена считаются временными.

| Токен Figma | Временное CSS-имя | Значение | Назначение |
|---|---|---|---|
| `status/issued/bg` | `--color-status-issued-bg` | `#FFB2DD` | Заказ выдан |
| `status/issued/text` | `--color-status-issued-text` | `#43342B` | Текст на «выдан» |
| `surface/board-ready` | `--color-surface-board-ready` | `#E1E6D1` | Колонка «Готово» на табло |
| `surface/board-preparing` | `--color-surface-board-preparing` | `#EAF0F9` | Колонка «Готовим» |
| `surface/footer` | `--color-surface-footer` | `#F8F3E7` | Подвал |
| `surface/sunken` | `--color-surface-sunken` | `#F8F3E7` | Подложка переключателя |
| `surface/game` | `--color-surface-game` | `#FAE0E4` | Игра (вне объёма) |
| `action/primary/bg-hover` | `--color-action-primary-bg-hover` | `#3D3D3A` | Hover основной кнопки |
| `action/primary/bg-pressed` | `--color-action-primary-bg-pressed` | `#1E1E1C` | Pressed и загрузка |
| `status/error/border` | `--color-status-error-border` | `#B3261E` | Рамка поля с ошибкой |
| `border/field` | `--color-border-field` | `#8F7A6B` | Рамка поля ввода |

## 6. Правила цвета

1. **Кнопки, меню, навигация и док — чёрные** (`action/primary/bg` = ink `#2D2D2B`). Текст — тёплый какао (`#43342B`), не чёрный. Это решение Максима. Если в описании компонента в Figma основное действие или навигация названы «терракотой», описание устарело: правда — в значении токена (§12).
2. **Пропорции** (ориентир, не механика): 60–75 % светлых нейтральных, 20–30 % пастельных полей, 5–10 % акцентов. Молочный + чернильный + 1–2 пастели + акцент, без радуги.
3. **Статус = слово + значок + цвет**, никогда только цвет. «Готовим» — жёлтый, «Готово» — олива, «Выдан» — розовый, текст на них — какао.
4. Мелкий текст светлой оливой не писать. Для текста успеха — `--iskendi-fg-positive` (тёмная олива).
5. Второстепенный мелкий текст — `--color-text-secondary` / `--iskendi-fg-secondary`. `muted-large` — только крупные необязательные подписи.
6. Разделители (`border/decorative`, `border-subtle`) — только декоративные. Граница поля — `border/control`, `border-field-*`.
7. Оранжевый `#DB5D00` и `brand/logo-*` — **только логотип и розетка**: не подложки, не кнопки.
8. Белый текст на оранжевом запрещён (контраст 1,88:1).
9. Ссылки всегда подчёркнуты (стиль `Web/Link`).
10. Hover и pressed — через токены наложения. Opacity узла всегда 100 %, полупрозрачность задаёт сам токен.
11. Disabled передаётся поведением (`disabled` / `aria-disabled`), а не только цветом.
12. Ошибка — цвет + значок «!» + текст подсказки.
13. Фокус всегда видим: 2 px. Какой токен — Q-05; до ответа — тот, что привязан к варианту `state=focus` компонента в Figma.

## 7. Типографика

**Гарнитуры и роли** (00 · Start):

| Гарнитура | Роль |
|---|---|
| **Rubik** Black (900) и Bold (700) | Названия, заголовки, категории, цены, номера заказов |
| **Onest** Regular (400) и Bold (700) | Интерфейс, списки, тексты, подписи, ссылки |
| **Cormorant Garamond** SemiBold Italic (600 italic) | 1–2 коротких акцента на экран. Не цены, не кнопки, не статусы |

**Веб-стили** (межбуквенный интервал везде 0):

| Стиль | Мобайл | Десктоп |
|---|---|---|
| Hero | Rubik 900 40/44 | Rubik 900 64/68 |
| H1 | Rubik 700 32/38 | Rubik 700 40/46 |
| Category | Rubik 700 24/30 | Rubik 700 28/34 |
| Price | Rubik 700 24/30 | Rubik 700 28/34 |
| Order number | Rubik 700 72/76 | Rubik 700 128/128 |
| Body | Onest 400 16/24 | Onest 400 16/24 |
| Label | Onest 700 14/20 | Onest 700 14/20 |
| Small | Onest 400 14/20 | Onest 400 14/20 |
| Accent | Cormorant 600i 32/36 | Cormorant 600i 44/48 |
| Link | Onest 700 14/20 + подчёркивание | — |

**ТВ 1366×768** (`TV 768/*`, фаза 6):

| Стиль | Значение |
|---|---|
| Hero | Rubik 900 65/65 |
| Title | Rubik 700 33/37 |
| Category | Rubik 700 24/28 |
| Body | Onest 400 21/27 |
| Label | Onest 700 19/23 |
| Small | Onest 400 16/20 |
| Price | Rubik 700 26/30 |
| Price/Hero | Rubik 900 56/60 |
| Accent | Cormorant 600i 44/47 |
| Queue number | Rubik 700 94/101 |

**Правила:**
- Стиль выбирается **ровно тот, что у текстового слоя во фрейме Figma** для этой ширины. Фреймы T768 и T1024 смешивают `Web/Mobile/*` и `Web/Desktop/*` — это намеренно, не нормализовать.
- Цены: `300 ₽` с неразрывным пробелом (`\u00A0`); неизвестная цена — `— ₽`, не ноль.
- Номер заказа — `tabular-nums`, чтобы цифры не прыгали.

## 8. Сетка, отступы, радиусы, брейкпоинты

- **Отступы** `--space-*`: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Значения вне шкалы — только если они именно так заданы в Figma; тогда это вопрос к макету.
- **Радиусы** `--radius-*`:

  | Значение | Где |
  |---|---|
  | 8 | Контролы |
  | 16, 24 | Веб-поверхности |
  | 32, 40 | Крупные поля ТВ |
  | `capsule` (999) | Кнопки-капсулы и овальные стикеры |

- **Фреймы и брейкпоинты:**

  | Ширина | Каркас |
  |---|---|
  | 390 | Мобайл: `Web/Header/Mobile` + `Web/Dock` |
  | 768 | T768 · планшет: `Web/Header/Desktop` + `Web/NavSwitch` |
  | 1024 | T1024 |
  | 1440 | D* · десктоп: контент 1200, 12 колонок по 48, минимальная высота 900 |

  Расхождение с подписью в Figma — Q-04.
- **Цели нажатия:** ≥ 44 px; ползунок слайдера — 48 px с целью 56 px.

## 9. Генерация токенов

**Цепочка:** Figma → `tokens/*.json` → `npm run tokens` → `src/styles/tokens.css`, `src/styles/typography.css`.

1. **Экспорт** выполняет агент с доступом к Figma MCP (Claude Code или Codex) через `use_figma` скриптом [`scripts/figma-export-tokens.js`](../scripts/figma-export-tokens.js). Скрипт только читает.
   - Запуск трижды, с `PART = 'primitives'`, `'semantic'`, `'text'`: у ответа MCP лимит 20 КБ.
   - Результаты сохраняются в `tokens/figma-primitives.json`, `tokens/figma-semantic.json`, `tokens/figma-text-styles.json` и коммитятся.

   Использовать REST API переменных Figma нельзя: он требует тарифа Enterprise.
2. **`scripts/build-tokens.mjs`** — без зависимостей, только Node:
   - каждому токену — CSS-переменная в `:root` с **разрешённым** значением (HEX, HEX с альфой → `rgb(r g b / a)`, числа → `px`);
   - имя — из поля `css`, а если его нет — по правилу §3: `--prim-v4-*` для примитивов V4, `--color-<путь>` для семантики. Такие имена выводятся отчётом в консоль;
   - для текстовых стилей — по переменной-шорткату на стиль, например `--t-web-mobile-body: 400 16px/24px "Onest", system-ui, sans-serif;`. В компоненте — `font: var(--t-web-mobile-body);`;
   - в шапке файла — дата экспорта и предупреждение «сгенерировано, не редактировать».
3. **`scripts/check-tokens.mjs`** в CI падает, если в `src/**/*.module.css` или `src/**/*.tsx` встречаются:
   - литералы цвета (`#…`, `rgb(`, `hsl(`, именованные цвета, кроме `transparent`, `currentColor`, `inherit`);
   - переменные `--brand-*`, `--prim-*`, `--iskendi-color-*`;
   - `px` вне разрешённых мест: `1px` для границ и значения из Figma, отмеченные комментарием `/* figma: <nodeId> */`.

   Также сверяет, что `tokens.css` совпадает с результатом генерации из JSON.

## 10. Компоненты (`04 · Components · Web`)

| Компонент Figma | ID | Свойства и варианты | Фаза | Примечания |
|---|---|---|---|---|
| `Web/Button` | `67:44` | `variant` primary / secondary / tertiary × `state` default / hover / pressed / focus / disabled / loading; `Label`; «Круг-стрелка» | 1 | `bg/action/*` + `fg/action/*`; tertiary — `fg/link/*` |
| `Web/Input` | `67:66` | `kind` order-number / comment × `state` default / hover / focus / filled / error / disabled; Label, Value, Hint | 1 | Comment — необязательное многострочное поле |
| `Web/Status` | `67:79` | `status` preparing / ready / not-found / offline | 1 | Слово + значок + цвет; `role="status"`, `aria-live="polite"` |
| `Web/OrderTicket` | `67:1158` | `status` preparing / ready / issued × `size` mobile / desktop; «Номер» | 1 | «Чек» заказа. Внутри `Web/Steps` |
| `Web/Steps` | `179:193` | `stage` preparing / ready / issued | 1 | Принят → Готовим → Готово → Выдан. Пульсация текущего этапа — фаза 7 |
| `Web/QueueChip` | `73:1303` | `status` preparing / ready × `mine` | 1 | `mine` — кольцо 3 px + подпись «ваш», не только цвет |
| `Web/Header/Mobile` | `90:95` | — | 1 | Логотип 276×40 + круглая кнопка адреса (Яндекс Карты) |
| `Web/Header/Desktop` | `79:1491` | — | 1 | Логотип + `NavSwitch` |
| `Web/Footer/Mobile` | `90:109` | — | 1 | Инфокарточки, соцсети, юр. строка |
| `Web/Footer/Desktop` | `79:1512` | — | 1 | Орнаментная полоса, 3 инфокарточки, логотип, соцсети, юр. строка. Лента `Web/Ticker` — фаза 7 |
| `Web/Dock` | `183:363` | `status` none / preparing / ready / issued × `active` order / board / help; «Номер», «Новое» | 1 | Нижнее меню мобайла, кольцо прогресса |
| `Web/NavSwitch` | `179:142` | `active` order / board / none / help × `hasOrder` | 1 | Переключатель планшета и десктопа |
| `Web/ReturnBar` | `179:153` | `status` preparing / ready; «Текст» | 1 | Возврат к заказу с «Табло» |
| `Web/InfoCard` | `204:223` | `kind` address / hours / contact / telegram | 1 | Без обводки, тонированная заливка |
| `Web/SocialButton` | `204:233` | `kind` telegram / vk / instagram | 1 | Круг 48; у Instagram — звёздочка и юр. строка |
| `Web/AssistCard` | `184:243` | `tone` telegram / help / done | 1 | `done` и бот — вне объёма |
| `Web/Tile` | `184:213` | `kind` game / board × `size` narrow / wide | 1 | `game` — вне объёма |
| `Web/Icon` | `72:53` | `name` bell, pin, clock, arrow-right, arrow-left, board, check, receipt, star, star-filled, telegram, vk, instagram, play | 1 | Только из библиотеки `icons` |
| `Web/Consent` | `90:133` | `checked` × `state` | 3 | За флагом `contactConsent` (Q-07) |
| `Web/ReasonChip` | `244:560` | `selected` × `state` default / hover / focus / disabled | 3 | Множественный выбор, галочка + обводка + цвет |
| `Web/EmotionSlider` | `244:553` | `value` 1–5 | 3 | Radix Slider; `role="slider"`, `aria-valuemin=1`, `aria-valuemax=5`, `aria-valuetext` = название эмоции |
| `Web/EmotionCharacter` | `244:502` | `emotion` 1–5 × `size` lg / sm | 3 | Статичный WebP 720 и 180 px; видеопетли — не сейчас |
| `Web/Loader` | `188:17758` | — | 1 | До фазы 7 статичная розетка + текст и `aria-busy`. Вращение — фаза 7 |
| `Web/Rating` | `73:1294` | `value` 0–5 (звёзды) | — | В актуальных макетах не используется. Не реализовывать (Q-15) |
| `Web/OfferCard` | `85:123` | `state` active / used | — | Вне объёма (нет бэкенда) |
| `Web/Ticker`, `Web/Popup`, `Web/Float` | `228:21535`, `228:21616`, `228:21629` | — | 7 | Только веб, на ТВ нет |

## 11. Ассеты

- **Логотип:** `Brand/Logo` on-light и on-dark, страница 02. Не перекрашивать, не пересобирать из шрифта.
- **Орнамент:** шашка из розетки бренда и фески, SVG со страницы 02. Фон экранов — по макетам.
- **Иконки:** библиотека `icons`. VK — собственный глиф (`Web/Icon name=vk`). Отрисовка — через маску ([02-architecture.md](02-architecture.md) §14).
- **Фото:** только реальные фото «Искенди» из Figma (`Media/Product`) или от Максима. Чужие и стоковые фото не подставлять. Нет фото — используется состояние `Media/Product media=empty` и это открытый вопрос.
- **Персонажи эмоций:** страница 09. Мультяшный стиль; персонажи не олицетворяют блюда.

## 12. Известные расхождения внутри Figma

Не исправлять самостоятельно. Учитывать так:

1. **00 · Start** местами описывает V3: «Режимов нет», «Белый текст на оранжевом…». В коллекции Semantic есть режимы V3 и V4. Для веба действует **V4**.
2. **Описания токенов** с хвостами вида «→ ink», «→ white» — пометки V3-эпохи. Значение берётся из режима V4, не из описания.
3. **`action/primary/text`**: описание «Текст на оранжевом» устарело. В V4 это молочный текст на чёрной кнопке.
4. **«Терракота» в описаниях** `Web/NavSwitch` («активный сегмент — терракота») и `Web/Loader` («цвет = action/primary/bg (терракота)»). Значение `action/primary/bg` в V4 — ink `#2D2D2B`; навигация чёрная по решению Максима. Правда — в токене.
5. **Фокус:** `focus/ring` (оранжевый, отступ 3 px) против `border/focus` (терракота, зазор 2 px) — Q-05.
6. **11 семантических токенов без CSS-имени** (§5.3) — Q-13.
7. **Брейкпоинт:** подпись на странице 07 «мобильная раскладка ниже 1024» против фреймов T768 с десктопной шапкой — Q-04.
