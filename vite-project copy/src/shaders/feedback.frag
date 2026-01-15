uniform sampler2D tPrev;
uniform vec2 uMouse;
uniform vec2 uPrevMouse;
uniform vec2 uResolution;
uniform float uDecay;
uniform float uHueShift;
uniform float uLineWidth;
uniform float uGlow;
uniform float uTime;

varying vec2 vUv;

// Color conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Line distance
float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / (dot(ba, ba) + 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  vec4 prev = texture2D(tPrev, uv);

  // 1. Feedback (decay + hue shift)
  vec3 hsv = rgb2hsv(prev.rgb);
  hsv.x = fract(hsv.x + uHueShift * 0.001);
  vec3 faded = hsv2rgb(hsv) * uDecay;

  // Cutoff small values
  faded = faded - 0.002;
  faded = max(faded, vec3(0.0));

// 2. Mouse drawing (neon line)
vec2 pixelCoord = uv * uResolution;
float dist = lineDist(pixelCoord, uMouse, uPrevMouse);

// 線分の長さを計算
float lineLength = length(uMouse - uPrevMouse);

// Sharp line (core)
float line = smoothstep(uLineWidth, uLineWidth * 0.3, dist);

// Neon glow (1/distance, based on line size)
float glow = uLineWidth / (dist + uLineWidth);
glow = pow(glow, 2.0);

// 線分が短い時はグローを抑える
glow *= smoothstep(0.0, 5.0, lineLength);

// Combine
float intensity = line + glow * 0.3;

  // Neon color
  float hue = fract(uTime * 0.08);
  vec3 neonColor = hsv2rgb(vec3(hue, 1.0, 1.0));

  // Core (whiter near center)
  vec3 coreColor = mix(neonColor, vec3(1.0), smoothstep(0.0, 1.0, intensity * 0.5));

  // Apply glow intensity
  vec3 brushResult = coreColor * intensity * (0.5 + uGlow * 0.3);

  // Additive blend
  vec3 finalColor = faded + brushResult;

  gl_FragColor = vec4(finalColor, 1.0);
}
