// Password input with a show/hide eye toggle, plus an optional
// "confirm password" box so nobody signs up with a typo they can't see.
import { useId, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  /** Show a second box that must match (use on sign-up / new password). */
  confirm?: boolean;
  confirmValue?: string;
  onConfirmChange?: (v: string) => void;
  confirmLabel?: string;
  minLength?: number;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
};

export function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  confirm = false,
  confirmValue = "",
  onConfirmChange,
  confirmLabel = "Confirm password",
  minLength,
  autoComplete = "current-password",
  required,
  hint,
}: Props) {
  const auto = useId();
  const fieldId = id ?? `pw-${auto}`;
  const [show, setShow] = useState(false);

  const matches = confirm && confirmValue.length > 0 && confirmValue === value;
  const mismatch = confirm && confirmValue.length > 0 && confirmValue !== value;

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        <div className="relative">
          <Input
            id={fieldId}
            type={show ? "text" : "password"}
            className="pr-10"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            minLength={minLength}
            autoComplete={autoComplete}
            required={required}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {confirm && (
        <div className="grid gap-2">
          <Label htmlFor={`${fieldId}-confirm`}>{confirmLabel}</Label>
          <div className="relative">
            <Input
              id={`${fieldId}-confirm`}
              type={show ? "text" : "password"}
              className={cn("pr-10", mismatch && "border-destructive focus-visible:ring-destructive")}
              value={confirmValue}
              onChange={(e) => onConfirmChange?.(e.target.value)}
              minLength={minLength}
              autoComplete="new-password"
              required={required}
            />
            <span className="absolute inset-y-0 right-0 flex w-10 items-center justify-center">
              {matches && <Check className="h-4 w-4 text-emerald-600" />}
              {mismatch && <X className="h-4 w-4 text-destructive" />}
            </span>
          </div>
          {mismatch && <p className="text-xs text-destructive">Passwords don't match yet.</p>}
          {matches && <p className="text-xs text-emerald-600">Passwords match.</p>}
        </div>
      )}
    </div>
  );
}

/** Small helper so pages can block submit on a mismatch. */
export function passwordsMatch(a: string, b: string) {
  return a.length > 0 && a === b;
}
