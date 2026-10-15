# W3-2 · Каркас оценки

Ветка feat/w3-2-rating-dialog, база f1ecce381d42dc94d342e64cf29da090b88860d7.
Рабочая копия /Users/maxgainullin/Projects/Iskendy-frontend.

Прочитаны актуальные contexts/screenshots всех M-R1 (245:3378/3418/3459/3499/3537),
M-R2 (245:3579/3629), M-R3 (245:3680), обоих M-R4 (245:3706/3772),
D-R1…R4 (246:3868/3922/3987/4029); переменные проверены.
Из Figma только на чтение экспортированы исходные back/close/check SVG,
сохранены точные байты и SHA256 в src/assets/rating/SOURCE.json.
Q24 minimal semantic aliases сохраняют исходные цвета backgrounds/scrim,
shadow alpha 0.3 представлен 8-битным экспортом, без смены палитры.

Radix Dialog: full-screen ниже 768, ширина 640/top64 выше; прокрутка при малой
высоте, safe-area, focus trap/Escape/return focus. Управление шагами, draft,
pending и error принадлежит потребителю. Окно не выполняет API и не подтверждает
отправку самостоятельно. Dev kit демонстрирует только переходы презентации,
production пока не подключён к незавершённой оценке.

R1 переиспользует оригинальные EmotionCharacter/Slider. В диалоге valuetext
содержит видимую эмоцию («Восторг»), имя персонажа остаётся default у Slider.
R2 использует server-owned branch: Q21 defaults заголовки и наборы из
нарисованных веток, без собственного порога. R3 — приватный Input/1000 символов;
contactConsent=false по Q07, contact field не выдуман. R4 появляется только
по явному шагу потребителя, HTTPS maps/noopener/noreferrer. Действие close
доступно и во время pending для будущего cancellation owner.

368 unit/component и 211 E2E — PASS; typecheck/lint/tokens/build/size/format PASS.
8 keyboard/draft/layout и 2 touch E2E на Chromium/WebKit, native frame screenshots
390/768/1024/1440, в review-evidence/w3-2-2026-10-08/.
WebKit default Tab policy зависит от macOS: проверено удержание фокуса внутри
диалога, без предположения о точном цикле кнопок при отключённом Full Keyboard Access.
Физические устройства и VoiceOver/TalkBack ещё не проверены.

Следующий блок: API create/rate/detail, claimEnsure, отсутствие auto POST retry,
разрешение сетевой неопределённости через check; затем issued entry/history.
Каркас W3-2 технически готов, W3-4 частично (причины/comment presentation).
Текущий счёт 47 пунктов: 22 технически сделаны, 14 частичны, 11 впереди.
Это не закрытая фаза/приёмка Claude и не готовность релиза. Backend/legacy/sw/storage
контракты и package/lock не менялись. Нет push/deploy/production API/motion/3D.
