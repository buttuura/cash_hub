import { getLoanDisplayBalance } from './loanDisplay';

describe('getLoanDisplayBalance', () => {
  it('uses the loan amount when outstanding_balance is explicitly zero', () => {
    const loan = {
      amount: 500000,
      outstanding_balance: 0,
      amount_repaid: 0,
    };

    expect(getLoanDisplayBalance(loan)).toBe(500000);
  });

  it('falls back to total_due when outstanding_balance is zero but total_due is present', () => {
    const loan = {
      amount: 500000,
      outstanding_balance: 0,
      total_due: 600000,
      amount_repaid: 0,
    };

    expect(getLoanDisplayBalance(loan)).toBe(600000);
  });
});
