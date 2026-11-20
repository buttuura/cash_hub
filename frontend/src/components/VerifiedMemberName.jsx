import React from 'react';
import { Check } from 'lucide-react';

function VerifiedMemberName({ name, verified, nameClassName = '' }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={nameClassName}>{name}</span>
      {verified && (
        <span
          role="img"
          aria-label="Verified member"
          className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="absolute inset-0 h-full w-full fill-[#2B6F38]"
          >
            <path d="M12 2 14.9 5.1 19.1 4.9 18.9 9.1 22 12 18.9 14.9 19.1 19.1 14.9 18.9 12 22 9.1 18.9 4.9 19.1 5.1 14.9 2 12 5.1 9.1 4.9 4.9 9.1 5.1Z" />
          </svg>
          <Check
            aria-hidden="true"
            className="relative h-2.5 w-2.5 stroke-[3] text-white"
          />
        </span>
      )}
    </span>
  );
}

export default VerifiedMemberName;
