import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-container",
  secondary: "bg-surface-container-high text-on-surface hover:bg-surface-container-highest",
  quiet: "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  danger: "bg-error text-on-error hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
