# Caddy: как сайт попадает в интернет

Справка, а не рабочий конфиг. Файл, который читает Caddy, лежит **в другом
репозитории** — `iskendy_analytic`, на сервере `/root/dashboards/Caddyfile`.
Здесь его копия, чтобы блок нашего сайта можно было восстановить, не завися от
чужого репозитория и не вспоминая синтаксис в три часа ночи.

## Почему конфиг не у нас

На машине один Caddy на три продукта: он держит 80/443 и терминирует HTTPS для
`analytics.iskendy.ru`, `iskendy.ru` и чужого `bot.iskendy.ru`. Контейнер
`dashboards-caddy-1` поднимается из compose аналитики — значит и конфиг живёт
там же. Заводить второй Caddy ради одного блока смысла нет: порты 80 и 443
всё равно одни на всю машину.

Наш контейнер наружу портов не публикует вовсе. Снаружи до него доходит только
то, что пропустил Caddy.

## Наш блок

```caddy
iskendy.ru, www.iskendy.ru {
	encode gzip
	reverse_proxy iskendy:8080
}
```

`iskendy` — имя контейнера в сети `dashboards_default`, к ней мы подключаемся
через `networks` в `docker-compose.prod.yml`. Если контейнер переименовать,
надо править и здесь, и в том Caddyfile.

## Что делать, если сайт перестал открываться, а контейнер жив

Сначала посмотреть, знает ли Caddy про наш домен:

```bash
docker exec dashboards-caddy-1 cat /etc/caddy/Caddyfile | grep -A3 iskendy.ru
```

Блока нет — значит конфиг затёрли (например, `git checkout Caddyfile` в
`/root/dashboards`). Вернуть блок в файл и перечитать:

```bash
docker exec dashboards-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec dashboards-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

Проверять после reload **все три домена**, а не только свой: файл общий, и
ошибка в нём роняет соседей.

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://iskendy.ru/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://analytics.iskendy.ru/api/health
curl -s -o /dev/null -w "%{http_code}\n" https://bot.iskendy.ru
```

## Откуда взялась эта справка

23.08.2026 обнаружилось, что прод-`Caddyfile` разошёлся с git: на сервере были
блоки `iskendy.ru` и `bot.iskendy.ru`, в репозитории аналитики — нет. То есть
конфигурация нашего сайта существовала ровно в одном экземпляре, в файле на
машине, и любой `git checkout` стёр бы её насовсем. Заметили бы не сразу: Caddy
работает на уже загруженном конфиге и упал бы только при следующем перезапуске.
