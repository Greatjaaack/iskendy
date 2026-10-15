/* Service worker табло «Искенди».
 *
 * Нужен ровно для одного: показывать системное уведомление о готовности заказа.
 * На Android `new Notification()` запрещён — уведомление умеет показывать только
 * ServiceWorkerRegistration.showNotification(), отсюда и этот файл.
 *
 * ВАЖНО: здесь намеренно НЕТ обработчика fetch и никакого кэша. Табло должно
 * обновляться сразу после деплоя, а кэширующий service worker подсовывал бы
 * гостям старую версию страницы, пока они её вручную не перезагрузят.
 */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

// Тап по уведомлению возвращает гостя на его экран заказа, а не открывает
// вторую вкладку поверх уже открытой.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(function (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].url.indexOf("/board") !== -1) return list[i].focus();
        }
        return self.clients.openWindow("/board?my=1");
      })
  );
});
