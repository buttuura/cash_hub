import React from 'react';
import { Button } from './ui/button';
import { UserRound, UserRoundCheck } from 'lucide-react';

const CheckoutAccountChoice = ({ mode, onModeChange, isAuthenticated, onAccountRequired }) => (
  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-sm font-semibold text-[#172B12]">How would you like to buy?</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <Button
        type="button"
        variant={mode === 'guest' ? 'default' : 'outline'}
        className={mode === 'guest' ? 'bg-[#172B12] text-white hover:bg-[#0f2409]' : ''}
        onClick={() => onModeChange('guest')}
      >
        <UserRound className="mr-2 h-4 w-4" />
        Continue as guest
      </Button>
      {isAuthenticated ? (
        <Button
          type="button"
          variant={mode === 'account' ? 'default' : 'outline'}
          className={mode === 'account' ? 'bg-[#172B12] text-white hover:bg-[#0f2409]' : ''}
          onClick={() => onModeChange('account')}
        >
          <UserRoundCheck className="mr-2 h-4 w-4" />
          Buy with my account
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={onAccountRequired}>
          <UserRoundCheck className="mr-2 h-4 w-4" />
          Sign in to buy
        </Button>
      )}
    </div>
    {!isAuthenticated && (
      <p className="text-xs text-[#5C665D]">
        Guest orders are not linked to an account. Sign in or create an account to track the order from your dashboard.
      </p>
    )}
  </div>
);

export default CheckoutAccountChoice;
