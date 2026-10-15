/** source: backend/main.py REASON_TEXT (read-only reference 7ab20f01), legacy/index.html fbFail. */
export const ratingErrors: Record<string, string> = {
  not_found: 'Не нашли такой заказ за сегодня. Проверьте номер на чеке',
  not_served: 'Заказ ещё готовится — оцените, когда заберёте',
  already: 'Спасибо, отзыв по этому заказу уже принят',
  expired: 'Время истекло, но оценку мы записали — спасибо',
  unknown_feedback: 'Не нашли эту оценку — оцените заказ заново',
  wrong_token: 'Не получилось дописать отзыв — оцените заказ заново',
  locked: 'Отзыв уже отправлен — спасибо!',
  taken: 'Этот номер уже отслеживают с другого телефона',
  too_many: 'Слишком много заказов с одного телефона за сегодня',
  not_claimed:
    'Оценить заказ можно с того телефона, на котором вы за ним следили',
};
export const ratingNetworkError = 'Нет связи — попробуйте ещё раз';
