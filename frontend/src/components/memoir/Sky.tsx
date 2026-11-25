import { MEMOIR_SKY } from '../../lib/galaxy';
import { SkyCanvas } from '../SkyCanvas';

const COMET_EVERY: [number, number] = [5, 11]; // Memoir's sky has always been livelier: a shooting star every few seconds

/** The living sky behind Memoir: the same engine as Phibe's home sky, in Memoir's cyan, violet and pink. */
export function Sky() {
  return <SkyCanvas palette={MEMOIR_SKY} cometEvery={COMET_EVERY} seed={11} className="mm-sky" />;
}
