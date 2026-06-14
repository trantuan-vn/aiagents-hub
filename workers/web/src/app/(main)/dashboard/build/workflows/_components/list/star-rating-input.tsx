"use client";

import { Star } from "lucide-react";

interface StarRatingInputProps {
  value?: number;
  onChange: (count: number) => void;
  disabled?: boolean;
}

export function StarRatingInput({ value = 0, onChange, disabled }: StarRatingInputProps) {
  return (
    <span className="inline-flex gap-0.5" role="group" aria-label="Rate workflow">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          disabled={disabled}
          className="text-amber-500 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onChange(level)}
          aria-label={`${level} stars`}
        >
          <Star className={`h-5 w-5 ${level <= value ? "fill-current" : "opacity-25"}`} />
        </button>
      ))}
    </span>
  );
}
