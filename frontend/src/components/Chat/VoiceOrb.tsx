/**
 * Soft, blurred glowing orb — replaces the static brand mark on the home
 * screen. It breathes continuously and pulses harder (like sound waves)
 * while `speaking` is true (driven by the agent actively generating a
 * response).
 */
export function VoiceOrb({ speaking = false, size = 200 }: { speaking?: boolean; size?: number }) {
  return (
    <div
      className={`jarvis-orb${speaking ? ' is-speaking' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="jarvis-orb-halo" />
      <span className="jarvis-orb-lobe jarvis-orb-lobe-a" />
      <span className="jarvis-orb-lobe jarvis-orb-lobe-b" />
      <span className="jarvis-orb-core" />
      {speaking && (
        <>
          <span className="jarvis-orb-ring" style={{ animationDelay: '0ms' }} />
          <span className="jarvis-orb-ring" style={{ animationDelay: '500ms' }} />
          <span className="jarvis-orb-ring" style={{ animationDelay: '1000ms' }} />
        </>
      )}
    </div>
  );
}
