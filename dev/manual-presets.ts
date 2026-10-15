import {
  setDelay,
  setFixture,
  resetFixtures,
  setInteractiveDemo,
} from '../tests/msw/handlers';
export const manualPresets = {
  help: { label: 'Помощь · вопросы', route: '/board?view=help', number: 0 },
  notifications: {
    label: 'Уведомления',
    route: '/board?view=notifications',
    number: 112,
  },
  manager: {
    label: 'Сообщение управляющему',
    route: '/board?view=manager',
    number: 0,
  },
  firstError: {
    label: 'Первый заказ · номер уже отслеживают (введите 999)',
    route: '/',
    number: 0,
  },
  orders0: {
    label: 'Мои заказы · пустой список',
    route: '/board?my=1&view=orders',
    number: 0,
  },
  orders1: {
    label: 'Мои заказы · один',
    route: '/board?my=1&view=orders',
    number: 0,
  },
  orders2: {
    label: 'Мои заказы · два',
    route: '/board?my=1&view=orders',
    number: 0,
  },
  orders3: {
    label: 'Мои заказы · три',
    route: '/board?my=1&view=orders',
    number: 0,
  },
  orders5: {
    label: 'Мои заказы · пять (лимит API)',
    route: '/board?my=1&view=orders',
    number: 0,
  },
  entry: { label: 'Ввод номера', route: '/', number: 0 },
  queue: { label: 'Табло', route: '/board?view=queue', number: 0 },
  preparing: { label: 'Готовим · 112', route: '/board?my=1', number: 112 },
  ready: { label: 'Готово · 102', route: '/board?my=1', number: 102 },
  issued: {
    label: 'Выдан · 997 · оценка',
    route: '/board?my=1',
    number: 997,
  },
  positive: {
    label: 'Оценка · положительная ветка (выберите 5)',
    route: '/board?my=1&rate=1',
    number: 997,
  },
  negative: {
    label: 'Оценка · отрицательная ветка (причины и комментарий)',
    route: '/board?my=1&rate=1',
    number: 998,
  },
  detailError: {
    label: 'Ошибка отправки комментария',
    route: '/board?my=1&rate=1',
    number: 998,
  },
  claimError: { label: 'Лимит подписки (429)', route: '/', number: 0 },
  slow: { label: 'Медленная сеть · ответ 10 секунд', route: '/', number: 0 },
  offline: {
    label: 'Сеть недоступна · подождите 30 секунд',
    route: '/board?my=1',
    number: 112,
  },
  newDay: {
    label: 'Новый день · старая подписка сброшена',
    route: '/board?my=1',
    number: 112,
  },
  gone: { label: 'Заказ снят / не найден', route: '/board?my=1', number: 999 },
} as const;
export function applyManualPreset(): void {
  if (import.meta.env.MODE !== 'mock') return;
  const name = sessionStorage.getItem('iskendy_manual_preset');
  if (!name || !Object.hasOwn(manualPresets, name)) return;
  const key = name as keyof typeof manualPresets;
  const preset = manualPresets[key];
  resetFixtures();
  setInteractiveDemo(true);
  localStorage.removeItem('iskendi_my_order');
  sessionStorage.removeItem('iskendy_selected_order_v1');
  // Explicit reset on this isolated synthetic preview origin only.
  for (const key of Object.keys(localStorage))
    if (key.startsWith('iskendy_orders_v1:')) localStorage.removeItem(key);
  if (key.startsWith('orders')) {
    const count = Number(key.slice(6));
    const numbers = [112, 102, 997, 998, 996];
    numbers.slice(0, count).forEach((n, i) =>
      localStorage.setItem(
        'iskendy_orders_v1:manual' + i,
        JSON.stringify({
          kind: 'add',
          sequence: i + 1,
          record: {
            n,
            d: '2026-10-07',
            seen: true,
            subAt: Date.now(),
            claim: 'synthetic-manual',
            lastStatus: i === 1 ? 'ready' : i > 1 ? 'served' : 'preparing',
            ...(i > 1 ? { servedAt: Date.now(), promptedAt: Date.now() } : {}),
          },
        }),
      ),
    );
    setFixture('/api/feedback/check', 'check-served-positive');
    return;
  }
  const served = ['issued', 'positive', 'negative', 'detailError'].includes(
    key,
  );
  if (preset.number)
    localStorage.setItem(
      'iskendi_my_order',
      JSON.stringify({
        n: preset.number,
        d: key === 'newDay' ? '2026-10-06' : '2026-10-07',
        subAt: Date.now(),
        seen: true,
        claim: 'synthetic-manual-claim',
        lastStatus: served ? 'served' : key === 'ready' ? 'ready' : 'preparing',
        ...(served ? { servedAt: Date.now() } : {}),
        ...(key === 'gone' ? { gone: true } : {}),
        ...(['negative', 'detailError'].includes(key)
          ? {
              rated: true,
              fb: {
                id: 2,
                token: '<token>',
                rating: 1,
                branch: 'negative',
                detailSent: false,
              },
            }
          : {}),
      }),
    );
  if (key === 'firstError') {
    setFixture('/api/feedback/check', 'check-not-found');
    setFixture('/api/guest/claim', 'claim-taken');
  }
  if (key === 'positive' || key === 'issued')
    setFixture('/api/feedback/check', 'check-served-positive');
  if (key === 'detailError')
    setFixture('/api/feedback/detail', 'detail-expired');
  if (key === 'claimError') setFixture('/api/guest/claim', 'claim-429');
  if (key === 'slow') setDelay('/api/guest/claim', 10_000);
  if (key === 'offline') setDelay('/api/status', 30_000);
}

/** Explicit linked scenarios seed once, so reload never resets confirmed feedback. */
export function applyLinkedManualPreset(): void {
  if (import.meta.env.MODE !== 'mock') return;
  const linked = sessionStorage.getItem('iskendy_linked_manual_preset');
  if (
    sessionStorage.getItem('iskendy_linked_manual_seed') !== '1' &&
    sessionStorage.getItem('iskendy_manual_preset')
  ) {
    // An explicit choice in the existing harness takes precedence over an old link.
    sessionStorage.removeItem('iskendy_linked_manual_preset');
    applyManualPreset();
    return;
  }
  if (!linked || !Object.hasOwn(manualPresets, linked)) {
    applyManualPreset();
    return;
  }
  if (sessionStorage.getItem('iskendy_linked_manual_seed') === '1') {
    sessionStorage.setItem('iskendy_manual_preset', linked);
    applyManualPreset();
    sessionStorage.removeItem('iskendy_manual_preset');
    sessionStorage.removeItem('iskendy_linked_manual_seed');
  } else {
    // Restore fixture routing, preserving all existing storage and selected order.
    setInteractiveDemo(true);
    if (['positive', 'issued'].includes(linked))
      setFixture('/api/feedback/check', 'check-served-positive');
    if (linked.startsWith('orders'))
      setFixture('/api/feedback/check', 'check-served-positive');
    if (linked === 'firstError') {
      setFixture('/api/feedback/check', 'check-not-found');
      setFixture('/api/guest/claim', 'claim-taken');
    }
    if (linked === 'claimError') setFixture('/api/guest/claim', 'claim-429');
    if (linked === 'slow') setDelay('/api/guest/claim', 10_000);
    if (linked === 'offline') setDelay('/api/status', 30_000);
    if (linked === 'detailError')
      setFixture('/api/feedback/detail', 'detail-expired');
  }
}
