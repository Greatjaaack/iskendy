export const inputContent = {
  orderLabel: 'Номер заказа',
  orderPlaceholder: 'Например, 102',
  invalidNumber: 'Введите номер заказа от 1 до 999.',
  orderHint: 'Номер в верхней части чека',
  orderError: (number: string) =>
    `Номера ${number} сейчас нет — проверьте чек или найдите себя на табло`,
  commentLabel: 'Комментарий',
  commentPlaceholder: 'Расскажите, что нам стоит знать',
  commentHint: 'Необязательно',
  commentError: 'Не удалось отправить. Попробуйте ещё раз.',
  commentExample: 'Спасибо! Всё понравилось.',
} as const;
