/** Figma 68:2, 80:315, 68:1160, 74:236; server supplies business error messages. */
export const entryContent = {
  title: 'Где мой заказ?',
  description:
    'Введите номер с чека — покажем, готовим ли мы ваш заказ или уже можно забирать.',
  // One label on every width (owner, 12.10; FIG-13).
  submit: 'Показать статус',
  // Owner-approved copy for the hall-wide claim limit (12.10, UX-05).
  rateLimited: 'Много гостей сразу — нажмите ещё раз через минуту',
  preparing: 'Готовим',
  ready: 'Готово',
  boardTitle: 'Табло заказов',
  pickup: 'можно забирать',
  pickupTitle: 'Как забрать',
  pickupSteps: (number: string) => [
    'Подойдите к кассе',
    `Назовите номер ${number} или покажите экран`,
    'Приятного аппетита!',
  ],
  boardHint: (number: number) =>
    `Ваш номер ${number} обведён. Обновляется автоматически.`,
  myOrder: 'мой заказ',
  dockStates: { preparing: 'готовим', ready: 'готово', issued: 'выдан' },
} as const;
