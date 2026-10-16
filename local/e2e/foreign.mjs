// B2: телефон B пытается оценить выданный заказ, закреплённый за телефоном A.
// Ожидание: сервер не принимает оценку (taken), гость сразу видит объяснение в диалоге.
// Самодостаточный: сам заводит заказ, закрепляет его за «A» через API и выдаёт.
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://stack:8080';
const PASS = process.env.STAFF_PASSWORD ?? 'local-test';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, body, token) =>
  (await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })).json();
const staff = (await api('/api/auth/login', { password: PASS })).token ?? process.env.STAFF_TOKEN;
const N = 100 + Math.floor(Math.random() * 800);
await api('/api/order', { number: N }, staff);
await api('/api/guest/claim', { number: N, guest: 'phone-A-' + N });
await api('/api/order/status', { number: N, status: 'served' }, staff);

const b = await chromium.launch();
const q = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const calls = [];
q.on('response', async (r) => {
  if (/guest\/claim|\/api\/feedback$/.test(r.url()))
    calls.push(r.url().split('/api/')[1] + ' → ' + (await r.text()).slice(0, 100));
});
await q.goto(BASE + '/');
await q.waitForLoadState('networkidle');
await q.locator('input').first().fill(String(N));
await q.getByRole('button', { name: 'Показать статус' }).first().click();
await sleep(2000);
await q.getByText('Как вам заказ?').first().click();
await sleep(1000);
await q.getByRole('button', { name: /Оставить отзыв/ }).first().click();
await sleep(1000);
await q.getByRole('button', { name: /Дальше/ }).first().click();
await sleep(2000);
const dialog = (await q.getByRole('dialog').innerText().catch(() => '')).replace(/\n+/g, ' / ');
await q.screenshot({ path: '/out/b2-after-next.png' }).catch(() => {});
const ok = /отслеживают с другого телефона/.test(dialog) && !calls.some((c) => c.startsWith('feedback →'));
console.log(`${ok ? 'PASS' : 'FAIL'} | B2: чужой заказ — объяснение в диалоге, оценка не ушла | ${calls.join(' ; ')}`);
await b.close();
await api('/api/auth/logout', {}, staff); // касса одна — освободить
process.exit(ok ? 0 : 1);
