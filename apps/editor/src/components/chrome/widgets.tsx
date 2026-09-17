import { useState, type ReactNode } from 'react';

export function GroupHeader({ children }: { children: ReactNode }) {
  return <div className="group-hdr">{children}</div>;
}

interface IconButtonProps {
  glyph: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}

export function IconButton({ glyph, title, active, onClick }: IconButtonProps) {
  return (
    <div className={`btn btn-icon${active ? ' active' : ''}`} title={title} onClick={onClick}>
      {glyph}
    </div>
  );
}

interface TextButtonProps {
  label: string;
  active?: boolean;
  className?: string;
  onClick: () => void;
}

export function TextButton({ label, active, className = 'btn-text', onClick }: TextButtonProps) {
  return (
    <div className={`btn ${className}${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </div>
  );
}

interface RadioProps {
  label: string;
  checked: boolean;
  onSelect: () => void;
}

export function Radio({ label, checked, onSelect }: RadioProps) {
  return (
    <label className="radio-label">
      <input type="radio" checked={checked} onChange={onSelect} />
      {label}
    </label>
  );
}

interface CommitInputProps {
  value: string;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  /** Called on Enter or blur when the text changed. Return false to reject and restore the value. */
  onCommit?: (text: string) => boolean | void;
}

/**
 * A text field that only reports its value when editing finishes, so one edit is one undo step
 * rather than one per keystroke. Escape abandons the edit.
 */
export function CommitInput({ value, readOnly, className, placeholder, onCommit }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }

  const commit = () => {
    if (readOnly || !onCommit || draft === value) return;
    if (onCommit(draft) === false) setDraft(value);
  };

  return (
    <input
      className={className}
      value={draft}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') setDraft(value);
      }}
    />
  );
}
