import { openDialog } from '../state/actions';
import { Button, Dialog, RadioGroup, Select } from '../ui';
import { UI_SCALES, useSettings, type Density } from './settingsStore';

export function SettingsDialog() {
  const { uiScale, density, set, reset } = useSettings();
  const close = () => openDialog(null);

  return (
    <Dialog
      title="Settings"
      width={26}
      onClose={close}
      buttons={
        <>
          <Button onClick={reset}>Reset to Defaults</Button>
          <Button primary onClick={close}>
            Done
          </Button>
        </>
      }
    >
      <div className="settings-grid">
        <Select
          label="Interface size"
          value={uiScale}
          options={UI_SCALES.map((s) => ({ value: s, label: `${Math.round(s * 100)}%${s === 1 ? ' (default)' : ''}` }))}
          onChange={(value) => set({ uiScale: value })}
        />
        <p className="settings-hint">
          Makes all text and controls larger or smaller. The browser&apos;s own zoom (Ctrl + and Ctrl −) applies on top of this.
        </p>
        <RadioGroup<Density>
          label="Row spacing"
          showLabel
          value={density}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact: fits more rows on small screens' },
          ]}
          onChange={(value) => set({ density: value })}
        />
      </div>
    </Dialog>
  );
}
