# Ночной код проверен на Mac

## Происхождение

Пользователь скачал `iskendy-frontend-cloud-night-result-2026-10-08.zip` в Downloads.
9476766 байт, SHA256 `bc7c9b12abaa5742c93608fcecb1bed911915adc014a5679d6621fcfc8ead5a0`.
Размер, хеш, CRC, отсутствие абсолютных путей/parent traversal/симлинков проверены.
Архив распакован отдельно в `/tmp/iskendy-night-result-verified`, не поверх проекта.
Library materialize ранее вернул HTTP403; повторных вызовов/обходов не было.

Локальная база `35c0c5d478346a9551ffaaa6e07e284e4c703f3e` была чистой.
Патч `NIGHT-CHANGES.patch` прошёл git apply --check и применён в отдельной ветке
`feat/mac-cloud-night-integration`. Локальный commit `9450cc6` соответствует
облачному `9f6791ea7658aefed7e60b8b39c351237a73924e`; происхождение записано в message.
Backend/package/lock/legacy/sw.js не менялись. Все текущие правки сохранены.

## Проверка и исправления

- 344 unit/component tests, typecheck/lint/tokens/build/size прошли на Mac.
- Первые браузерные проверки выявили устаревшие ожидания: начальный board_open
  теперь законный запрос, mobile/desktop имеют разные подписи submit, ошибка
  объявляется скрытым live-announcer, а видимая подсказка связана с полем.
  Исправлены тесты: белый список API, выбор responsive-кнопки, aria-invalid/
  accessible description. После этих правок все 183 E2E прошли.
- Добавлены две проверки на всех пяти viewport: повторный Enter во время claim
  не удваивает запрос/permission; уход на Board до ответа отменяет подписку,
  поздний ответ не записывает storage/permission, Back возвращает рабочую форму.
  Все 25 guest-signals E2E прошли (в том числе эти 10 дополнительных случаев).
- MSW получил ограниченный test-only setDelay для существующих API fixtures;
  тело ответа и provenance не изменены. Он не входит в production dist.
- Новый dist пересобран в собственной Docker-копии, не в backend reference.
  Все 18 FastAPI/CSP/legacy integration tests прошли в Chromium/WebKit.
  Backend reference `7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b` остаётся чистым.
- Финальный полный verify с дополнительными E2E: 344 unit, 193 E2E — PASS;
  typecheck/lint/tokens/build/size/format — PASS, production audit — 0 уязвимостей.
  Подробные логи находятся в `review-evidence/mac-cloud-2026-10-08/`.
- UI осмотрен через браузер Codex на Mac: синтетическая подписка на 102,
  Ready, инструкции выдачи и возврат в поле. Настоящий системный permission UI
  в mock заменён адаптером, поэтому реальные звуки/вибрация/фоновые уведомления
  на физических iPhone/Android не объявляются проверенными.

## Preview и следующий блок

`http://127.0.0.1:5173/` — development mock с синтетическими fixtures.
Не production, не рабочая касса. Подтверждён HTTP200 и осмотр в браузере Mac.

После gate начат анализ W3-1 через design-to-code skill: Figma contexts/screenshots
`244:502` (10 EmotionCharacter вариантов) и `244:553` (5 EmotionSlider вариантов).
Но все 10 raster asset URLs возвращают HTTP202, text/html, 0 байт. Они не сохранены
в src и не используются как изображения. Для продолжения нужны непустые оригинальные
экспорты каждого emotion 1–5 × lg/sm (статичные WebP 720/180 по roadmap или исходники
для штатного vite-imagetools). Скриншот целого компонента не заменяет эти ассеты.

Slider привязан непосредственно к color/v4/pink/blue/sand/olive/yellow/cocoa,
поэтому CSS-реконструкция зависит от Q24. Семантические роли не подбирались.
W2-5 rating-entry и W3-2 не объявлены завершёнными; уведомление с приглашением
оценить остаётся выключенным до рабочего rating flow. Q24, ревью Claude,
реальные телефоны и формальная приёмка ADR-003/фаз остаются открытыми.

Нет push, deploy, публикации, production API или нагрузки. Никаких анимаций/3D;
префикс input отсутствует, синий фокус и Facts Hug contents сохранены.

Обновление 2026-10-08: Q24 согласован владельцем, оригинальные эмоции успешно
получены через read-only Figma exportAsync. Прежний asset blocker снят;
новые результаты и provenance — [W3-1](20-emotion-components-2026-10-08.md).
