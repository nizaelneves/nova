import { useEffect, useRef } from 'react';

/**
 * "Nucleus" — a raymarched volumetric glow, rendered with a raw WebGL
 * fragment shader (no three.js / no extra dependency).
 *
 * The technique (fractal folding of a direction vector via cosine +
 * sine-turbulence, accumulated into a glow as the ray steps forward) is
 * XorDev's public "shader golf" piece, posted in full as plain GLSL in
 * https://x.com/XorDev/status/1948016291413217752 — this is a from-scratch,
 * unminified reimplementation of that published formula (the 21st.dev page
 * that showcases it keeps its own React wrapper source locked behind a
 * paid unlock; nothing from that page was read or copied here).
 *
 * Recolored to the app's own accent instead of the original's green/blue
 * weighting: the raw (3,8,z)-weighted accumulation is collapsed to a single
 * brightness field, then tinted with `--color-accent`.
 */

const VERTEX_SRC = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Expansion of the public "Nucleus" formula, plus a domain twist so the
// fractal drifts between a compact orb and a spiraling, tornado-like
// vortex — the twist amount is driven by a slow, irregular (two
// mismatched sine waves) phase instead of a fixed constant.
const FRAGMENT_SRC = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  vec3 res = vec3(uResolution.xy, uResolution.y);
  vec3 rayDir = normalize(vec3(fragCoord, 0.0) * 2.0 - res.xyy);

  // Two out-of-sync, slow sine waves so the orb<->tornado swing never
  // quite repeats — some passes barely twist, others spin up hard.
  float wobble = sin(uTime * 0.17) * 0.5 + sin(uTime * 0.11 + 1.7) * 0.35 + 0.5;
  float twist = pow(clamp(wobble, 0.0, 1.0), 2.4) * 5.0;

  vec4 accum = vec4(0.0);
  float z = 0.0;
  float d = 0.0;

  for (int i = 0; i < 100; i++) {
    vec3 p = z * rayDir;
    vec3 a = normalize(cos(vec3(4.0, 2.0, 0.0) + uTime - d / 0.1));
    p.z += 8.0;

    // Vortex twist: rotate xy by an angle that grows with depth, pinch the
    // radius and stretch along z — together these turn the outer silhouette
    // itself from a round orb into an elongated, spiraling funnel, not just
    // a swirl painted on a sphere's surface.
    float angle = twist * p.z * 0.3;
    float s = sin(angle), c = cos(angle);
    p.xy = mat2(c, -s, s, c) * p.xy * (1.0 - 0.35 * twist);
    p.z *= 1.0 + 0.45 * twist;

    a = a * dot(a, p) - cross(a, p);

    // Four rounds of sine turbulence fold the direction vector into the
    // fractal shape XorDev's formula traces.
    d = 1.0;
    for (int j = 0; j < 4; j++) {
      d += 1.0;
      a += sin(a * d + uTime).yzx / d;
    }

    d = abs(length(a) - 5.0) / 6.0;
    z += d;

    accum += vec4(3.0, 8.0, z, 0.0) / d / 9e4;
  }

  // Collapse the original's per-channel weighting to one brightness field,
  // then tint it with the app's own accent color instead of green/cyan.
  float energy = (accum.r + accum.g + accum.b) / 3.0 * uIntensity;
  vec3 color = energy * uColor;

  // This raymarch never truly reaches "empty" — brightness alone never
  // quite hits zero anywhere, even at the canvas corners. Squaring it makes
  // dim areas fade out far faster than bright ones, which is enough on its
  // own to reach true transparency well before the corners — no separate
  // radial mask, so there's only one fade curve and no seam between it and
  // the fractal's own natural falloff (a second, independent curve is what
  // was reading as a visible ring earlier).
  float brightness = max(max(color.r, color.g), color.b);
  float alpha = clamp(brightness * 3.0, 0.0, 1.0);
  alpha *= alpha;

  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Parses a `#rrggbb` (or `#rgb`) CSS color into 0..1 floats. Falls back to white. */
function parseColor(css: string): [number, number, number] {
  const hex = css.trim();
  const m6 = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m6) {
    const n = parseInt(m6[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const m3 = /^#([0-9a-f]{3})$/i.exec(hex);
  if (m3) {
    const [r, g, b] = m3[1].split('').map((c) => parseInt(c + c, 16) / 255);
    return [r, g, b];
  }
  const mRgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(hex);
  if (mRgb) {
    return [Number(mRgb[1]) / 255, Number(mRgb[2]) / 255, Number(mRgb[3]) / 255];
  }
  return [1, 1, 1];
}

// Physical pixels are capped — this is a 100x4-step raymarch per pixel, so
// resolution matters far more than most effects for frame time. A full-bleed
// (fill-the-background) version was tried and reverted: at that resolution
// this shader was heavy enough to visibly stall on modest GPUs.
const MAX_SIZE = 620;
const MAX_DPR = 1.5;

export function ShaderOrb({ size = 260 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const contextAttrs: WebGLContextAttributes = { alpha: true, premultipliedAlpha: false };
    const gl = (canvas.getContext('webgl', contextAttrs) ||
      canvas.getContext('experimental-webgl', contextAttrs)) as WebGLRenderingContext | null;
    if (!gl) return; // No WebGL available — the caller falls back to nothing rendered.

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    if (!vertexShader || !fragmentShader || !program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // A single fullscreen triangle (cheaper than a quad, same result).
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');
    const uColor = gl.getUniformLocation(program, 'uColor');

    let color = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--color-accent'));
    const themeObserver = new MutationObserver(() => {
      color = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--color-accent'));
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const cssSize = Math.min(Math.round(canvas.getBoundingClientRect().width || size), MAX_SIZE);
      const physical = Math.round(cssSize * dpr);
      if (canvas.width !== physical || canvas.height !== physical) {
        canvas.width = physical;
        canvas.height = physical;
        gl.viewport(0, 0, physical, physical);
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let raf = 0;
    const start = performance.now();

    const draw = (t: number) => {
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, (t - start) / 1000);
      gl.uniform1f(uIntensity, 1.0);
      gl.uniform3f(uColor, color[0], color[1], color[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    if (reduceMotion) {
      draw(start);
    } else {
      const tick = (t: number) => {
        if (!document.hidden) draw(t);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeObserver.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(buffer);
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        width: `min(${size}px, 82vw, 60vh)`,
        aspectRatio: '1 / 1',
        display: 'block',
      }}
    />
  );
}
