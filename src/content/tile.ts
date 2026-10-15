/** Exact Web/Tile 556:14070; counts use current board data. */
export const tileContent = {
  board: 'Всё табло',
  counts: (preparing: number, ready: number) =>
    `Готовим ${preparing}, готово ${ready}`,
} as const;
