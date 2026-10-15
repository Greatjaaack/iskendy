# Ночная передача · Mac → облако

Снимок 2026-10-08. Рабочая копия: `/Users/maxgainullin/Projects/Iskendy-frontend`.
Ветка `feat/w2-3-order-lifecycle`, база `baa0cc3` поверх Entry `d7d082b`.
Полный SHA текущего локального commit и статус включены в корневой NIGHT-CHECKPOINT.txt архива.
Нет push/deploy, backend изменений или production API. Backend reference pinned
`7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b`.

## Последние изменения

- Проверка выдачи через существующий `/api/feedback/check`: один владелец,
  не чаще 20 секунд, без claim. Отмена/новый день/смена номера/возврат на табло
  исключают применение запоздалого ответа. 15 тестов гонок и переходов.
- Pending показывает «Ждём кухню». NotFound сохраняет ввод, подпись, ошибку и
  переход на общее табло; существующая запись сохраняется для восстановления.
- Ready: три инструкции «Как забрать», явное «Это не мой номер», возврат фокуса
  в поле. Issued: «Отследить другой заказ». Статус в ticket имеет aria-live.
- Первичный фокус заголовка не прокручивает страницу и не скрывает Header.
- По прямому запросу владельца удалён видимый префикс № всех order-inputs;
  label, hint, числовая клавиатура и maxLength сохранены. Figma 67:48 проверен заново.
- Подтверждённый синий focus: color/focus-blue VariableID 350:459, #2563EB;
  focus/ring 66:1076, border/focus 305:60, border/field/focus 305:64.
  Inverse 305:61 = #B6CAEB. Точечно обновлены экспорты; CSS сгенерирован скриптом.
  Primary Button 67:11 имеет paper/canvas border 2px и cobalt outline 2px с
  offset 2px согласно обновлённому описанию компонента. Другие brand-цвета не менялись.
- Последнее атомарное исправление: факт 184:17566 проверен через MCP и screenshot;
  удалены fixed height 36px и clipping, текстовая часть сжимается и переносится.
  Высота карточки теперь определяется содержимым. Добавлена регрессия 320px/
  длинной подписи выдачи. Дизайнер ещё финализирует constraints; проверить финальные
  IDs/геометрию всех шести вариантов на следующем шаге.

## Проверки и их границы

- До последнего изменения Hug contents полный verify прошёл: 304 unit,
  161 Playwright (Chromium/WebKit), typecheck/lint/tokens/build/size.
  Лог `review-evidence/phase2-2026-10-08/lifecycle-verify.log`.
- После Hug contents прошли 8 целевых Chromium/WebKit тестов, включая 320px/
  длинный текст; лог `facts-targeted.log`. Typecheck/lint/tokens также прошли.
  Полный gate после Hug contents нужно запустить в принимающей среде.
- Предыдущие 18 Docker/FastAPI/CSP тестов относятся к Entry d7d082b, не к новому
  lifecycle snapshot. Docker image надо пересобрать с новым dist перед повтором.
- Preview 5173 и kit 5174 на Mac живы, но localhost недоступен из облака.
  Мок-сервер содержит только синтетические fixtures. Никаких реальных кассовых данных.

## Продолжать

1. Проверить архив SHA, безопасно распаковать в новую пустую папку. ZIP без Git-history.
2. Node 24.19.x/npm11: npm ci; npm run browsers:install; npm run verify;
   npm run format:check; npm audit --omit=dev --audit-level=high.
3. Если облачный браузер ограничен, явно отметить блокер и выполнить независимые
   проверки. Не подменять WebKit Chromium и не объявлять E2E пройденными.
4. Сверить финальные «Факты» Figma, затем Help и оставшиеся Order-сценарии roadmap.
   W2-4 звук/вибрация/системные уведомления, W2-6 permission, W2-7 события ещё
   не подключены. Rating-entry/card и фаза 3 также не завершены.
5. Q-24 ждёт явного ответа владельца: семантические aliases для прямых примитивных
   привязок Info/Social/Footer/desktop illustration. Не выдумывать bindings, экраны,
   Saby endpoints или контент. Сохранять feature flags Telegram/game/offer = false.

Phase 0, ADR-003, фазы 1/2 не приняты. Нужны ревью Claude и реальные телефоны;
никаких заявлений о готовом релизе или поддержке 100 гостей. Library uploads
этого checkpoint не публикуют сайт. Последующие codewrites на Mac остановлены
после снимка по явному запросу родителя для чистого cloud handoff.
