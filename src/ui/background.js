// Balatro-style swirling paint background, recoloured as rotting ectoplasm.
// Rendered at low resolution and scaled up with pixelated sampling.

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform float uPulse;

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(uv);
  float a = atan(uv.y, uv.x);
  // Swirl: rotate more towards the centre, slowly over time.
  a += 1.8 / (r + 0.35) + uTime * 0.05;
  vec2 p = vec2(cos(a), sin(a)) * r * 3.0;
  for (int i = 0; i < 4; i++) {
    p += vec2(sin(p.y * 1.3 + uTime * 0.21), cos(p.x * 1.1 - uTime * 0.17)) * 0.55;
  }
  float v = 0.5 + 0.5 * sin(p.x + p.y);
  float w = 0.5 + 0.5 * sin(length(p) * 1.4 - uTime * 0.3);

  vec3 purple = vec3(0.09, 0.025, 0.12);
  vec3 green  = vec3(0.04, 0.16, 0.08);
  vec3 blood  = vec3(0.25, 0.02, 0.02);
  vec3 col = mix(purple, green, smoothstep(0.35, 0.85, v));
  col = mix(col, blood, smoothstep(0.7, 1.0, w) * 0.7);
  col *= 1.0 - smoothstep(0.4, 1.3, r);           // vignette
  col *= 0.85 + 0.15 * uPulse;
  // Quantise to a few levels for the chunky paint look.
  col = floor(col * 28.0) / 28.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';

export function startBackground(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return { pulse() {} };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return { pulse() {} };
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uPulse = gl.getUniformLocation(prog, 'uPulse');

  const scale = 5;
  const resize = () => {
    canvas.width = Math.ceil(window.innerWidth / scale);
    canvas.height = Math.ceil(window.innerHeight / scale);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  window.addEventListener('resize', resize);

  let pulse = 0;
  const start = performance.now();
  const frame = (now) => {
    const t = (now - start) / 1000;
    pulse *= 0.94;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, reduceMotion ? 0 : t);
    gl.uniform1f(uPulse, 1 + pulse);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!reduceMotion) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    /** Brighten the swirl for a moment (big moves). */
    pulse(amount = 1) {
      pulse = Math.min(3, pulse + amount);
    },
  };
}
