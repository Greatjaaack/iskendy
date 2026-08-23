#!/usr/bin/env python3
"""Точка входа контейнера: подготовить /data и уронить права до пользователя app.

Зачем нужен отдельный шаг. Volume монтируется поверх каталога вместе со своим
владельцем — тем, что был у файлов на хосте. Права, розданные в образе через
chown, при этом не наследуются: у нас том живёт с тех времён, когда контейнер
работал под root, и все файлы в нём принадлежат root. Просто написать в
Dockerfile `USER app` нельзя — приложение получит отказ на запись в базу и
поднимется мёртвым.

Поэтому стартуем root'ом, выправляем владельца тома и только затем становимся
app и передаём управление uvicorn. Разово это чинит и уже существующий том, так
что деплой не требует ручных команд на сервере.
"""

import os
import pwd
import sys

DATA_DIR = os.environ.get("DATA_DIR", "/data")
APP_USER = os.environ.get("APP_USER", "app")


def _own(path: str, uid: int, gid: int) -> None:
    """chown, если владелец уже не тот. Молча пропускаем исчезнувшее: рядом
    работает SQLite, и файлы -wal/-shm появляются и пропадают сами."""
    try:
        st = os.stat(path)
        if st.st_uid != uid or st.st_gid != gid:
            os.chown(path, uid, gid)
    except FileNotFoundError:
        pass


def main() -> None:
    if not sys.argv[1:]:
        sys.exit("entrypoint: нечего запускать")
    if os.geteuid() == 0:
        user = pwd.getpwnam(APP_USER)
        os.makedirs(DATA_DIR, exist_ok=True)
        _own(DATA_DIR, user.pw_uid, user.pw_gid)
        for root, dirs, files in os.walk(DATA_DIR):
            for name in dirs + files:
                _own(os.path.join(root, name), user.pw_uid, user.pw_gid)
        # Порядок важен: после setuid вернуть себе группы уже нельзя.
        os.initgroups(APP_USER, user.pw_gid)
        os.setgid(user.pw_gid)
        os.setuid(user.pw_uid)
    # exec, а не подпроцесс: uvicorn должен стать PID 1 и сам получать SIGTERM,
    # иначе docker stop будет ждать таймаут и убивать его жёстко.
    os.execvp(sys.argv[1], sys.argv[1:])


if __name__ == "__main__":
    main()
