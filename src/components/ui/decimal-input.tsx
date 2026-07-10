import { forwardRef, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseDecimal, sanitizeDecimalKeystroke } from '@/lib/decimal';

type BaseProps = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>;

export interface DecimalInputProps extends BaseProps {
  /** Valor numérico controlado. Use `null`/`undefined` para começar vazio. */
  value: number | null | undefined;
  /** Callback com o número já normalizado (NaN quando o texto está vazio). */
  onChange: (value: number) => void;
  /** Casas decimais usadas ao formatar valor externo. Padrão 2. */
  fractionDigits?: number;
  /** Permite valores negativos (padrão false). */
  allowNegative?: boolean;
  /** Placeholder padrão pt-BR. */
  placeholder?: string;
}

/**
 * Input decimal cross-browser: aceita vírgula ou ponto como separador em Chrome,
 * Safari, Firefox, Edge e navegadores mobile. Internamente devolve `number`.
 */
export const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, fractionDigits = 2, allowNegative = false, placeholder = '0,00', onBlur, ...rest }, ref) => {
    const toText = (n: number | null | undefined) => {
      if (n === null || n === undefined || !Number.isFinite(n)) return '';
      // Mantém a digitação sem forçar casas fixas enquanto o campo está externo
      return String(n).replace('.', ',');
    };

    const [text, setText] = useState<string>(toText(value));

    // Sincroniza quando o valor externo muda (ex.: reset de formulário)
    useEffect(() => {
      const parsed = parseDecimal(text);
      const external = value ?? NaN;
      const same = Number.isFinite(parsed) && Number.isFinite(external)
        ? Math.abs(parsed - (external as number)) < 1e-9
        : !Number.isFinite(parsed) && !Number.isFinite(external);
      if (!same) setText(toText(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const clean = sanitizeDecimalKeystroke(e.target.value, { allowNegative });
          setText(clean);
          const n = parseDecimal(clean);
          onChange(Number.isFinite(n) ? n : NaN);
        }}
        onBlur={(e) => {
          const n = parseDecimal(text);
          if (Number.isFinite(n)) {
            setText(n.toLocaleString('pt-BR', {
              minimumFractionDigits: fractionDigits,
              maximumFractionDigits: fractionDigits,
            }));
          }
          onBlur?.(e);
        }}
        {...rest}
      />
    );
  },
);
DecimalInput.displayName = 'DecimalInput';
