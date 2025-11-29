attribute vec3 position;
attribute vec2 texCoord;

uniform mat4 mvpMatrix;
uniform float pointSize;
uniform float gridSize;
uniform vec2 mousePos;
uniform float hoverRadius;
uniform float hoverStrength;
uniform sampler2D textureUnit2; // マスクテクスチャ

varying vec2 vTexCoord;
varying float vBrightness;
varying float vCellSize;

void main() {
  // セルの左上角のUV座標を渡す
  vTexCoord = texCoord;
  
  // セルサイズ
  vCellSize = 1.0 / gridSize;
  
  // マスクの明度を取得（セルの中心でサンプリング）
  vec2 cellCenter = texCoord + vCellSize * 0.5;
  vec4 mask = texture2D(textureUnit2, cellCenter);
  float brightness = (mask.r + mask.g + mask.b) / 3.0;
  vBrightness = brightness;
  
  // マウス位置との距離を計算
  float dist = distance(position.xy, mousePos);
  
  // 距離に応じてZ座標を手前に
  float zOffset = 0.0;
  if (dist < hoverRadius) {
    float factor = 1.0 - (dist / hoverRadius);
    zOffset = factor * factor * hoverStrength;
  }
  
  vec3 pos = position;
  pos.z += zOffset;
  
  gl_Position = mvpMatrix * vec4(pos, 1.0);
  
  // ポイントサイズ
  float sizeBoost = 1.0 + zOffset * 0.5;
  gl_PointSize = pointSize * sizeBoost;
}
