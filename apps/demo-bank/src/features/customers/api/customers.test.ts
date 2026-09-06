import { beforeEach, describe, expect, it } from 'vitest';
import { createCustomer, findCustomer, firstName, resetCustomers } from './customers';

const SUB = 'NcSuRV6Y3pDcgKd0-mbxGnDqXf9E9k5w';

describe('customer directory keyed by sub', () => {
  beforeEach(() => resetCustomers());

  it('misses before sign-up and hits after', () => {
    expect(findCustomer(SUB)).toBeNull();
    const c = createCustomer(
      {
        sub: SUB,
        name: ' Jordan Okafor ',
        email: 'j@example.com',
        phone: '555-0100',
        signupAmr: ['face', 'hwk'],
      },
      new Date('2026-09-05T12:00:00Z'),
    );
    expect(c).toMatchObject({
      sub: SUB,
      name: 'Jordan Okafor',
      createdAt: '2026-09-05T12:00:00.000Z',
    });
    expect(findCustomer(SUB)).toEqual(c);
    expect(firstName(c)).toBe('Jordan');
  });

  it('is idempotent per identity: a second sign-up returns the first record', () => {
    const first = createCustomer({ sub: SUB, name: 'A', email: 'a@x', phone: '1', signupAmr: [] });
    const again = createCustomer({ sub: SUB, name: 'B', email: 'b@x', phone: '2', signupAmr: [] });
    expect(again).toEqual(first);
  });

  it('keeps identities apart: a different sub is a different customer', () => {
    createCustomer({ sub: SUB, name: 'A', email: 'a@x', phone: '1', signupAmr: [] });
    expect(findCustomer('other')).toBeNull();
  });
});
