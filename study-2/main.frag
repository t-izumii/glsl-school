precision mediump float;

uniform sampler2D textureUnit0; // ビデオテクスチャ1
uniform sampler2D textureUnit1; // ビデオテクスチャ2
uniform sampler2D textureUnit2; // マスクテクスチャ
uniform float ratio;
uniform float threshold;
uniform float gap;

varying vec2 vTexCoord;
varying float vBrightness;
varying float vCellSize;
varying float vHoverFactor;

void main() {
  // マスクの明度で表示/非表示を判定
  if (vBrightness < threshold) {
    discard;
  }
  
  // ギャップ処理
  vec2 edgeDist = abs(gl_PointCoord - vec2(0.5)) * 2.0;
  float edge = max(edgeDist.x, edgeDist.y);
  float innerSize = 1.0 - gap;
  if (edge > innerSize) {
    discard;
  }
  
  // UV計算: vTexCoordはセルの左上角、gl_PointCoordでセル内位置を加算
  vec2 cellUV = vTexCoord + gl_PointCoord * vCellSize;
  
  // ビデオをサンプリング
  vec4 videoColor0 = texture2D(textureUnit0, cellUV);
  vec4 videoColor1 = texture2D(textureUnit1, cellUV);
  
  // ホバーでratioを0〜1に切り替え
  float finalRatio = vHoverFactor;
  
  videoColor0.r += 0.5;
  vec4 outColor = mix(videoColor0, videoColor1, finalRatio);

  
  gl_FragColor = outColor;
}
