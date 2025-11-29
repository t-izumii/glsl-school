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
  vTexCoord = texCoord;
  
  // マスクの明度を取得
  vec4 mask = texture2D(textureUnit2, texCoord);
  float brightness = (mask.r + mask.g + mask.b) / 3.0;
  vBrightness = 1.0 - brightness;
  
  // セルサイズを渡す（UV空間での1セルの大きさ）
  vCellSize = 1.0 / gridSize;
  
  // マウス位置との距離を計算
  float dist = distance(position.xy, mousePos);
  
  // 距離に応じてZ座標を手前に
  float zOffset = 0.0;
  if (dist < hoverRadius) {
    float factor = 1.0 - (dist / hoverRadius);
    zOffset = factor * factor * hoverStrength; // イージング
  }
  
  vec3 pos = position;
  pos.z += zOffset;
  
  gl_Position = mvpMatrix * vec4(pos, 1.0);
  
  // ポイントサイズ（ホバー時に少し大きく）
  float sizeBoost = 1.0 + zOffset * 0.5;
  gl_PointSize = pointSize * sizeBoost;
}
