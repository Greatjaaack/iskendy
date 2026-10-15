import { manualPresets } from './manual-presets';
const scenario = document.querySelector<HTMLSelectElement>('#scenario')!;
const width = document.querySelector<HTMLSelectElement>('#width')!;
const frame = document.querySelector<HTMLIFrameElement>('#screen')!;
const status = document.querySelector<HTMLElement>('#status')!;
for (const [key, value] of Object.entries(manualPresets))
  scenario.add(new Option(value.label, key));
function start() {
  const key = scenario.value as keyof typeof manualPresets;
  sessionStorage.setItem('iskendy_manual_preset', key);
  frame.src = manualPresets[key].route;
  status.textContent = 'Начат сценарий: ' + manualPresets[key].label;
}
scenario.addEventListener('change', start);
document.querySelector('#start')!.addEventListener('click', () => {
  frame.src = 'about:blank';
  start();
});
width.addEventListener('change', () => {
  frame.width = width.value;
});
document
  .querySelector('#back')!
  .addEventListener('click', () => frame.contentWindow?.history.back());
document.querySelector('#repair')!.addEventListener('click', () => {
  frame.contentWindow?.__ISKENDY_TEST__?.setFixture(
    '/api/feedback/detail',
    'detail-ok',
  );
  status.textContent =
    'Ответ отправки восстановлен. Повторите действие в интерфейсе.';
});
start();

document.querySelector('#reopen')!.addEventListener('click', () => {
  const view = frame.contentWindow;
  if (!view?.__ISKENDY_TEST__) return;
  view.history.pushState(null, '', '/board?my=1&rate=1');
  view.dispatchEvent(new PopStateEvent('popstate'));
  status.textContent =
    'Оценка открыта повторно без сброса черновика (нужен сценарий выданного заказа).';
});
