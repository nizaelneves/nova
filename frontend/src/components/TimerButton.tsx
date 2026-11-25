import { useState } from 'react';
import { clock, timer, useTimer } from '../lib/timer';
import { Icon } from './Icon';
import { PickerModal, PickerRow } from './PickerModal';

const MINUTES = [15, 25, 45, 50, 90];

/** The island's Timer button: it sits beside the microphone and opens the same kind of pop-up as the model list, to start the timer and pick its length. */
export function TimerButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'timer' | 'length'>('timer');
  const t = useTimer();
  return (
    <>
      <button
        type="button"
        className="composer-icon"
                aria-label="Timer"
        data-glow={t.running}
        data-tip={t.running ? `Timer · ${clock(t.remaining)}` : 'Timer'}
        onClick={() => setOpen(true)}
      >
        <Icon name="tabler-stopwatch" size={18} />
      </button>
      {open && (
        <PickerModal tabs={[{ id: 'timer', label: 'Timer' }, { id: 'length', label: 'Length' }]} tab={tab} onTab={setTab} onClose={() => setOpen(false)}>
          {tab === 'timer' ? (
            <>
              <div className="flex justify-center pt-2 pb-3">
                <span className="text-4xl font-semibold" style={{ fontFamily: 'var(--term-font)', color: 'var(--color-text)' }}>{clock(t.remaining)}</span>
              </div>
              <PickerRow icon={<Icon name={t.running ? 'pause-circle' : 'play-circle'} size={18} />} title={t.running ? 'Pause' : 'Start'} active={t.running} onClick={t.running ? timer.pause : timer.start} />
              <PickerRow icon={<Icon name="refresh" size={18} />} title="Reset" onClick={timer.reset} />
            </>
          ) : (
            MINUTES.map((m) => (
              <PickerRow key={m} icon={<Icon name="clock-circle" size={18} />} title={`${m} minutes`} active={m === t.minutes} onClick={() => timer.setMinutes(m)} />
            ))
          )}
        </PickerModal>
      )}
    </>
  );
}
