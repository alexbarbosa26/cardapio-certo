import { useMemo, useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  confirmValue?: string;
  onConfirmChange?: (v: string) => void;
  autoComplete?: string;
  showConfirm?: boolean;
  minLength?: number;
}

interface Req { key: string; label: string; test: (s: string) => boolean; }

const REQS: Req[] = [
  { key: "len", label: "Pelo menos 8 caracteres", test: (s) => s.length >= 8 },
  { key: "upper", label: "Uma letra maiúscula (A-Z)", test: (s) => /[A-Z]/.test(s) },
  { key: "lower", label: "Uma letra minúscula (a-z)", test: (s) => /[a-z]/.test(s) },
  { key: "num", label: "Um número (0-9)", test: (s) => /\d/.test(s) },
  { key: "sym", label: "Um caractere especial (!@#$…)", test: (s) => /[^A-Za-z0-9]/.test(s) },
];

export function scorePassword(pw: string): { score: number; label: string; color: string } {
  const passed = REQS.filter((r) => r.test(pw)).length;
  if (!pw) return { score: 0, label: "", color: "bg-muted" };
  if (passed <= 2) return { score: 1, label: "Fraca", color: "bg-destructive" };
  if (passed === 3) return { score: 2, label: "Razoável", color: "bg-amber-500" };
  if (passed === 4) return { score: 3, label: "Boa", color: "bg-lime-500" };
  return { score: 4, label: "Forte", color: "bg-emerald-500" };
}

export function PasswordStrengthField({
  id = "password", label = "Senha", value, onChange,
  confirmValue, onConfirmChange, showConfirm = true, autoComplete = "new-password",
}: Props) {
  const [show, setShow] = useState(false);
  const [showC, setShowC] = useState(false);
  const strength = useMemo(() => scorePassword(value), [value]);
  const mismatch = showConfirm && confirmValue !== undefined && confirmValue.length > 0 && confirmValue !== value;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <div className="relative">
          <Input
            id={id}
            type={show ? "text" : "password"}
            value={value}
            autoComplete={autoComplete}
            onChange={(e) => onChange(e.target.value)}
            className="pr-10"
          />
          <Button type="button" variant="ghost" size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() => setShow((v) => !v)} tabIndex={-1}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={cn("h-full transition-all", strength.color)}
                   style={{ width: `${(strength.score / 4) * 100}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-16 text-right">{strength.label}</span>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 text-xs">
            {REQS.map((r) => {
              const ok = r.test(value);
              return (
                <li key={r.key} className={cn("flex items-center gap-1.5",
                  ok ? "text-emerald-600" : "text-muted-foreground")}>
                  {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {r.label}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showConfirm && onConfirmChange && (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-confirm`}>Confirmar senha</Label>
          <div className="relative">
            <Input
              id={`${id}-confirm`}
              type={showC ? "text" : "password"}
              value={confirmValue ?? ""}
              autoComplete={autoComplete}
              onChange={(e) => onConfirmChange(e.target.value)}
              className="pr-10"
            />
            <Button type="button" variant="ghost" size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setShowC((v) => !v)} tabIndex={-1}>
              {showC ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          {mismatch && <p className="text-xs text-destructive">As senhas não conferem.</p>}
        </div>
      )}
    </div>
  );
}

export function isPasswordValid(pw: string): boolean {
  return REQS.every((r) => r.test(pw));
}
