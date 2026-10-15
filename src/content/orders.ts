import type { StripStatus } from '../domain/order/stack';
/** Figma section 13 (664:23458): variant A, owner decisions 12–13.10. */
export const ordersContent = {
  title: 'Мои заказы',
  add: 'Добавить заказ',
  strip: {
    preparing: 'Готовим',
    ready: 'Готово',
    waiting: 'Ждём кухню',
    notfound: 'Номер не найден',
    issued: 'Выдан · оценить',
    rated: 'Оценено',
  } satisfies Record<StripStatus, string>,
  stripLabel: (number: number, status: string) => `Заказ ${number}, ${status}`,
  number: (number: number) => `№ ${number}`,
  completed: (count: number) => `Завершённые сегодня (${count})`,
  open: (number: number) => `Открыть заказ ${number}`,
  close: 'К моим заказам',
  menu: 'Действия с заказом',
  // S4d 677:24048: shared by the entry claim hook and the add-order sheet.
  already: (number: string) => `Заказ № ${number} уже добавлен`,
  dismiss: 'Закрыть',
} as const;
