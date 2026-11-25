/** A page to choose how sharp and calm the real orb is drawn: the same component as the app, with the NebulaTune knobs. Not part of the app. */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { PhibeNebula, NEBULA_TUNE, type NebulaMood, type NebulaTune } from '../components/PhibeNebula';
import { gazeToward } from '../lib/avatar/gaze';
import './gallery.css';

const PRESETS: { id: string; title: string; text: string; tune: NebulaTune }[] = [
  { id: 'P0', title: 'Atual', text: 'Como ela está hoje.', tune: {} },
  { id: 'P1', title: 'Estrelas por trás', text: 'Parte das estrelas passa por trás da massa escura, que as esconde: o contorno aparece. Sobre o rosto, fica limpo.', tune: { behind: 0.55, faceClear: 0.7 } },
  { id: 'P2', title: 'Menos estrelas', text: 'Só reduz a quantidade de estrelas e de faíscas. Nada mais muda.', tune: { motes: 52, dustRate: 0.6 } },
  { id: 'P3', title: 'Estrelas mais calmas', text: 'As mesmas estrelas, mais fracas e girando mais devagar.', tune: { moteAlpha: 0.65, dustAlpha: 0.6, spin: 0.75 } },
  { id: 'P4', title: 'Névoa mais suave', text: 'A luz colorida de dentro e das emendas fica mais fraca, e o escuro se destaca.', tune: { energy: 0.75, seams: 0.55 } },
  { id: 'P5', title: 'Corpo definido e olhos', text: 'Olhos um pouco maiores e o rosto livre de estrelas.', tune: { eyeK: 1.12, faceClear: 1 } },
  { id: 'P6', title: 'Equilíbrio', text: 'Um pouco de cada: estrelas por trás, menos e mais calmas, névoa suave.', tune: { behind: 0.5, faceClear: 0.7, motes: 60, moteAlpha: 0.8, dustRate: 0.6, dustAlpha: 0.75, energy: 0.85, seams: 0.7, eyeK: 1.1, spin: 0.85 } },
  { id: 'P7', title: 'Equilíbrio mais leve', text: 'O equilíbrio, com menos vivacidade ainda.', tune: { behind: 0.6, faceClear: 0.85, motes: 44, moteAlpha: 0.7, dustRate: 0.45, dustAlpha: 0.6, energy: 0.72, seams: 0.5, eyeK: 1.14, spin: 0.75 } },
  { id: 'P8', title: 'Bem limpa', text: 'O mais nítido: poucas estrelas, a maioria atrás, névoa discreta. Ainda tem tudo, só que baixinho.', tune: { behind: 0.7, faceClear: 1, motes: 30, moteAlpha: 0.6, dustRate: 0.3, dustAlpha: 0.5, energy: 0.6, seams: 0.35, eyeK: 1.16, spin: 0.7 } },
  { id: 'P9', title: 'P3 refinada', text: 'A P3 com menos estrelas, brilho e névoa mais baixos, rosto livre e corpo redondo, quase um orb, olhos com menos brilho (parte das estrelas passa por trás).', tune: { motes: 50, moteAlpha: 0.55, dustRate: 0.5, dustAlpha: 0.5, spin: 0.75, energy: 0.7, seams: 0.45, behind: 0.5, faceClear: 1, bodyAlpha: 1.1, round: 0.85, eyeGlow: 0.6, eyeK: 1.08 } },
  { id: 'P10', title: 'P3 refinada, mais suave', text: 'Igual à P9, ainda mais calma: menos estrelas, névoa e brilho mais baixos.', tune: { motes: 38, moteAlpha: 0.48, dustRate: 0.38, dustAlpha: 0.42, spin: 0.7, energy: 0.58, seams: 0.35, behind: 0.6, faceClear: 1, bodyAlpha: 1.15, round: 0.95, eyeGlow: 0.5, eyeK: 1.1 } },
  { id: 'P11', title: 'P3 refinada, corpo marcado', text: 'Como a P9, mas com o corpo escuro bem marcado, quase um disco, e mais estrelas escondidas atrás dele.', tune: { motes: 46, moteAlpha: 0.55, dustRate: 0.45, dustAlpha: 0.5, spin: 0.75, energy: 0.62, seams: 0.4, behind: 0.75, faceClear: 1, bodyAlpha: 1.2, round: 1, eyeGlow: 0.4, eyeK: 1.1 } },
];

const MOODS: NebulaMood[] = ['idle', 'curious', 'listening', 'thinking', 'speaking', 'happy'];

/** The eyes follow the cursor anywhere on the page. */
function useGaze(box: MutableRefObject<HTMLElement | null>): MutableRefObject<[number, number]> {
  const gaze = useRef<[number, number]>([0, 0]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r) gaze.current = gazeToward(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [box]);
  return gaze;
}

function Orbs({ tune, mood, id }: { tune: NebulaTune; mood: NebulaMood; id: string }) {
  const box = useRef<HTMLDivElement>(null);
  const gaze = useGaze(box);
  return (
    <div className="g-row" ref={box}>
      <div className="g-pill"><div className="g-center"><PhibeNebula mood={mood} palette="mint" scale={0.36} id={`${id}-m`} gaze={gaze} tune={{ ...NEBULA_TUNE, ...tune }} /></div></div>
      <div className="g-stage"><PhibeNebula mood={mood} palette="cosmic" scale={0.8} id={`${id}-c`} gaze={gaze} tune={{ ...NEBULA_TUNE, ...tune }} /></div>
    </div>
  );
}

const SLIDERS: { k: keyof NebulaTune; label: string; min: number; max: number; step: number }[] = [
  { k: 'motes', label: 'Quantidade de estrelas', min: 0, max: 90, step: 1 },
  { k: 'moteAlpha', label: 'Brilho das estrelas', min: 0, max: 1.2, step: 0.05 },
  { k: 'dustRate', label: 'Faíscas', min: 0, max: 1, step: 0.05 },
  { k: 'energy', label: 'Luz de dentro', min: 0.2, max: 1.2, step: 0.05 },
  { k: 'seams', label: 'Luz nas emendas', min: 0, max: 1.2, step: 0.05 },
  { k: 'behind', label: 'Estrelas por trás da massa', min: 0, max: 1, step: 0.05 },
  { k: 'faceClear', label: 'Rosto livre', min: 0, max: 1, step: 0.05 },
  { k: 'round', label: 'Corpo redondo e firme', min: 0, max: 1, step: 0.05 },
  { k: 'eyeGlow', label: 'Brilho dos olhos', min: 0.2, max: 1.2, step: 0.05 },
  { k: 'eyeK', label: 'Tamanho dos olhos', min: 0.9, max: 1.3, step: 0.02 },
  { k: 'spin', label: 'Velocidade', min: 0.3, max: 1.2, step: 0.05 },
];

export function Refine() {
  const [mood, setMood] = useState<NebulaMood>('idle');
  const [mine, setMine] = useState<NebulaTune>({ ...PRESETS.find((p) => p.id === 'P10')!.tune });
  const shown = { ...NEBULA_TUNE, ...mine };
  return (
    <div className="g-wrap">
      <h1>Refinar a Phibe</h1>
      <p className="g-lead">A mesma Phibe de hoje (componente real), com a névoa, as estrelas e a matéria escura. Cada opção só tira ou afasta alguma coisa. Mexa o cursor para ela olhar. Cada cartão mostra a ilha (verde) e a grande (Memoir).</p>
      <div className="g-ctl">
        {MOODS.map((m) => <button key={m} className={m === mood ? 'on' : ''} onClick={() => setMood(m)}>{m}</button>)}
      </div>
      <div className="g-grid">
        <div className="g-card">
          <h3><b>MEU</b>Meu ajuste</h3>
          <Orbs tune={mine} mood={mood} id="mine" />
          <div style={{ display: 'grid', gap: 6 }}>
            {SLIDERS.map((s) => (
              <label key={s.k} className="g-ctl" style={{ margin: 0, justifyContent: 'space-between' }}>
                <span>{s.label} <b>{Number(shown[s.k]).toFixed(2).replace(/\.?0+$/, '')}</b></span>
                <input type="range" min={s.min} max={s.max} step={s.step} value={shown[s.k]} onChange={(e) => setMine({ ...mine, [s.k]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <div className="g-ctl" style={{ margin: 0 }}>
            <button onClick={() => setMine({ ...PRESETS.find((p) => p.id === 'P10')!.tune })}>Voltar à P10</button>
            <button onClick={() => { try { void navigator.clipboard.writeText(JSON.stringify(shown)); } catch { /* the box below can be copied by hand */ } }}>Copiar valores</button>
          </div>
          <code style={{ fontSize: 12, color: '#8b98a5', wordBreak: 'break-all' }}>{JSON.stringify(shown)}</code>
          <p>Quando achar o ponto, copie os valores (ou cole o texto acima) e me mande.</p>
        </div>
        {PRESETS.map((p) => (
          <div className="g-card" key={p.id}>
            <h3><b>{p.id}</b>{p.title}</h3>
            <Orbs tune={p.tune} mood={mood} id={p.id} />
            <p>{p.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
