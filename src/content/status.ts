export const statusContent = {
  preparing: { symbol: '●', label: 'Готовим' },
  ready: { symbol: '✓', label: 'Готово — подходите к кассе' },
  'not-found': { symbol: '?', label: 'Номер не найден' },
  offline: { symbol: '!', label: 'Нет связи — данные могут быть неактуальны' },
} as const;
