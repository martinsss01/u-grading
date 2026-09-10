"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option<T> = { value: T; label: string };

export function MultiSelectFilter<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  selected: T[];
  onChange: (values: T[]) => void;
}) {
  return (
    <Select
      multiple
      value={selected}
      onValueChange={(v) => onChange((v ?? []) as T[])}
    >
      <SelectTrigger className="w-full rounded-md bg-darkgrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
        <SelectValue placeholder={label}>
          {(value: T[]) =>
            value.length === 0
              ? label
              : value.length === 1
                ? options.find((o) => o.value === value[0])?.label ?? label
                : `${label} (${value.length})`
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={String(o.value)} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
