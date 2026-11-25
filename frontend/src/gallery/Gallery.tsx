/**
 * A page that shows every animation Phibe has today, using the real components (not copies), so what you see here is what the app does.
 * It is built on its own into one HTML file (see vite.gallery.config.ts) and is not part of the app.
 */
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { PhibeMist, type MistState } from '../components/PhibeMist';
import { PhibeNebula, type NebulaMood } from '../components/PhibeNebula';
import { SkyCanvas } from '../components/SkyCanvas';
import { MEMOIR_SKY, PHIBE_SKY } from '../lib/galaxy';
import { gazeToward } from '../lib/avatar/gaze';
import { idleSeconds, pinIdle } from '../lib/phibeActivity';
import { PHASE_START, WEIGHTS, DURATIONS } from '../lib/phibeIdle';
import { useAppStore } from '../lib/store';
import { VoicePill, type PillMode } from '../voice/VoicePill';
import '../voice/voice.css';
import './gallery.css';

const fakeLevel = () => { const t = Date.now(); return Math.min(1, Math.max(0, 0.45 + 0.5 * Math.sin(t / 170) * Math.abs(Math.sin(t / 650)))); };

/** The eyes follow the cursor anywhere on the page, the way the island does. */
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

function Card({ title, tag, children, text }: { title: string; tag?: string; children: ReactNode; text: string }) {
  return (
    <div className="g-card">
      <h3>{tag && <b>{tag}</b>}{title}</h3>
      {children}
      <p>{text}</p>
    </div>
  );
}

const MOODS: { mood: NebulaMood; title: string; text: string }[] = [
  { mood: 'idle', title: 'Parada', text: 'Respira, balança de leve e os olhos seguem o cursor, com a cabeça inclinando um pouco para o lado em que ela olha.' },
  { mood: 'curious', title: 'Curiosa', text: 'Os olhos ficam mais altos, a cabeça se inclina e a energia sobe: é como ela fica quando o cursor está por perto.' },
  { mood: 'listening', title: 'Ouvindo', text: 'Os olhos ficam altos e atentos, e a matéria em volta é puxada para dentro, em direção aos olhos.' },
  { mood: 'thinking', title: 'Pensando', text: 'Gira mais rápido, olha para cima e para o lado e os olhos pulsam, enquanto a resposta não chega.' },
  { mood: 'speaking', title: 'Falando', text: 'O corpo e a luz acompanham o volume da voz (aqui, uma voz de mentira).' },
  { mood: 'happy', title: 'Feliz', text: 'Os olhos viram meias-luas luminosas, ela cresce um pouco e brilha mais. É o “feito”.' },
  { mood: 'sleepy', title: 'Sonolenta', text: 'Fica pequena e fraca, de olhos fechados, e a névoa quase pára.' },
];

function NebulaCard({ mood, title, text }: { mood: NebulaMood; title: string; text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const gaze = useGaze(box);
  return (
    <Card title={title} tag={mood} text={text}>
      <div className="g-row">
        <div className="g-pill" ref={box}><div className="g-center"><PhibeNebula mood={mood} palette="mint" scale={0.36} id={`s-${mood}`} gaze={gaze} getLevel={fakeLevel} /></div></div>
        <div className="g-stage"><PhibeNebula mood={mood} palette="mint" scale={0.85} id={`b-${mood}`} gaze={gaze} getLevel={fakeLevel} /></div>
      </div>
    </Card>
  );
}

function LifeSection() {
  const [pin, setPin] = useState<number | null>(0);
  const [music, setMusic] = useState(false);
  const setMusicPlaying = useAppStore((s) => s.setMusicPlaying);
  const box = useRef<HTMLDivElement>(null);
  const gaze = useGaze(box);
  const [now, setNow] = useState(0);
  useEffect(() => { pinIdle(pin); const id = setInterval(() => setNow(idleSeconds()), 300); return () => clearInterval(id); }, [pin]);
  useEffect(() => { setMusicPlaying(music); }, [music, setMusicPlaying]);
  const phase = now >= PHASE_START.profundo ? 'Sono profundo' : now >= PHASE_START.dormindo ? 'Dormindo' : now >= PHASE_START.sonolenta ? 'Sonolenta' : now >= PHASE_START.ociosa ? 'Ociosa' : 'Ativa';
  const steps: [string, number][] = [['Ativa (0 s)', 0], ['Ociosa (20 s)', 20], ['Sonolenta (70 s)', 70], ['Dormindo (100 s)', 100], ['Sono profundo (200 s)', 200]];
  return (
    <section>
      <h2>Quando você não está na tela</h2>
      <p className="g-sub">É a vida da Phibe sozinha. Escolha uma fase (o relógio fica fixo nela) ou deixe correr. <b>Acordar</b> mostra como ela acorda: do sono profundo, uma lâmpada que tenta ligar; de um sono leve, só abre os olhos. Com a música ligada, ela também cantarola e dança, sorteados.</p>
      <div className="g-ctl">
        {steps.map(([label, s]) => <button key={s} className={pin === s ? 'on' : ''} onClick={() => setPin(s)}>{label}</button>)}
        <button className="wake" onClick={() => { pinIdle(null); setPin(null); }}>Acordar / deixar correr</button>
        <label><input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} /> tocando música</label>
        <span className="g-phase">Fase agora: <b>{phase}</b> · {Math.round(now)} s</span>
      </div>
      <div className="g-row life">
        <div className="g-pill" ref={box}><div className="g-center"><PhibeNebula mood="idle" palette="mint" scale={0.36} id="life-s" gaze={gaze} life /></div></div>
        <div className="g-stage big"><LifeBig gaze={gaze} /></div>
      </div>
      <table className="g-table"><tbody>
        <tr><th>Fase</th><th>Começa depois de</th><th>O que ela faz</th></tr>
        <tr><td>Ociosa</td><td>{PHASE_START.ociosa} s</td><td>Sorteia: olhar em volta (Natural), soprar bolhas em cacho, seguir a estrela rápida. Com música: cantarolar (notas e olhos de neon) e dançar (oito luminoso e olhos brilhantes).</td></tr>
        <tr><td>Sonolenta</td><td>{PHASE_START.sonolenta} s</td><td>Cabeceando: a cabeça cai, ela dá um tranco e volta.</td></tr>
        <tr><td>Dormindo</td><td>{PHASE_START.dormindo} s</td><td>Bocejo e espreguiçar, e depois se encolhe dormindo.</td></tr>
        <tr><td>Sono profundo</td><td>{PHASE_START.profundo} s</td><td>O corpo vira pó que se solta, com um “Zzzz” subindo.</td></tr>
        <tr><td>Acordando</td><td>ao mexer o mouse, uma tecla ou voltar à aba</td><td>Do sono profundo: a lâmpada T1 (três tentativas, a terceira pega). De um sono leve: abre os olhos com um pulinho.</td></tr>
      </tbody></table>
      <p className="g-sub">Chances do sorteio (sem música / com música): {(Object.keys(WEIGHTS.calm) as (keyof typeof WEIGHTS.calm)[]).map((k) => `${k} ${WEIGHTS.calm[k]}% / ${WEIGHTS.music[k]}%`).join(' · ')}. Duração de cada um: {(Object.keys(DURATIONS) as (keyof typeof DURATIONS)[]).map((k) => `${k} ${DURATIONS[k][0]}–${DURATIONS[k][1]} s`).join(' · ')}.</p>
    </section>
  );
}
function LifeBig({ gaze }: { gaze: MutableRefObject<[number, number]> }) {
  return <PhibeNebula mood="idle" palette="mint" scale={0.95} id="life-b" gaze={gaze} life />;
}

const MIST: { state: MistState; title: string; text: string }[] = [
  { state: 'idle', title: 'Parada', text: 'A bolinha com a névoa ciano e verde respirando e os olhos de sempre.' },
  { state: 'listening', title: 'Ouvindo', text: 'A névoa se concentra e o corpo se inclina para ouvir.' },
  { state: 'thinking', title: 'Pensando', text: 'A névoa gira mais rápido enquanto a resposta vem.' },
  { state: 'speaking', title: 'Falando', text: 'Barrinhas de um medidor de voz sobem em volta do rosto e os olhos brilham com a voz.' },
  { state: 'done', title: 'Feito', text: 'Dá um pulinho duplo de alegria, com o corpo esticando e achatando (a cada 6 s, para você ver).' },
  { state: 'error', title: 'Erro', text: 'Fica quente (laranja) e o corpo se rasga em quatro faixas que escorregam (a cada 6 s).' },
  { state: 'asleep', title: 'Dormindo', text: 'O corpo se desfaz em pontos e números pequenos que se afastam, e se junta de novo ao acordar (alterna a cada 6 s).' },
];
function MistCard({ state, title, text }: { state: MistState; title: string; text: string }) {
  const [on, setOn] = useState(false);
  const cycles = state === 'done' || state === 'error' || state === 'asleep';
  useEffect(() => { if (!cycles) return; const id = setInterval(() => setOn((v) => !v), 3000); return () => clearInterval(id); }, [cycles]);
  const shown: MistState = cycles ? (on ? state : 'idle') : state;
  return (
    <Card title={title} tag={state} text={text}>
      <div className="g-stage"><PhibeMist size={210} state={shown} getLevel={fakeLevel} /></div>
    </Card>
  );
}

const PILLS: { mode: PillMode; title: string; text: string; message?: string }[] = [
  { mode: 'listen', title: 'Ouvindo', text: 'A matriz de pontos acende com a sua voz, com o cronômetro ao lado.' },
  { mode: 'starting', title: 'Ligando o microfone', text: 'Os pontos descansam, respirando, até o microfone começar.' },
  { mode: 'countdown', title: 'Silêncio: contagem', text: 'Os pontos ficam mais fracos e o número mostra os segundos até fechar.' },
  { mode: 'send', title: 'Enviando', text: 'Onda diagonal de luz e o número de Fibonacci rolando (0 a 75025) em odômetro.' },
  { mode: 'sent', title: 'Enviado', text: 'Os pontos se desfazem em poeira para a direita e um visto é desenhado.' },
  { mode: 'speak', title: 'Phibe falando', text: 'Uma onda de pontos que acompanha a voz dela, e faíscas.' },
  { mode: 'error', title: 'Problema', text: 'Um “!” com a mensagem do que deu errado.', message: 'Não foi possível iniciar o microfone.' },
];
function PillCard({ mode, title, text, message }: (typeof PILLS)[number]) {
  const [k, setK] = useState(0);
  useEffect(() => { if (mode !== 'sent') return; const id = setInterval(() => setK((v) => v + 1), 4500); return () => clearInterval(id); }, [mode]);
  return (
    <Card title={title} tag={mode} text={text}>
      <div className="g-pillbox"><VoicePill key={k} mode={mode} getLevel={fakeLevel} countdownSecs={5} message={message} /></div>
    </Card>
  );
}

function SkyBox({ children, label, text, cls }: { children: ReactNode; label: string; text: string; cls: string }) {
  return (
    <Card title={label} text={text}>
      <div className={`g-sky ${cls}`}>{children}</div>
    </Card>
  );
}

export function Gallery() {
  return (
    <main className="g-wrap">
      <h1>Todas as animações da Phibe, hoje</h1>
      <p className="g-lead">Esta página usa os <b>componentes reais</b> do app, então o que você vê aqui é o que o app faz. Mexa o mouse pela página: os olhos das nebulosas seguem o cursor. Quando a animação depende de um evento (ouvir, falar, acordar), ela é mostrada em repetição ou com um botão.</p>

      <section>
        <h2>A Phibe da ilha e do Memoir (nebulosa com olhos)</h2>
        <p className="g-sub">À esquerda, no tamanho real da ilha (216 × 76); à direita, ampliada. Os olhos seguem o cursor e, ao virar, o rosto inclina um pouco. Em todas, de tempos em tempos ela respira fundo: incha um pouco e a luz sobe.</p>
        <div className="g-grid">{MOODS.map((m) => <NebulaCard key={m.mood} {...m} />)}</div>
        <div className="g-grid" style={{ marginTop: 14 }}>
          <Card title="Botão do Memoir" tag="cosmic" text="O mesmo orbe nas cores do Memoir (ciano, violeta e rosa). Aqui, sozinho, segue o cursor pela página.">
            <div className="g-stage"><PhibeNebula palette="cosmic" scale={0.85} id="memoir-b" /></div>
          </Card>
          <Card title="Estouro de estrelas" tag="burst" text="Ao trocar de tela (ou clicar), ela pula e solta uma nuvem de estrelinhas. Clique no botão para ver.">
            <BurstDemo />
          </Card>
        </div>
      </section>

      <LifeSection />

      <section>
        <h2>O indicador de voz</h2>
        <p className="g-sub">A pílula que aparece quando você fala com a Phibe. Dá para arrastá-la (aqui também); o duplo clique devolve ao lugar.</p>
        <div className="g-grid">{PILLS.map((p) => <PillCard key={p.mode} {...p} />)}</div>
      </section>

      <section>
        <h2>O avatar em bolinha</h2>
        <p className="g-sub">É o orbe usado no botão flutuante, na bolha do chat e na janela de voz.</p>
        <div className="g-grid">{MIST.map((m) => <MistCard key={m.state} {...m} />)}</div>
      </section>

      <section>
        <h2>Os céus</h2>
        <p className="g-sub">Um só motor, com as cores de cada tela: estrelas em profundidades diferentes que derivam para baixo e para a esquerda e piscam, e um cometa de vez em quando (a cada 30 a 45 s na tela inicial; a cada 5 a 11 s no Memoir).</p>
        <div className="g-grid">
          <SkyBox label="Tela inicial" cls="home" text="Névoa verde e roxa de fundo; estrelas brancas, azuis-claras, verdes e poucas violetas.">
            <SkyCanvas palette={PHIBE_SKY} cometEvery={[30, 45]} className="g-skycv" />
          </SkyBox>
          <SkyBox label="Memoir" cls="memoir" text="Nebulosas violeta e rosa; estrelas brancas, azuis-claras, violetas e rosas.">
            <SkyCanvas palette={MEMOIR_SKY} cometEvery={[5, 11]} seed={11} className="g-skycv" />
          </SkyBox>
        </div>
      </section>
    </main>
  );
}

function BurstDemo() {
  const [k, setK] = useState(0);
  return (
    <div className="g-stage">
      <PhibeNebula palette="mint" scale={0.85} id="burst" burstKey={k} mood="idle" />
      <button className="g-btn" onClick={() => setK((v) => v + 1)}>Estourar estrelas</button>
    </div>
  );
}
