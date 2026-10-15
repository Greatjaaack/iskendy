"""Capture synthetic responses from a read-only backend checkout via in-process ASGI.
No server, production address, login, existing database, notifications or background jobs.
Run from this frontend repo with PYTHONDONTWRITEBYTECODE=1 and --backend PATH.
"""
import argparse
import asyncio
from datetime import datetime
import importlib.metadata
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser()
parser.add_argument('--backend', required=True, type=Path)
args = parser.parse_args()
backend = args.backend.resolve()
output = Path('tests/fixtures').resolve()
output.mkdir(parents=True, exist_ok=True)
commit = subprocess.check_output(['git', '-C', str(backend), 'rev-parse', 'HEAD'], text=True).strip()
if commit != '7ab20f01d7a462f8ad99e1796a181bd33cdfcf4b':
    raise RuntimeError('Unreviewed backend revision; inspect before capturing.')
if subprocess.check_output(['git', '-C', str(backend), 'status', '--porcelain'], text=True).strip():
    raise RuntimeError('Backend reference must be clean.')
sys.dont_write_bytecode = True
sys.path.insert(0, str(backend / 'backend'))

with tempfile.TemporaryDirectory(prefix='iskendy-fixtures-') as sandbox:
    os.chdir(sandbox)  # No .env file can be loaded from the backend checkout.
    os.environ.update({
        'DB_PATH': str(Path(sandbox) / 'fixture.db'), 'STAFF_PASSWORD': '',
        'JWT_SECRET': 'fixture-only-not-a-real-secret', 'TIMEZONE': 'Europe/Moscow',
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
    import db
    import main
    import httpx
    from config import settings

    class FixtureClock(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 10, 7, 13, 8, 0, tzinfo=ZoneInfo('Europe/Moscow'))
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)
    db.datetime = FixtureClock
    main._fire = lambda coroutine: coroutine.close()  # Suppress all queued external notifications.
    async def forbid_network(*_args, **_kwargs):
        raise RuntimeError('External HTTP is forbidden during fixture capture.')
    httpx.AsyncHTTPTransport.handle_async_request = forbid_network
    logging.getLogger().setLevel(logging.CRITICAL)
    db.init_db()  # No ASGI lifespan/startup: no poller, backup loop or digest.
    metadata = {}
    def sanitize(value):
        if isinstance(value, dict):
            return {key: '<token>' if 'token' in key.lower() else sanitize(item) for key, item in value.items()}
        if isinstance(value, list): return [sanitize(item) for item in value]
        return value

    async def capture():
        transport = httpx.ASGITransport(app=main.app, client=('127.0.0.1', 1234))
        async with httpx.AsyncClient(transport=transport, base_url='http://fixture.local') as client:
            async def request(method, path, payload=None, name=None):
                response = await client.request(method, path, json=payload)
                data = response.json()
                if name:
                    (output / f'{name}.json').write_text(json.dumps(sanitize(data), ensure_ascii=False, indent=2) + '\n')
                    metadata[name] = {'method': method, 'path': path.split('?')[0], 'httpStatus': response.status_code}
                return data
            async def claim(number, guest='fixture-guest', name=None):
                return await request('POST', '/api/guest/claim', {'number': number, 'guest': guest}, name)
            async def rated(number, rating, name):
                db.add_order(number)
                token = (await claim(number, f'fixture-{number}'))['claimToken']
                db.set_status(number, 'served')
                if number == 997:
                    await request('GET', '/api/feedback/check?number=997', name='check-served-positive')
                result = await request('POST', '/api/feedback', {'number': number, 'rating': rating, 'claim_token': token}, name)
                return token, result

            await request('GET', '/api/status', name='status-empty')
            for number in [102, 104, 107, 109, 108, 110, 111, 112, 113, 114]:
                db.add_order(number)
                if number in [102, 104, 107, 109]: db.set_status(number, 'ready')
            db.set_status(108, 'open')
            await request('GET', '/api/status', name='status-start-day')
            db.add_order(999); db.set_status(999, 'served')
            await request('GET', '/api/status', name='status-populated')
            await request('GET', '/api/feedback/config', name='config-empty')
            settings.review_url_yandex = 'https://example.test/yandex'
            settings.review_url_2gis = 'https://example.test/2gis'
            settings.social_url_telegram = 'https://example.test/telegram'
            settings.social_url_vk = 'https://example.test/vk'
            settings.social_url_instagram = 'https://example.test/instagram'
            await request('GET', '/api/feedback/config', name='config-links')
            key = (await claim(112, name='claim-ok'))['claimToken']
            await claim(112, 'fixture-stranger', 'claim-taken')
            for n in range(200, 205): db.claim_order(n, guest='fixture-many')
            await claim(205, 'fixture-many', 'claim-too-many')
            main._rate_hits.clear()
            for _ in range(main.RATE_LIMIT_CLAIM): await claim(112)
            await claim(112, name='claim-429')
            main._rate_hits.clear()
            await request('POST', '/api/guest/claim', {'number': 0}, 'validation-422')
            await request('GET', '/api/feedback/check?number=9000', name='check-not-found')
            await request('GET', '/api/feedback/check?number=112', name='check-not-served')
            await request('GET', '/api/feedback/check?number=999', name='check-ok')
            await request('POST', '/api/feedback', {'number': 999, 'rating': 1}, 'feedback-not-claimed')
            await request('POST', '/api/feedback', {'number': 112, 'rating': 1, 'claim_token': key}, 'feedback-not-served')
            pending_key = (await claim(9000, 'fixture-pending'))['claimToken']
            await request('POST', '/api/feedback', {'number': 9000, 'rating': 1, 'claim_token': pending_key}, 'feedback-not-found')
            positive_token, positive = await rated(997, 5, 'feedback-positive')
            await request('POST', '/api/feedback', {'number': 997, 'rating': 5, 'claim_token': positive_token}, 'feedback-already')
            await request('GET', '/api/feedback/check?number=997', name='check-already')
            _, negative = await rated(998, 1, 'feedback-negative')
            identifiers = {'feedback_id': negative['feedbackId'], 'edit_token': negative['editToken']}
            await request('POST', '/api/feedback/rate', {**identifiers, 'rating': 5}, 'rate-ok')
            await request('POST', '/api/feedback/rate', {**identifiers, 'rating': 4, 'edit_token': 'fixture-wrong'}, 'rate-wrong-token')
            await request('POST', '/api/feedback/rate', {'feedback_id': 99999, 'edit_token': 'fixture-wrong', 'rating': 4}, 'rate-unknown-feedback')
            await request('POST', '/api/feedback/detail', {**identifiers, 'tags': ['Вкус'], 'comment': 'Тестовый отзыв', 'contact': ''}, 'detail-ok')
            await request('POST', '/api/feedback/rate', {**identifiers, 'rating': 4}, 'rate-locked')
            with db._connect() as conn:
                conn.execute('UPDATE feedbacks SET created_at = ? WHERE id = ?', ('2026-10-06T13:08:00+03:00', positive['feedbackId']))
            expired = {'feedback_id': positive['feedbackId'], 'edit_token': positive['editToken']}
            await request('POST', '/api/feedback/rate', {**expired, 'rating': 4}, 'rate-expired')
            await request('POST', '/api/feedback/detail', expired, 'detail-expired')
            await request('POST', '/api/feedback/detail', {**expired, 'edit_token': 'fixture-wrong'}, 'detail-wrong-token')
            await request('POST', '/api/feedback/detail', {'feedback_id': 99999, 'edit_token': 'fixture-wrong'}, 'detail-unknown-feedback')
            await request('POST', '/api/guest/event', {'step': 'board_open', 'session': 'fixture-visit', 'guest': 'fixture-guest'}, 'guest-event-ok')
            await request('POST', '/api/guest/event', {'step': 'unknown'}, 'guest-event-ignored')
            main._rate_hits.clear()
            await request('POST', '/api/client/event', {'kind': 'offline', 'screen': 'board', 'detail': 'synthetic fixture'}, 'client-event-ok')
            await request('GET', '/api/health', name='health-ok')

    asyncio.run(capture())
    (output / 'SOURCE.json').write_text(json.dumps({
        'backendCommit': commit, 'method': 'in-process ASGITransport; synthetic isolated SQLite; no lifespan or external HTTP',
        'capturedAt': '2026-10-07',
        'runtime': {p: importlib.metadata.version(p) for p in ['fastapi', 'httpx', 'pydantic-settings', 'starlette', 'segno']},
        'responses': metadata,
    }, ensure_ascii=False, indent=2) + '\n')
    if subprocess.check_output(['git', '-C', str(backend), 'status', '--porcelain'], text=True).strip():
        raise RuntimeError('Backend checkout changed during capture.')
    print(f'Captured {len(metadata)} synthetic backend responses. Backend checkout unchanged.')
