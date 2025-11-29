precision mediump float;

uniform sampler2D textureUnit0; // ビデオテクスチャ1
uniform sampler2D textureUnit1; // ビデオテクスチャ2
uniform sampler2D textureUnit2; // マスクテクスチャ
uniform float ratio;
uniform float threshold; // マスクの閾値
uniform float gap;       // ギャップ（0.0〜1.0）

varying vec2 vTexCoord;
varying float vBrightness;
varying float vCellSize;

void main() {
  // マスクの明度で表示/非表示を判定
  if (vBrightness > threshold) {
    discard;
  }
  
  // ギャップ処理：ポイントの端をカット
  vec2 edgeDist = abs(gl_PointCoord - vec2(0.5)) * 2.0;
  float edge = max(edgeDist.x, edgeDist.y);
  
  // gapより外側は描画しない
  float innerSize = 1.0 - gap;
  if (edge > innerSize) {
    discard;
  }
  
  // gl_PointCoordを使って、このポイント内でのビデオUVを計算
  vec2 cellUV = vTexCoord + (gl_PointCoord - vec2(0.0, 1.0)) * vec2(1.0, -1.0) * vCellSize;
  
  // ビデオをサンプリング
  vec4 videoColor0 = texture2D(textureUnit0, cellUV);
  vec4 videoColor1 = texture2D(textureUnit1, cellUV);
  
  // ratioで2つのビデオをミックス
  vec4 outColor = mix(videoColor0, videoColor1, ratio);
  
  gl_FragColor = outColor;
}
