import { footerContent } from './footer';

/** Figma TV 02 56:96, all four author variants. */
export const tvContent = {
  prompt: 'Следите за номером заказа',
  preparing: 'Готовим',
  ready: 'Готово',
  readyAccent: 'можно забирать',
  footer: 'Номер заказа — на вашем чеке',
  // Q-09 (12.10): «Плещеева, 1» from the mock-up is wrong; the confirmed address.
  address: footerContent.address.title,
  // Not in 56:96: owner decision 20.10.2026 keeps the legacy TV QR. With it the
  // caption replaces `prompt`, in the «вы» voice of the mock-up.
  qr: 'Следите за заказом в\u00A0телефоне',
  qrAlt: 'QR — следите за заказом в\u00A0телефоне',
  more: (count: number) => `и\u00A0ещё ${count}`,
  empty: [
    ['Ждём ваш заказ', 'Закажите у кассы'],
    ['Скоро будет вкусно', 'Готовые номера появятся здесь'],
  ],
  'no-connection': [
    ['Нет связи с кухней', 'Номера обновятся автоматически'],
    ['Уточните статус на кассе', 'Устаревшие номера не показываем'],
  ],
} as const;
