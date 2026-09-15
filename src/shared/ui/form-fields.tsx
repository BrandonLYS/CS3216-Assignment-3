"use client";

import * as React from "react";
import { labelFor } from "@/shared/domain";
import { useFieldError } from "./action-form";
import { Field, Input, Select, Textarea } from "./input";

/** `className` styles the Field wrapper (layout); `inputClassName` styles the control itself. */
type Base = { name: string; label: string; hint?: string; className?: string; inputClassName?: string };

export function TextField({
  name,
  label,
  hint,
  className,
  inputClassName,
  ...props
}: Base & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={useFieldError(name)} className={className}>
      <Input name={name} className={inputClassName} {...props} />
    </Field>
  );
}

export function TextareaField({
  name,
  label,
  hint,
  className,
  inputClassName,
  ...props
}: Base & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={useFieldError(name)} className={className}>
      <Textarea name={name} className={inputClassName} {...props} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  className,
  inputClassName,
  options,
  placeholder,
  ...props
}: Base &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[];
    placeholder?: string;
  }) {
  return (
    <Field label={label} hint={hint} error={useFieldError(name)} className={className}>
      <Select name={name} className={inputClassName} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export const enumOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: labelFor(v) }));

export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
