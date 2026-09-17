/** A keyboard chord like "Ctrl+Shift+F", drawn as keycaps and read out as words. */
export function Kbd({ chord }: { chord: string }) {
  const keys = chord === '+' ? ['+'] : chord.split('+');
  return (
    <span className="ui-kbd">
      <span className="visually-hidden">{keys.join(' ')}</span>
      {keys.map((key, i) => (
        <kbd key={i} aria-hidden="true">
          {key}
        </kbd>
      ))}
    </span>
  );
}
