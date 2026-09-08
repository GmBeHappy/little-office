"use client";
import { useId, type ComponentProps } from "react";
import { useFormContext } from "react-hook-form";
import { useI18n } from "@/lib/i18n";
import { Input } from "./ui/input";
import { Field, FieldLabel, FieldError, FieldDescription } from "./ui/field";
export function FormInput({
  name,
  label,
  description,
  ...props
}: ComponentProps<typeof Input> & {
  name: string;
  label: string;
  description?: string;
}) {
  const id = useId();
  const { t } = useI18n();
  const { register, getFieldState, formState } = useFormContext();
  const { error } = getFieldState(name, formState);
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        {...register(name)}
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${id}-error` : description ? `${id}-description` : undefined
        }
      />
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
      {error?.message && (
        <FieldError id={`${id}-error`}>{t(error.message)}</FieldError>
      )}
    </Field>
  );
}
export function FormError() {
  const { t } = useI18n();
  const {
    formState: { errors },
  } = useFormContext();
  const message = errors.root?.message;
  return typeof message === "string" ? (
    <FieldError className="rounded-xl bg-destructive/5 px-3 py-2">
      {t(message)}
    </FieldError>
  ) : null;
}
