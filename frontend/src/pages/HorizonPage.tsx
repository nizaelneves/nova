import { Horizon } from '../horizon/Horizon';
import { SyncButton } from '../components/SyncButton';
import { VoiceVisualizer } from '../components/VoiceVisualizer';

/** Horizon: the home screen. The widgets sit behind the buttons at the top right; Phibe's voice bars and the Sync button are where they have always been. */
export function HorizonPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <VoiceVisualizer />
      </div>
      <Horizon />
      <div className="px-4 pb-4 pt-3">
        <SyncButton />
      </div>
    </div>
  );
}
