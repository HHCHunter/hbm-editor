/* eslint-disable jsx-a11y/interactive-supports-focus, jsx-a11y/click-events-have-key-events -- focus stays on the list, which handles the keys and points at the active option with aria-activedescendant */
import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useMergedRef } from './hooks/useMergedRef';
import { usePopover } from './hooks/usePopover';
import { useTypeahead } from './hooks/useTypeahead';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: ReactNode;
}

export interface SelectProps<T extends string | number> {
  /** Required: the accessible name. */
  label: string;
  hideLabel?: boolean;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

function SelectInner<T extends string | number>(
  { label, hideLabel = false, value, options, onChange, disabled, compact, className }: SelectProps<T>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const labelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { refs, floatingStyles } = usePopover({ open, matchWidth: true });
  const buttonElementRef = useMergedRef<HTMLButtonElement>(buttonRef, refs.setReference, ref);
  const listElementRef = useMergedRef<HTMLDivElement>(listRef, refs.setFloating);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];
  const typeahead = useTypeahead(useCallback(() => options.map((o) => o.label), [options]));

  const openList = (at = selectedIndex) => {
    if (disabled) return;
    setActive(at);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  };
  const step = (from: number, delta: number) => {
    for (let i = from + delta; i >= 0 && i < options.length; i += delta) if (!options[i]!.disabled) return i;
    return from;
  };

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);
  useLayoutEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, listId]);

  return (
    <div className={`ui-select${compact ? ' ui-select--compact' : ''}${className ? ` ${className}` : ''}`}>
      <span id={labelId} className={hideLabel ? 'visually-hidden' : 'ui-field-label'}>
        {label}
      </span>
      <button
        ref={buttonElementRef}
        type="button"
        role="combobox"
        className="ui-select-button"
        aria-labelledby={`${labelId} ${listId}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openList();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const at = typeahead(e.key, selectedIndex);
            if (at >= 0 && !options[at]!.disabled) onChange(options[at]!.value);
          }
        }}
      >
        <span id={`${listId}-value`} className="ui-select-value">
          {selected?.label ?? ''}
        </span>
        <ChevronDown className="ui-icon ui-select-chevron" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={listElementRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-activedescendant={`${listId}-${active}`}
            className="ui-popup ui-listbox"
            style={floatingStyles}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node) && e.relatedTarget !== buttonRef.current) close(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => step(a, 1));
              else if (e.key === 'ArrowUp') setActive((a) => step(a, -1));
              else if (e.key === 'Home') setActive(step(-1, 1));
              else if (e.key === 'End') setActive(step(options.length, -1));
              else if (e.key === 'Enter' || e.key === ' ') choose(active);
              else if (e.key === 'Escape' || e.key === 'Tab') {
                if (e.key === 'Escape') e.stopPropagation();
                close(e.key === 'Escape');
                if (e.key === 'Tab') return;
              } else if (e.key.length === 1) {
                const at = typeahead(e.key, active);
                if (at >= 0) setActive(at);
              } else return;
              e.preventDefault();
            }}
          >
            {options.map((option, i) => (
              <div
                key={String(option.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                className={`ui-option${i === active ? ' is-active' : ''}`}
                onPointerMove={() => !option.disabled && setActive(i)}
                onClick={() => choose(i)}
              >
                <span className="ui-option-check" aria-hidden="true">
                  {option.value === value && <Check className="ui-icon" strokeWidth={2.5} />}
                </span>
                <span className="ui-option-label">{option.label}</span>
                {option.description && <span className="ui-option-description">{option.description}</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** A drop-down list: the ARIA select-only combobox pattern, with type-ahead. */
export const Select = forwardRef(SelectInner) as <T extends string | number>(
  props: SelectProps<T> & { ref?: React.Ref<HTMLButtonElement> },
) => ReturnType<typeof SelectInner>;
