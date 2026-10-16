import { chromium } from '@playwright/test';
const BASE='http://stack:8080'; const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b = await chromium.launch();
const q = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
const r2=[]; q.on('response', async r=>{ if(r.url().includes('/api/') && !/status|event|config/.test(r.url())) r2.push(r.request().method()+' '+r.url().split('/api/')[1]+' '+(r.request().postData()??'')+' → '+(await r.text()).slice(0,140)); });
await q.goto(BASE+'/'); await q.waitForLoadState('networkidle');
await q.locator('input').first().fill('109');
await q.getByRole('button',{name:'Показать статус'}).first().click(); await sleep(2000);
await q.getByText('Как вам заказ?').first().click(); await sleep(1500); console.log('buttons:', (await q.getByRole('button').allInnerTexts()).join(' | ')); await q.getByRole('button',{name:/Оставить отзыв|Оценить/}).first().click().catch(e=>console.log('no btn')); await sleep(1500); console.log('buttons2:', (await q.getByRole('button').allInnerTexts()).join(' | '));
await q.screenshot({path:'/out/12-rate-open.png'});
for (const name of [/Дальше/, /Пропустить/, /Готово|Отправить/]) { const x=q.getByRole('button',{name}).first(); if (await x.count()) { await x.click().catch(()=>{}); await sleep(2000);} }
console.log(r2.join('\n'));
console.log((await q.locator('body').innerText()).slice(0,300).replace(/\n+/g,' / '));
await q.screenshot({path:'/out/13-rate-result.png'});
await b.close();
