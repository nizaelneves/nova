import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AreaSpace } from '../components/seeds/AreaSpace';
import { SEED_AREAS, type SeedArea } from '../components/seeds/areas';
import { OrbitHub } from '../components/seeds/OrbitHub';
import { WarpTransition } from '../components/seeds/WarpTransition';
import '../components/seeds/seeds.css';

/** Seeds: the swipe file. An orbit of areas, and a warp into the one you pick. */
export function SeedsPage() {
  const navigate = useNavigate();
  const [area, setArea] = useState<SeedArea | null>(null);
  const [warp, setWarp] = useState<{ color: string; reverse: boolean } | null>(null);
  const next = useRef<SeedArea | null>(null);

  const go = (to: SeedArea | null) => {
    if (warp) return;
    next.current = to;
    setWarp({ color: (to ?? area)?.color ?? '#20e7aa', reverse: to === null });
  };

  return (
    <div className="seeds-hub">
      {!area && <OrbitHub areas={SEED_AREAS} onEnter={go} />}
      {area && <AreaSpace area={area} onOrbit={() => go(null)} onLeave={() => navigate('/')} />}
      {warp && (
        <WarpTransition color={warp.color} reverse={warp.reverse}
          onSwap={() => setArea(next.current)} onDone={() => setWarp(null)} />
      )}
    </div>
  );
}
