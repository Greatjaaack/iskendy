"""Serve an ephemeral backend copy with built frontend and synthetic SQLite data.
Run with the backend's Python 3.12/locked dependencies. No production addresses,
.env, startup tasks, notifications or backend source changes are used.
"""
import argparse
import importlib.metadata
import logging
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib

parser = argparse.ArgumentParser()
parser.add_argument('--backend', required=True, type=Path)
parser.add_argument('--dist', required=True, type=Path)
parser.add_argument('--port', type=int, default=8099)
parser.add_argument('--container-listen', action='store_true')
args = parser.parse_args()
if args.container_listen and not Path('/.dockerenv').exists():
    raise RuntimeError('Listening beyond localhost is restricted to the isolated Docker test.')
backend = args.backend.resolve()
dist = args.dist.resolve()
if sys.version_info[:2] != (3, 12):
    raise RuntimeError('The pinned backend requires Python 3.12.')
commit = subprocess.check_output(['git', '-C', str(backend), 'rev-parse', 'HEAD'], text=True).strip()
if commit != '7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b':
    raise RuntimeError('Unreviewed backend revision.')
if subprocess.check_output(['git', '-C', str(backend), 'status', '--porcelain'], text=True).strip():
    raise RuntimeError('Backend reference must remain clean.')
for package in tomllib.loads((backend / 'poetry.lock').read_text())['package']:
    if 'main' in package['groups'] and importlib.metadata.version(package['name']) != package['version']:
        raise RuntimeError(f"Locked version mismatch: {package['name']}")
for name in ['index.html', 'legacy.html', 'sw.js', 'VERSION', 'ROUTES.json']:
    if not (dist / name).is_file():
        raise RuntimeError(f'Missing built frontend file: {name}')
if not 1024 <= args.port <= 65535:
    raise RuntimeError('Use an unprivileged local port.')
sys.dont_write_bytecode = True

with tempfile.TemporaryDirectory(prefix='iskendy-local-spike-') as folder:
    sandbox = Path(folder)
    shutil.copytree(backend / 'backend', sandbox / 'backend')
    shutil.copytree(dist, sandbox / 'frontend')
    os.chdir(sandbox)
    os.environ.update({
        'DB_PATH': str(sandbox / 'synthetic.db'),
        'STAFF_PASSWORD': 'synthetic-spike-password',
        'JWT_SECRET': 'synthetic-spike-only-not-a-real-secret',
        'TIMEZONE': 'Europe/Moscow',
        'TELEGRAM_BOT_TOKEN': '', 'TELEGRAM_ALERT_TARGETS': '',
        'TELEGRAM_FEEDBACK_TARGETS': '', 'TELEGRAM_DIGEST_TARGET': '',
        'BOT_PROXY_URL': '', 'FEEDBACK_ALERT_ENABLED': 'false',
        'KASSA_ORDERS_URL': '', 'KASSA_INTERNAL_TOKEN': '',
        'IIKO_ORDERS_URL': '', 'IIKO_INTERNAL_TOKEN': '',
        'ANALYTICS_BASE_URL': '', 'ANALYTICS_SUMMARY_URL': '',
        'BACKUP_ENABLED': 'false', 'DIGEST_ENABLED': 'false',
        'REVIEW_URL_YANDEX': '', 'REVIEW_URL_2GIS': '',
        'SOCIAL_URL_TELEGRAM': '', 'SOCIAL_URL_INSTAGRAM': '', 'SOCIAL_URL_VK': '',
    })
    sys.path.insert(0, str(sandbox / 'backend'))
    import db
    import httpx
    import main
    import uvicorn

    main._fire = lambda coroutine: coroutine.close()

    async def forbid_external_http(*_args, **_kwargs):
        raise RuntimeError('Outbound backend HTTP is forbidden in the local spike.')

    httpx.AsyncHTTPTransport.handle_async_request = forbid_external_http
    db.init_db()
    for number, status in [(102, 'ready'), (108, 'open'), (110, 'preparing'), (999, 'served')]:
        db.add_order(number)
        db.set_status(number, status)
    logging.getLogger().setLevel(logging.WARNING)
    print(f'Isolated synthetic backend at http://127.0.0.1:{args.port}; no lifespan/external HTTP.', flush=True)
    uvicorn.run(main.app, host='0.0.0.0' if args.container_listen else '127.0.0.1', port=args.port, lifespan='off', access_log=False, log_level='warning')
