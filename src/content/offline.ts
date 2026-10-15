/** Q-01 (owner, 12.10) on E2 556:14340: no «Открыть табло», a ready order stays visible;
 * section 13 frames 709:33371 / 709:33416 / 709:33494. */
const list = (numbers: number[]) =>
  numbers.length === 1
    ? `Статус заказа ${numbers[0]} видно на табло в зале.`
    : `Статус заказов ${numbers.join(', ')} видно на табло в зале.`;
export const offlineContent = {
  title: 'Связь пропала',
  body: (cooking: number[], keptReady: boolean) =>
    [
      keptReady
        ? 'Мы не показываем статусы, которые могли измениться.'
        : 'Мы не показываем старые номера, чтобы не ввести вас в заблуждение.',
      cooking.length ? list(cooking) : '',
    ]
      .filter(Boolean)
      .join(' '),
  restoring: 'Восстанавливаем связь…',
  auto: 'Переподключаемся автоматически.',
  board: 'Табло обновится, как только появится связь',
} as const;
