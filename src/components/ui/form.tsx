import * as React from "react";
import { cn } from "@/lib/utils";

// ─── Input ───────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900",
        "placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
        "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        "transition-colors duration-150",
        error
          ? "border-red-400 focus:ring-red-400"
          : "border-slate-200 hover:border-slate-300",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

// ─── Textarea ────────────────────────────────────────────────

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900",
      "placeholder:text-slate-400 resize-y min-h-[80px]",
      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
      "disabled:cursor-not-allowed disabled:bg-slate-50",
      "transition-colors duration-150",
      error ? "border-red-400" : "border-slate-200 hover:border-slate-300",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// ─── Select ──────────────────────────────────────────────────

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }
>(({ className, error, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900",
      "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
      "disabled:cursor-not-allowed disabled:bg-slate-50",
      "transition-colors duration-150",
      error ? "border-red-400" : "border-slate-200 hover:border-slate-300",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

// ─── FormField ───────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-700"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-500" aria-label="wajib diisi">*</span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-600" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

// ─── FormSection ─────────────────────────────────────────────

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset className={cn("space-y-4", className)}>
      <legend className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2 w-full">
        {title}
        {description && (
          <span className="block text-xs font-normal text-slate-500 mt-0.5">{description}</span>
        )}
      </legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

// ─── FormActions ─────────────────────────────────────────────

export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-end gap-3 pt-4 border-t border-slate-100", className)}>
      {children}
    </div>
  );
}
