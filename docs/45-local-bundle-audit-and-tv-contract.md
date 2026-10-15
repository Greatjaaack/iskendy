# Локальный аудит bundle и TV контракт · 2026-10-09

Baseline2abd9bc: ALL JS144079 Б gzip, лимит122880. Без новых зависимостей, библиотечных патчей, смены backend/функций/validation, chunk split или изменения gate. Существующие preview5186/5187/5188 сохранены: fingerprints файлов до/после совпали; пользовательские browser/storage не использовались.

## Новые ограниченные гипотезы

Fresh in-memory source maps: React DOM207070 mapped bytes, приложение85907, Router35767, Query Core33877, Zod25623. Это минифицированные mapped UTF-8 spans, не gzip-атрибуция; нельзя вычитать их из ALL как гарантированную экономию.0 module IDs в нескольких чанках. Production не включает dev TV, MSW, stories или test helpers; inline image data URLs0. Предыдущие5 chunk/import split пробы не повторялись.

| Новая проба | ALL gzip | Delta | Решение |
|---|---:|---:|---|
| Baseline |144079|0| Контроль |
| Один общий partial patch-schema |144087|+8| Не принят |
| Общие точные number/date schemas API и storage |144073|−6| Не принят: новая связь модулей ради6 Б |
| Прямой scalar import offline threshold |144004|−75| Принят, полный regression PASS |

App теперь импортирует guestOfflineAfterMs напрямую. Все feature flags сохранены в исходниках; features.guestOfflineAfterMs ссылается на тот же единственный constant30000. Порог, polling/status timers, API, маршруты, storage и утверждённый UI не меняются. Публичный реестр flags перестаёт попадать в bundle, поскольку иных runtime consumers у него нет. Не добавлено новое sideEffects/pure предположение. Проверка:645 unit /61 files,481 full E2E, typecheck/lint/tokens/format/build PASS; offline/API/storage/runtime/legacy сценарии прошли. Docker integration не повторялась для scalar-import-only правки; последний полный результат2abd9bc — HTTP,4rating+2status+18legacy/CSP PASS.

Финальный ALL144004/122880: превышение21124, gate **FAIL**. CSS10663/30720. Экономия75 Б подтверждена production build, не является закрытием gate.0 зависимостей добавлено. Пробы и attribution: review-evidence/bundle-local-audit-2026-10-09.

Не продолжать бесконечный перебор: безопасной локальной гипотезы с подтверждённой экономией21КБ не найдено. Крупнейшие остатки — реально используемые renderer/router/cache/validator. Следующая возможная крупная оптимизация требует отдельного ADR на изменение renderer/router/cache или специализацию библиотечного runtime, с новым доказательством accessibility, API/storage и error semantics. Размер достижимой экономии неизвестен; mapped bytes этого не доказывают. Прежняя смена минификатора отклонена и не повторялась; limit/exclusion/CDN не предлагаются как обход. Ближайший приоритет владельца — GSAP, сведения для одного согласования вынесены в46; дальнейшие bundle эксперименты остановлены.

## Что действительно делает backend и legacy TV

Неизменённый reference166f35d: backend/db.py:get_board, строки330–360: active orders за текущую date, status IN(open,preparing,ready), deleted_at IS NULL, ORDER BY number. Фильтра ready_at по возрасту/N/TTL нет. backend/main.py:get_status, строки224–226: возвращает db.get_board; /api/status не добавляет expiry. Исчезновение активного номера происходит по серверному status=served, явному удалению или смене даты, а не произвольным часам нового UI.

В legacy/index.html:1522–1525 готовые берутся прямо из state.orders;1603–1642 fitTvBoard уменьшает шрифт52→20, затем tvTruncate показывает prefix +N. Возраст readyAt не используется для удаления. CLAIM_PENDING_TTL_MIN=20 в backend/db.py относится к pending guest claim, а не к сроку жизни готового заказа; feedback expired и JWT TTL тоже не правила TV.

Итог: новый frontend **не удаляет активные ready по возрасту**. Сохраняется полный серверный список. Авторское N в описании56:96 — новое не определённое контрактом требование, его нельзя выдавать за имеющуюся backend функцию. Нужен только выбор отображения при >12 в колонке (например согласованное +N либо страницы), без скрытого client-side expiry. Возможное новое age-based правило потребовало бы отдельного продуктового/контрактного решения, сейчас не реализуется. Production/tv остаётся legacy; dev preview показывает все известные12 и отклоняет вход сверхcapacity, не truncates его.

88/106 относятся к font-size номера именно TV overflow: макет66:1202=88px/96line; описание56:96=80% от132≈106. Уменьшение viewport1920→1366 равномерно масштабирует сцену и не является отдельным выбором этого font-size. Ранее Q-30 и44 уточнены этим контрактным результатом: не задавать пользователю вопрос о несуществующем уже установленном TTL.
