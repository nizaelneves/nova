import { useAppStore } from '../lib/store';
import { PHIBE_SKY, type EffectsQuality } from '../lib/galaxy';
import { SkyCanvas } from './SkyCanvas';

const COMET_EVERY: [number, number] = [30, 45]; // a rare surprise

/** The home-screen sky: Phibe's green sky over the still haze painted by CSS (see .galaxy). */
export function Galaxy({ dim = false }: { dim?: boolean }) {
  const quality: EffectsQuality = useAppStore((s) => s.settings.effects);
  return (
    <div className="galaxy" data-quality={quality} data-dim={dim} aria-hidden="true">
      <SkyCanvas palette={PHIBE_SKY} cometEvery={COMET_EVERY} className="galaxy-stars" />
    </div>
  );
}
