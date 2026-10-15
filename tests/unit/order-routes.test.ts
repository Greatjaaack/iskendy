import { expect, it } from 'vitest';
import { orderListHref, ratingHref } from '../../src/domain/order/routes';
// SEC-02 (owner, 12.10): no order number or date ever enters the address.
it('addresses the orders tab and rating without any order identity', () => {
  for (const href of [orderListHref, ratingHref]) {
    expect(href.startsWith('/board?my=1')).toBe(true);
    expect(href).not.toMatch(/order=|day=|\d{3}/);
  }
  expect(ratingHref).toMatch(/&rate=1$/);
});
