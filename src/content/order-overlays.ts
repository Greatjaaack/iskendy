/** Lazy chunk copy: «⋯» popover, removal, notifications and add-order sheets
 * (S3b 671:23838, S1b 669:23692 / 684:51957, S3n 682:24531 / 687:58924, S4 672:23871). */
export const orderOverlaysContent = {
  menuBoard: 'Показать на табло',
  menuNotifications: 'Уведомления',
  menuRemove: 'Убрать из моих заказов',
  removeTitle: (number: number) => `Убрать заказ ${number}?`,
  // 669:23692 phone sheet, 684:51957 wide dialog.
  removeBody: (wide: boolean) =>
    `Он исчезнет из «Моих заказов» на этом ${wide ? 'устройстве' : 'телефоне'}. Номер освободится только завтра.`,
  removeConfirm: 'Убрать',
  removeCancel: 'Отмена',
  addBody: 'Введите номер с чека — добавим его в «Мои заказы».',
  notifications: 'Уведомления',
  notificationsDone: 'Понятно',
  // 682:24531 (iPhone), 687:58924 (Android, off); granted — UX-14 journal text.
  notificationsBody: {
    unsupported:
      'На iPhone браузер не присылает уведомления о заказе. Пока ждёте — не блокируйте экран: позовём звуком, когда будет готово. Номер также появится на табло в зале.',
    off: 'Уведомления выключены. Включите их в настройках браузера для этого сайта — или держите страницу открытой: позовём звуком и вибрацией. Номер также появится на табло в зале.',
    granted: 'Позовём уведомлением, даже если свернёте браузер.',
  },
} as const;
