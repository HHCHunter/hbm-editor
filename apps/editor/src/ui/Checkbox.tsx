import { forwardRef, useId, type ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  description?: ReactNode;
}

/** A labelled checkbox: a native input, drawn as a sunken Editor2 box. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, onChange, children, disabled, description },
  ref,
) {
  const descId = useId();
  return (
    <label className={`ui-check${disabled ? ' is-disabled' : ''}`}>
      <input
        ref={ref}
        type="checkbox"
        className="ui-check-input"
        checked={checked}
        disabled={disabled}
        aria-describedby={description ? descId : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ui-check-box" aria-hidden="true">
        {checked && <Check className="ui-check-mark" strokeWidth={3} />}
      </span>
      <span className="ui-check-label">
        {children}
        {description && (
          <span id={descId} className="ui-check-description">
            {description}
          </span>
        )}
      </span>
    </label>
  );
});

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  label: string;
  /** Show the label as a heading; otherwise it's only announced. */
  showLabel?: boolean;
  value: T;
  options: readonly RadioOption<T>[];
  onChange: (value: T) => void;
  orientation?: 'horizontal' | 'vertical';
}

/** Mutually exclusive options. Arrow keys move and select, as native radios do. */
export function RadioGroup<T extends string>({
  label,
  showLabel = false,
  value,
  options,
  onChange,
  orientation = 'vertical',
}: RadioGroupProps<T>) {
  const name = useId();
  const labelId = useId();
  return (
    <div
      role="radiogroup"
      aria-labelledby={showLabel ? labelId : undefined}
      aria-label={showLabel ? undefined : label}
      className={`ui-radios ui-radios--${orientation}`}
    >
      {showLabel && (
        <div id={labelId} className="ui-field-label">
          {label}
        </div>
      )}
      {options.map((option) => (
        <label key={option.value} className={`ui-radio${option.disabled ? ' is-disabled' : ''}`}>
          <input
            type="radio"
            className="ui-check-input"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="ui-radio-dot" aria-hidden="true" />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
