export const getLoanDisplayBalance = (loan) => {
  if (!loan) return 0;

  const amount = Number(loan.amount || 0);
  const storedBalance = Number(loan.outstanding_balance ?? 0);
  const hasPositiveStoredBalance = Number.isFinite(storedBalance) && storedBalance > 0;
  if (hasPositiveStoredBalance) {
    return storedBalance;
  }

  const totalDue = Number(loan.total_due ?? 0);
  const hasPositiveTotalDue = Number.isFinite(totalDue) && totalDue > 0;
  if (hasPositiveTotalDue) {
    return Math.max(0, totalDue - Number(loan.amount_repaid || 0));
  }

  const initialDue = Number(loan.initial_total_due ?? 0);
  const hasPositiveInitialDue = Number.isFinite(initialDue) && initialDue > 0;
  if (hasPositiveInitialDue) {
    return Math.max(0, initialDue - Number(loan.amount_repaid || 0));
  }

  return Math.max(0, amount - Number(loan.amount_repaid || 0));
};
