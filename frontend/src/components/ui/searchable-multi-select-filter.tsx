"use client";

import { XIcon } from "lucide-react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";

type Option<T> = { value: T; label: string };

export function SearchableMultiSelectFilter<T extends string | number>({
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
  const anchor = useComboboxAnchor();
  const hasSelection = selected.length > 0;

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <Combobox
          multiple
          items={options}
          value={selected}
          onValueChange={(v) => onChange((v ?? []) as T[])}
        >
          <ComboboxChips
            ref={anchor}
            className="rounded-md border-transparent bg-darkgrey focus-within:border-red/50 focus-within:ring-red/20"
          >
            {selected.map((v) => (
              <ComboboxChip key={String(v)} className="bg-darkergrey text-white dark:bg-darkergrey">
                {options.find((o) => o.value === v)?.label ?? String(v)}
              </ComboboxChip>
            ))}
            <ComboboxChipsInput
              placeholder={hasSelection ? "" : label}
              className="bg-transparent text-white placeholder:text-demigrey"
            />
          </ComboboxChips>
          <ComboboxContent anchor={anchor} className="bg-darkgrey text-white ring-0">
            <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
            <ComboboxList>
              {(item: Option<T>) => (
                <ComboboxItem key={String(item.value)} value={item.value}>
                  {item.label}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      {hasSelection && (
        <button
          type="button"
          aria-label={`Quitar filtro de ${label}`}
          onClick={() => onChange([])}
          className="shrink-0 text-demigrey hover:text-white"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
