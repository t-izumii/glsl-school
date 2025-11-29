precision mediump float;

uniform sampler2D textureUnit0;
uniform sampler2D textureUnit1;
uniform sampler2D textureUnit2;
uniform float ratio;

varying vec2 vTexCoord;

void main() {
  // テクスチャからそれぞれサンプリング（抽出）する @@@
  vec4 samplerColor0 = texture2D(textureUnit0, vTexCoord);
  vec4 samplerColor1 = texture2D(textureUnit1, vTexCoord);
  vec4 monochromeColor = texture2D(textureUnit2, vTexCoord);

  // モノクロテクスチャを考慮して変化の割合いを決める @@@
  float r = clamp(monochromeColor.r + ratio * 2.0 - 1.0, 0.0, 1.0);

  vec4 outColor = mix(samplerColor0, samplerColor1, r);
  gl_FragColor = outColor;
}
