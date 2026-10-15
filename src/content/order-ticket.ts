export const ticketContent = {
  label: 'Ваш заказ',
  pending: 'Ждём кухню', // Q-18: documented default; legacy source, no separate Figma frame.
  // UX-14 (owner, 12.10): what the guest should do while cooking, by notification support.
  hint: {
    unsupported:
      'Не блокируйте экран — позовём, когда будет готово. Номер также появится на табло в зале.',
    granted: 'Позовём уведомлением, даже если свернёте браузер.',
    off: 'Уведомления выключены — держите страницу открытой.',
  },
  readyTitle: 'можно забирать',
  ready: 'Покажите номер на кассе — и заказ ваш.',
  issuedTitle: 'выдан',
  issued: 'Оцените заказ ниже — это займёт секунду.',
  statusLabel: 'Статус',
  pickupLabel: 'Где забрать',
  pickup: 'Касса',
  states: { preparing: 'Готовим', ready: 'Готово', issued: 'Выдан' },
  steps: ['Принят', 'Готовим', 'Готово', 'Выдан'],
} as const;
