precision mediump float;

uniform vec2 uResolution;
uniform vec2 uTextureSize;
uniform sampler2D uTexture;
uniform sampler2D uAsciiMap;
uniform float uAsciiColorStep;
uniform float uTileSize;
uniform float uTileStrength;
uniform int uBioMode;

varying vec2 vUv;

void main() {
  // タイルのサイズを計算
  vec2 tileCount = floor(uResolution / uTileSize);
  vec2 tileUv = fract(vUv * tileCount);
  vec2 tileId = floor(vUv * tileCount);

  // タイルの中心座標
  vec2 tileCenter = (tileId + 0.5) / tileCount;

  // 元のテクスチャから色をサンプリング
  vec4 texColor = texture2D(uTexture, tileCenter);

  // 輝度を計算（グレースケール変換）
  float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));

  // ASCII文字のインデックスを輝度から決定
  float charIndex = floor(luminance * 10.0) / 10.0;

  // ASCII文字マップからサンプリング
  vec2 asciiUv = vec2(charIndex, 0.5);
  asciiUv.x += tileUv.x / 10.0; // 10文字分のマップを想定

  vec4 asciiChar = texture2D(uAsciiMap, asciiUv);

  // タイルの強度調整（文字の見え方）
  float charBrightness = asciiChar.r * uTileStrength;

  // 色をステップ化
  vec3 steppedColor = floor(texColor.rgb / uAsciiColorStep) * uAsciiColorStep;

  // Bio Modeの場合は緑系の色に
  if (uBioMode == 1) {
    steppedColor = vec3(0.0, steppedColor.g, 0.0);
  }

  // 最終的な色を計算
  vec3 finalColor = steppedColor * charBrightness;

  gl_FragColor = vec4(finalColor, 1.0);
}
