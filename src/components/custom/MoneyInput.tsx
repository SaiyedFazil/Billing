"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
};

/**
 * Accepts only digits and at most one dot with two decimals, so the string it
 * produces is always safe for parseRupees(). Never converts to a number —
 * money stays an exact decimal string end to end.
 */
export function MoneyInput({
  value,
  onChange,
  invalid,
  className,
  placeholder = "0",
  ...rest
}: MoneyInputProps) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cn(
        "text-right tabular-nums",
        invalid && "border-destructive focus-visible:ring-destructive",
        className,
      )}
      onChange={(event) => {
        const next = event.target.value;
        if (next === "" || /^\d*(\.\d{0,2})?$/.test(next)) {
          onChange(next);
        }
      }}
      {...rest}
    />
  );
}
