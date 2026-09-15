import * as React from "react";
import { cn } from "@/shared/lib/cn";

const base =
  "w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-body-sm text-ink placeholder:text-ink-tertiary transition-colors hover:border-hairline-strong focus:border-hairline-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus/50 disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-8", className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(base, "min-h-20 resize-y", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(base, "h-8 appearance-none py-0 pr-8", className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-caption font-medium text-ink-subtle">{label}</span>
      {children}
      {error ? (
        <span className="text-caption text-tag-red">{error}</span>
      ) : hint ? (
        <span className="text-caption text-ink-tertiary">{hint}</span>
      ) : null}
    </label>
  );
}
