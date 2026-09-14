import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/shared/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "icon";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-focus",
  secondary: "bg-surface-1 text-ink border border-hairline hover:bg-surface-2 hover:border-hairline-strong",
  tertiary: "bg-transparent text-ink hover:bg-surface-2",
  ghost: "bg-transparent text-ink-subtle hover:text-ink hover:bg-surface-2",
  danger: "bg-transparent text-tag-red border border-hairline hover:bg-tag-red/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-caption gap-1.5",
  md: "h-8 px-3.5 text-body-sm gap-2",
  icon: "h-7 w-7 p-0 justify-center",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center rounded-md leading-none font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
});
