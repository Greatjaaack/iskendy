# GSAP · конкретное предложение для согласования · 2026-10-09

**Технология GSAP уже одобрена владельцем.** Это не повторное согласование библиотеки и не выполненная реализация. Новые параметры ниже — предложение, не авторские данные и не код. Персонажи статичны; прежнее кольцо Dock не возвращается. Предложение ниже уточняет первоначальную краткую выдержку: Status фиксирован180мс, Chips150мс; рекомендуемый reduce сохраняет отдельное авторское дыхание Loader вместо общего отсутствия движения.

## Что уже задано автором

- Loader188:17758: 360°/1.1с linear repeat; reduce дыхание1.4с, но opacity endpoints/easing не заданы.
- Ticker228:21535: 60px/с linear, один cycle≈32с и seamless reset; reduce статичный. Скорость и реальная длина цикла определяют duration, не новый creative timing.
- Popup228:21616: hold6с, не чаще45–60с, один за раз, не при number input focus/status toast; reduce none. Entry/exit timing и easing не заданы.
- Float228:21629:3–4chips и подъём30px/растворение, web lower zone; reduce none. Trajectory/time/easing не заданы.
- Steps179:193 pulse и остальные UI события названы, но числовые параметры отсутствуют.

get_motion_context(recursive:true)9октября для всех пяти указанных nodes вернул nodes:[] без ошибок. Экспортируемых авторских keyframe tracks здесь не обнаружено; это не отменяет текстовые описания. Motion duration/easing tokens в текущих exports отсутствуют. Сохранён exact response в evidence/author-motion.json. На следующем этапе новые авторские tracks/tokens, если появятся, имеют приоритет над предложением.

## Одна рекомендуемая спецификация для подтверждения

| Эффект | Предложение для отсутствующих чисел |
|---|---|
| Loader reduce breathing | opacity0.6↔1, полный цикл1.4с (0.7с на сторону), sine.inOut; normal только известное rotation1.1с linear |
| Steps текущий этап | scale1↔1.04, полный цикл1.6с, sine.inOut |
| Смена статуса | opacity0→1 за180мс, power2.out, без смещения/изменения layout |
| Нажатие кнопки / выбор chip | button scale1→0.98→1,120мс на сторону, power1.out; chip такое же тихое scale за150мс; состояния/цвета меняются сразу |
| Slider magnet |160мс, power2.out; только к уже существующим точным stops, без новых позиций/значений |
| Dialog | open200мс / close150мс, opacity0↔1 и y12↔0px, power2.out; focus trap/aria/scroll через Radix, не самодельное окно |
| CompactDock |180мс, power2.out; y=фактическая высота+bottom offset, существующие scroll thresholds; keyboard/focus сразу |
| Popup | период60с, hold6с; enter220мс / exit160мс, y12↔0px, opacity0↔1, power2.out; запрещённые моменты показа сохраняются |
| Float |3chips, вертикально вверх30px за700мс, opacity1→0, power1.out, без случайного горизонтального броска; вариант пролёта по ленте пока static до авторской trajectory |

Reduce: рекомендуем **Figma-исключение Loader дыхание1.4с**, остальные эффекты static, Popup/Float не показываются; соответствующее исключение в общем roadmap/tests зафиксировать после подтверждения. Никакой анимации персонажей/TV и колец Dock. Не добавлять предлагаемые числа до подтверждения. Начать после подтверждения с Loader+Ticker по известным значениям и одного E2E timeline, затем UI эффекты; Popup/Float static components потребуют отдельных текущих design contexts/assets.

## Зависимости и ограничения

Official registry read-only подтверждает gsap3.15.0 и @gsap/react2.1.2, peers gsap^3.12.5/react>=17, runtime deps у пары отсутствуют. Уже установленный React19.3.0 соответствует peer range; это не доказательство финальной совместимости до тестов. Install пока не выполнялся.

docs/10 ADR001/011 и docs/11 требуют отдельный dependency ADR: зафиксировать эти две точные версии, core+CSSPlugin/useGSAP, cleanup/matchMedia, без ScrollTrigger/all/CDN/нового engine. Технологию повторно спрашивать не нужно. Затем exact package/lock, audit, measured before/after, CSP и обычный/reduce E2E. Новые plugins только по отдельному решению.

ALL сейчас144004gzip,120KiB limit122880, превышение21124. Все lazy chunks считаются; GSAP chunk тоже будет считаться. Его delta не измерена без установки. Бюджет не ослаблен, gateFAIL остаётся отдельным открытым результатом; не обещать GSAP как решение размера и не удалять согласованные функции ради него.

## Последующее решение владельца

Предложение выше сохранено как история. Владелец разрешил exact GSAP pair, Loader/Ticker по авторским значениям и затем кнопки120–150мс, Slider160мс power2.out, CompactDock180мс. Reduced motion теперь **всё static**, breathing не разрешено. Другие предложенные эффекты не разрешены и не реализованы. Текущая реализация и измерения: [47](47-approved-gsap-subset.md), ADR018. Данные об отсутствии установки и старый ALL144004 выше относятся только к моменту предложения.
