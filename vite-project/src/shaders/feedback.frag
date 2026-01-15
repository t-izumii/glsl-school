uniform sampler2D tPrev;
uniform vec2 uMouse;
uniform vec2 uPrevMouse;
uniform float uActive;
uniform vec2 uResolution;
uniform float uDecay;
uniform float uHueShift;
uniform float uLineWidth;
uniform float uGlow;
uniform float uTime;

varying vec2 vUv;

// 色空間変換
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

// 線分までの距離計算
float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / (dot(ba, ba) + 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  vec4 prev = texture2D(tPrev, uv);

  // 1. フィードバック（減衰 + 色相シフト）
  vec3 hsv = rgb2hsv(prev.rgb);
  hsv.x = fract(hsv.x + uHueShift * 0.001);
  vec3 faded = hsv2rgb(hsv) * uDecay;

  // 微小値をカット
  faded = faded - 0.002;
  faded = max(faded, vec3(0.0));

  // 2. マウス描画（ネオンライン）
  // 正規化座標を使用（-1〜1の範囲）
  vec2 normalizedCoord = uv * 2.0 - 1.0;

  // アスペクト比を考慮
  float aspect = uResolution.x / uResolution.y;
  normalizedCoord.x *= aspect;
  vec2 mousePos = uMouse;
  mousePos.x *= aspect;
  vec2 prevMousePos = uPrevMouse;
  prevMousePos.x *= aspect;

  float dist = lineDist(normalizedCoord, mousePos, prevMousePos);

  // 線分の長さを計算
  float lineLength = length(mousePos - prevMousePos);

  // 正規化座標用のライン幅（0.001〜0.1程度が適切）
  float normalizedLineWidth = uLineWidth * 0.001;

  // 鋭い線（コア）
  float line = smoothstep(normalizedLineWidth, normalizedLineWidth * 0.3, dist);

  // ネオングロー（1/距離、線のサイズベース）
  float glow = normalizedLineWidth / (dist + normalizedLineWidth);
  glow = pow(glow, 2.2);

  // 線分が短い時はグローを抑える
  glow *= smoothstep(0.0, 0.01, lineLength);

  // 合成
  float intensity = line + glow * 0.3;

  // ネオンカラー
  float hue = fract(uTime * 0.08);
  vec3 neonColor = hsv2rgb(vec3(hue, 1.0, 1.0));

  // コア（中心付近は白っぽく）
  vec3 coreColor = mix(neonColor, vec3(1.0), smoothstep(0.0, 1.0, intensity * 0.5));

  // グロー強度を適用
  vec3 brushResult = coreColor * intensity * (0.5 + uGlow * 0.3);

  // uActiveが0の時は描画しない
  brushResult *= uActive;

  // 加算合成
  vec3 finalColor = faded + brushResult;

  gl_FragColor = vec4(finalColor, 1.0);
}
