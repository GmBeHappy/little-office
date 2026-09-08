"use client";
import { useState } from "react";
import {
  Select as SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
export type SelectOption = { value: string; label: string };
const DEFAULT = "__office_default__";
export function Select({
  id,
  label,
  value,
  onChange,
  onBlur,
  options,
  disabled = false,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const boundary = trigger?.closest<HTMLElement>('[role="dialog"], dialog');
  return (
    <SelectRoot
      value={value || DEFAULT}
      onValueChange={(value) => onChange(value === DEFAULT ? "" : value)}
      disabled={disabled}
    >
      <SelectTrigger
        ref={setTrigger}
        id={id}
        aria-label={label}
        data-value={value}
        onBlur={onBlur}
        className="select-trigger"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className="select-menu"
        container={boundary || trigger?.closest<HTMLElement>(".app-shell")}
        collisionBoundary={boundary || undefined}
        collisionPadding={8}
        sideOffset={6}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value || DEFAULT}
            data-value={option.value}
            className="select-option"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
