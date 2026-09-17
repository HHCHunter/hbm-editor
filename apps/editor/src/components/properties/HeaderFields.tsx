import { useShallow } from 'zustand/react/shallow';
import { sceneIndex } from '../../scene/sceneIndex';
import { formatVec, renameObject } from '../../state/actions';
import { useEditor } from '../../state/store';
import { CommitInput } from '../chrome/widgets';

interface Field {
  label: string;
  value: string;
  onCommit?: (text: string) => boolean;
}

export function HeaderFields() {
  const { objects, sel } = useEditor(useShallow((s) => ({ objects: s.objects, sel: s.sel })));
  const one = sel.length === 1 ? (sceneIndex(objects).byId.get(sel[0]!) ?? null) : null;

  const fields: Field[] = [
    {
      label: 'Name',
      value: one ? one.name : sel.length ? `(${sel.length} selected)` : '',
      onCommit: one ? (text) => renameObject(one.id, text) : undefined,
    },
    { label: 'Class', value: one?.cls ?? '' },
    { label: 'Controllers', value: one?.cls === 'ZLIGHT' ? 'ZLightController' : '' },
    { label: 'ScriptC', value: '' },
    { label: 'Wrld', value: one ? formatVec(one.pos) : '' },
  ];
  const selectionKey = sel.join(',');

  return (
    <div className="head-fields bevel-in">
      {fields.map((f) => (
        <div className="head-field" key={f.label}>
          <div className="head-label">{f.label}</div>
          <CommitInput
            key={selectionKey}
            className="head-input"
            value={f.value}
            readOnly={!f.onCommit}
            onCommit={f.onCommit}
          />
        </div>
      ))}
    </div>
  );
}
