/** Exact legacy notification text, source: frontend/index.html. */
export const readyNotification = (number: number) => ({
  title: `Заказ №${number} готов`,
  body: 'Забирайте на выдаче',
});
export const ratingNotification = (number: number) => ({
  title: `Как вам заказ ${number}?`,
  body: 'Оцените — это пять секунд',
});
