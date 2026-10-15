export const returnBarContent = {
  label: (number: string) => `К моему заказу ${number}`,
  preparing: 'Готовим',
  ready: 'Готово',
  // 706:33365: several orders ready at once.
  many: 'К моим заказам',
  readyMany: (numbers: number[]) => `Готовы: ${numbers.join(', ')}`,
} as const;
