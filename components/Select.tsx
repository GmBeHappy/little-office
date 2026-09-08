"use client";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export type SelectOption = { value: string; label: string };
const DEFAULT = "__office_default__";
export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return (
    <SelectPrimitive.Root
      value={value || DEFAULT}
      onValueChange={(v) => onChange(v === DEFAULT ? "" : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        ref={setTrigger}
        className="select-trigger"
        aria-label={label}
        data-value={value}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal
        container={trigger?.closest("dialog") || trigger?.closest(".app-shell")}
      >
        <SelectPrimitive.Content
          className="select-menu"
          position="popper"
          sideOffset={6}
          collisionBoundary={
            trigger?.closest('dialog, [role="dialog"]') || undefined
          }
          collisionPadding={8}
        >
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={16} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value || DEFAULT}
                data-value={option.value}
                className="select-option"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={16} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
