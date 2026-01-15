uniform sampler2D tDiffuse;
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 color = texture2D(tDiffuse, uv).rgb;

  // 強化ブルーム効果（ネオン用）
  vec3 bloom = vec3(0.0);

  // 多段階ブラー
  float blurSizes[3];
  blurSizes[0] = 2.0 / uResolution.x;
  blurSizes[1] = 5.0 / uResolution.x;
  blurSizes[2] = 10.0 / uResolution.x;

  float weights[3];
  weights[0] = 0.4;
  weights[1] = 0.3;
  weights[2] = 0.2;

  for (int b = 0; b < 3; b++) {
    vec3 layerBloom = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float angle = float(i) * 0.5236; // PI/6
      vec2 offset = vec2(cos(angle), sin(angle)) * blurSizes[b];
      layerBloom += texture2D(tDiffuse, uv + offset).rgb;
    }
    bloom += (layerBloom / 12.0) * weights[b];
  }

  // ブルームを加算（ネオンの光のにじみ）
  color += bloom * 0.3;

  // トーンマッピング（HDR→SDR）
  // Reinhardトーンマッピング
  color = color / (color + vec3(1.0));

  // コントラスト強調
  color = pow(color, vec3(0.99));

  // 彩度ブースト（ネオンらしさ）
  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(gray), color, 1.3);

  // ビネット
  float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5) * 1.5);
  color *= vignette;

  // ガンマ補正
  color = pow(color, vec3(1.0 / 2.2));

  gl_FragColor = vec4(color, 1.0);
}
