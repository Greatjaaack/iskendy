"""Номер заказа с кассы: число сегодня, строка после переезда на Saby.

В iiko номер заказа числовой, и вся история табло, сортировки и ввод номера гостем
на него опираются. В Saby Presto номер продажи — **строка**, и каким он окажется на
самом деле, станет видно только на первом живом чеке.

Поэтому путь «касса → табло» принимает оба вида: цифры остаются числом (чтобы ничего
из существующего не поехало), нечисловой номер заводится строкой — иначе заказ не
попал бы на табло вовсе, и узнал бы об этом только гость у стойки.
"""

import db


def test_цифры_остаются_числом():
    assert db.kassa_number(42) == 42
    assert db.kassa_number("42") == 42
    assert db.kassa_number(" 42 ") == 42
    assert isinstance(db.kassa_number("42"), int)


def test_нечисловой_номер_остаётся_строкой():
    assert db.kassa_number("A-7") == "A-7"
    assert db.kassa_number("Ч-17/2") == "Ч-17/2"


def test_пустой_номер_не_заказ():
    assert db.kassa_number(None) is None
    assert db.kassa_number("") is None
    assert db.kassa_number("   ") is None


def test_заказ_со_строковым_номером_заводится_и_виден():
    """Строковый номер доезжает до табло и попадает в список дня."""
    assert db.ingest_kassa_order("A-7", opened_at="2026-10-01T12:05:00") is True
    board = db.get_board()
    numbers = [o["number"] for o in board["orders"]]
    assert "A-7" in numbers


def test_повторный_строковый_номер_не_дублируется():
    assert db.ingest_kassa_order("A-8") is True
    assert db.ingest_kassa_order("A-8") is False


def test_пустой_номер_не_заводится():
    assert db.ingest_kassa_order("") is False
    assert db.ingest_kassa_order(None) is False


def test_числовой_номер_ведёт_себя_как_раньше():
    """Главное требование: пока касса на iiko, ничего не меняется."""
    assert db.ingest_kassa_order(42, opened_at="2026-10-01T12:00:00") is True
    assert db.ingest_kassa_order("42") is False  # тот же заказ, пришедший строкой
    numbers = [o["number"] for o in db.get_board()["orders"]]
    assert 42 in numbers
