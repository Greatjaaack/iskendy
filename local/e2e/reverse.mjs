// Реверс-проверка нового фронта против настоящего бэкенда (стенд stack).
// Запуск внутри образа iskendy-frontend-verify (там есть Playwright и браузеры).
import { chromium, webkit } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://stack:8080';
const PASS = process.env.STAFF_PASSWORD ?? "local-test";
const out = [];
const log = (ok, name, detail = '') => {
  out.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
};
const api = async (path, body, token) => {
  const r = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = await api('/api/auth/login', { password: PASS });
const staff = login.json?.token ?? process.env.STAFF_TOKEN;
log(Boolean(staff), 'staff login');
const N = 100 + Math.floor(Math.random() * 800);
await api('/api/order', { number: N }, staff);

const browser = await chromium.launch({
  args: [`--unsafely-treat-insecure-origin-as-secure=${BASE}`],
});

async function guest(name, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push({ url: r.url(), t: Date.now(), body: r.postData() }));
  return { ctx, page, errors, requests, name };
}

// 1. Ввод номера и подписка
const a = await guest('A');
await a.page.goto(BASE + '/');
await a.page.waitForLoadState('networkidle').catch(() => {});
const input = a.page.locator('input').first();
await input.fill(String(N));
await a.page.getByRole('button', { name: 'Показать статус' }).first().click();
await sleep(3000);
const claim = a.requests.find((r) => r.url.endsWith('/api/guest/claim'));
log(Boolean(claim), 'claim отправлен по кнопке', claim?.body ?? '');
const bodyText = await a.page.locator('body').innerText();
log(bodyText.includes(String(N)), 'номер виден на экране после подписки');
await a.page.screenshot({ path: '/out/01-subscribed.png' });

// 2. Ни токен, ни номер не попадают в адрес
const urls = a.requests.map((r) => r.url).join('\n');
const ls = await a.page.evaluate(() => JSON.stringify({ ...localStorage }));
const token = (ls.match(/claimToken[^A-Za-z0-9_-]+([A-Za-z0-9_-]{8,})/) ?? [])[1];
log(Boolean(token), 'claimToken сохранён локально');
log(!token || !urls.includes(token), 'claimToken не в URL запросов');
log(!a.page.url().includes(String(N)), 'номер заказа не в адресе страницы', a.page.url());

// 3. Готово — экран меняется без перезагрузки
await api('/api/order/status', { number: N, status: 'ready' }, staff);
await sleep(12000);
const readyText = await a.page.locator('body').innerText();
log(/готово|забирать/i.test(readyText), 'статус «Готово» пришёл опросом за ≤12 с');
await a.page.screenshot({ path: '/out/02-ready.png' });

// 4. Второй телефон не может забрать тот же номер
const b = await guest('B');
await b.page.goto(BASE + '/');
await b.page.locator('input').first().fill(String(N));
await b.page.getByRole('button', { name: 'Показать статус' }).first().click();
await sleep(3000);
const bText = await b.page.locator('body').innerText();
log(/другого телефона|отслеживают/i.test(bText), 'чужой номер: сообщение taken', bText.slice(0, 160).replace(/\n/g, ' / '));
await b.page.screenshot({ path: '/out/03-taken.png' });

// 5. Валидация ввода
const c = await guest('C');
await c.page.goto(BASE + '/');
for (const value of ['0', '1000', '12a', '-5', '<img src=x onerror=alert(1)>']) {
  const before = c.requests.filter((r) => r.url.endsWith('/api/guest/claim')).length;
  await c.page.locator('input').first().fill('');
  await c.page.locator('input').first().type(value);
  await c.page.getByRole('button', { name: 'Показать статус' }).first().click();
  await sleep(800);
  const after = c.requests.filter((r) => r.url.endsWith('/api/guest/claim')).length;
  log(after === before, `некорректный ввод «${value}» не уходит на сервер`);
}

// 6. Выдача и оценка
await api('/api/order/status', { number: N, status: 'served' }, staff);
await sleep(12000);
await a.page.screenshot({ path: '/out/04-served.png' });
const servedText = await a.page.locator('body').innerText();
log(/выдан|оцен/i.test(servedText), 'после выдачи предлагается оценка', servedText.slice(0, 200).replace(/\n/g, ' / '));

// 7. Частота опроса /api/status в видимой вкладке (ожидание: раз в 5 с)
const st = a.requests.filter((r) => r.url.endsWith('/api/status'));
const recent = st.filter((r) => r.t > Date.now() - 20000);
log(recent.length >= 3 && recent.length <= 6, 'опрос /api/status ~5 с', `${recent.length} за 20 с`);

// 8. Legacy-экраны через загрузчик: без ошибок JS/CSP
for (const path of ['/tv', '/staff', '/stats']) {
  const g = await guest(path, { width: 1366, height: 647 });
  await g.page.goto(BASE + path);
  await sleep(4000);
  const t = await g.page.locator('body').innerText();
  const metrika = g.requests.some((r) => r.url.includes('mc.yandex'));
  log(g.errors.length === 0, `${path}: нет ошибок в консоли`, g.errors.slice(0, 2).join(' ; '));
  log(!metrika, `${path}: Метрика не грузится`);
  log(t.trim().length > 0, `${path}: экран отрисован`, t.slice(0, 80).replace(/\n/g, ' / '));
  await g.page.screenshot({ path: `/out/05${path.replace('/', '-')}.png` });
  await g.ctx.close();
}

// 9. Метрика на гостевых экранах, без номера заказа в URL хита
const ym = a.requests.filter((r) => r.url.includes('mc.yandex'));
log(ym.every((r) => !r.url.includes(`my=${N}`) && !(token && r.url.includes(token))), 'в Метрику не утекают номер и токен', `${ym.length} запросов`);

// 10. Ошибки консоли на гостевых экранах
for (const g of [a, b, c]) {
  const real = g.errors.filter((e) => !/mc\.yandex|ERR_NAME|ERR_INTERNET|net::/.test(e));
  log(real.length === 0, `гость ${g.name}: консоль чистая`, real.slice(0, 3).join(' ; '));
}

// 11. Офлайн: /api/status недоступен → через ~30 с экран «нет связи», без падения
const d = await guest('D');
await d.page.goto(BASE + '/board?view=queue');
await sleep(3000);
await d.page.route('**/api/status', (route) => route.abort());
await sleep(40000);
const offText = await d.page.locator('body').innerText();
log(/связ|интернет/i.test(offText), 'офлайн: сообщение о связи', offText.slice(0, 160).replace(/\n/g, ' / '));
await d.page.screenshot({ path: '/out/06-offline.png' });

// 12. WebKit (Safari) — главная открывается и подписка работает
const wk = await webkit.launch();
const wctx = await wk.newContext({ viewport: { width: 390, height: 844 } });
const wp = await wctx.newPage();
const werr = [];
wp.on('pageerror', (e) => werr.push(e.message));
const N2 = N + 1;
await api('/api/order', { number: N2 }, staff);
await wp.goto(BASE + '/');
await wp.locator('input').first().fill(String(N2));
await wp.getByRole('button', { name: 'Показать статус' }).first().click();
await sleep(3000);
log((await wp.locator('body').innerText()).includes(String(N2)) && werr.length === 0, 'WebKit: подписка работает, без ошибок', werr.join(' ; '));
await wp.screenshot({ path: '/out/07-webkit.png' });
await wk.close();

// 13. Шестой заказ за день с одного телефона — too_many, сообщение показано
const e = await guest('E');
await e.page.goto(BASE + '/');
for (let i = 0; i < 6; i++) {
  const n = 500 + (N % 40) * 10 + i; // ввод принимает 1–999
  await api('/api/order', { number: n }, staff);
  const add = e.page.getByRole('button', { name: /Добавить заказ/ }).first();
  if (i > 0 && (await add.count())) await add.click().catch(() => {});
  await sleep(500);
  const field = e.page.locator('input:visible').first();
  if (!(await field.count())) break;
  await field.fill(String(n));
  await e.page.getByRole('button', { name: 'Показать статус' }).last().click().catch(() => {});
  await sleep(1500);
}
const eText = await e.page.locator('body').innerText();
log(/слишком много|Много гостей/i.test(eText), '6-й заказ: сообщение о лимите', eText.slice(0, 200).replace(/\n/g, ' / '));
await e.page.screenshot({ path: '/out/08-too-many.png' });

await browser.close();
console.log(out.join('\n'));
