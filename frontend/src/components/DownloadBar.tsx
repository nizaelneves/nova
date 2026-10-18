import { labelOf, percentOf, sizeText, type PullProgress } from '../lib/pulls';

/** A model download: label and percent on top, a green bar with a glowing knob, then size, speed and Cancel. */
export function DownloadBar({ model, progress, speed, onCancel }: { model: string; progress: PullProgress; speed: number; onCancel: () => void }) {
  const percent = percentOf(progress);
  const left = progress.total && speed > 0 ? Math.max(0, progress.total - progress.completed) / speed : 0;
  return (
    <div className="dl" role="progressbar" aria-label={`Downloading ${model}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="dl-head">
        <span className="dl-label"><i className="dl-spin" aria-hidden="true" />{labelOf(progress)}</span>
        <b className="dl-pct">{percent}<small>%</small></b>
      </div>
      <div className="dl-track">
        <div className="dl-fill" style={{ width: `${Math.max(percent, 3)}%` }} />
        <span className="dl-knob" style={{ left: `${Math.max(percent, 3)}%` }} aria-hidden="true" />
      </div>
      <div className="dl-foot">
        <span>
          {progress.total ? `${sizeText(progress.completed)} of ${sizeText(progress.total)}` : 'Waiting for Ollama…'}
          {speed > 0 && ` · ${sizeText(speed)}/s`}
          {left > 1 && ` · ${left >= 90 ? `${Math.round(left / 60)} min` : `${Math.round(left)} s`} left`}
        </span>
        <button type="button" className="dl-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
