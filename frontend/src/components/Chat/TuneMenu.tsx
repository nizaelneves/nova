import { useState } from 'react';
import { useAppStore } from '../../lib/store';
import { Icon } from '../Icon';
import { PickerModal } from '../PickerModal';
import { SettingRow } from '../settingsParts';

const FIELD = 'w-56 text-sm px-3 py-1.5 rounded-lg outline-none';

/** The sliders button: how the model answers (Temperature, Max tokens) and where the server is (URL, key). */
export function TuneMenu({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'model' | 'connection'>('model');
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  return (
    <>
      <button type="button" className="composer-icon" onClick={() => { setTab('model'); setOpen(true); }} disabled={disabled} aria-label="Model settings" title="Model settings">
        <Icon name="sliders" size={20} />
      </button>
      {open && (
        <PickerModal tabs={[{ id: 'model', label: 'Model' }, { id: 'connection', label: 'Connection' }]} tab={tab} onTab={setTab} onClose={() => setOpen(false)}>
          <div className="px-5 py-2 set-root">
            {tab === 'model' ? (
              <>
                <SettingRow label="Temperature" description={`${settings.temperature}`}>
                  <input type="range" min="0" max="2" step="0.1" value={settings.temperature} className="w-40"
                    onChange={(e) => update({ temperature: parseFloat(e.target.value) })} />
                </SettingRow>
                <SettingRow label="Max tokens" description={`${settings.maxTokens}`}>
                  <input type="range" min="256" max="32768" step="256" value={settings.maxTokens} className="w-40"
                    onChange={(e) => update({ maxTokens: parseInt(e.target.value) })} />
                </SettingRow>
              </>
            ) : (
              <>
                <SettingRow label="API URL">
                  <input type="text" value={settings.apiUrl} placeholder="http://localhost:8000" className={FIELD}
                    onChange={(e) => update({ apiUrl: e.target.value })} />
                </SettingRow>
                <SettingRow label="API key">
                  <input type="password" value={settings.apiKey} placeholder="PHIBE_API_KEY" autoComplete="off" className={FIELD}
                    onChange={(e) => update({ apiKey: e.target.value })} />
                </SettingRow>
              </>
            )}
          </div>
        </PickerModal>
      )}
    </>
  );
}
