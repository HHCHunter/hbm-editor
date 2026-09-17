import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'>;

export interface TextFieldProps extends NativeInput {
  /** The field's name. Shown beside it unless `hideLabel`, and always announced. */
  label: string;
  hideLabel?: boolean;
  value: string;
  /**
   * Called on Enter or blur when the text changed, so one edit is one undo step rather than one
   * per keystroke. Return false to reject the text and restore the value. Escape abandons the edit.
   */
  onCommit?: (text: string) => boolean | void;
  /** Called on every keystroke instead, for live filters. */
  onChange?: (text: string) => void;
  mono?: boolean;
  /** Help or a validation message under the field. */
  hint?: ReactNode;
  invalid?: boolean;
  layout?: 'inline' | 'stacked';
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, value, onCommit, onChange, mono, hint, invalid, layout = 'inline', readOnly, className, onKeyDown, onBlur, ...rest },
  ref,
) {
  const id = useId();
  const hintId = useId();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const live = !!onChange;
  const text = live ? value : draft;

  const commit = () => {
    if (live || readOnly || !onCommit || draft === value) return;
    if (onCommit(draft) === false) setDraft(value);
  };

  return (
    <div className={`ui-field ui-field--${layout}${hideLabel ? ' ui-field--bare' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'ui-field-label'}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={`ui-input${mono ? ' ui-input--mono' : ''}${readOnly ? ' is-readonly' : ''}`}
        value={text}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => (live ? onChange(e.target.value) : setDraft(e.target.value))}
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || live) return;
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape' && draft !== value) {
            e.stopPropagation();
            setDraft(value);
          }
        }}
        {...rest}
      />
      {hint && (
        <div id={hintId} className={`ui-field-hint${invalid ? ' is-error' : ''}`}>
          {hint}
        </div>
      )}
    </div>
  );
});

export interface SearchFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  /** Search on Enter rather than on every keystroke. */
  onSubmit?: (text: string) => void;
  placeholder?: string;
  /** e.g. "12 of 340"; announced politely as it changes. */
  count?: ReactNode;
  /** Inside a dialog, take focus when the dialog opens. */
  initialFocus?: boolean;
  className?: string;
}

/** A search box with a clear button and a live result count. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { label, value, onChange, onSubmit, placeholder, count, initialFocus, className },
  ref,
) {
  const id = useId();
  return (
    <div className={`ui-search${className ? ` ${className}` : ''}`} role="search">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <div className="ui-search-box">
        <Search className="ui-icon ui-search-icon" aria-hidden="true" strokeWidth={1.75} />
        <input
          ref={ref}
          id={id}
          type="search"
          className="ui-input ui-search-input"
          value={value}
          placeholder={placeholder}
          data-autofocus={initialFocus || undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit?.(value);
            else if (e.key === 'Escape' && value) {
              e.stopPropagation();
              onChange('');
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="ui-search-clear"
            aria-label="Clear search"
            tabIndex={-1}
            onClick={() => {
              onChange('');
              onSubmit?.('');
            }}
          >
            <X className="ui-icon" aria-hidden="true" />
          </button>
        )}
      </div>
      {count !== undefined && (
        <span className="ui-search-count" aria-live="polite">
          {count}
        </span>
      )}
    </div>
  );
});

export interface VectorFieldProps {
  label: string;
  value: readonly number[];
  axes?: readonly string[];
  readOnly?: boolean;
  format?: (n: number) => string;
  onCommit?: (value: number[]) => boolean | void;
}

/** A vector shown as one labelled number field per axis. */
export function VectorField({ label, value, axes = ['X', 'Y', 'Z'], readOnly, format = String, onCommit }: VectorFieldProps) {
  const groupId = useId();
  return (
    <div role="group" aria-labelledby={groupId} className="ui-vector">
      <span id={groupId} className="visually-hidden">
        {label}
      </span>
      {axes.map((axis, i) => (
        <TextField
          key={axis}
          label={`${label} ${axis}`}
          hideLabel
          mono
          className="ui-vector-axis"
          data-axis={axis}
          readOnly={readOnly}
          value={format(value[i] ?? 0)}
          onCommit={(text) => {
            const n = Number(text);
            if (!Number.isFinite(n) || !onCommit) return false;
            const next = [...value];
            next[i] = n;
            return onCommit(next);
          }}
        />
      ))}
    </div>
  );
}
