attribute vec3 position;
attribute vec2 texCoord;

uniform mat4 mvpMatrix;
uniform float pointSize;
uniform sampler2D textureUnit2; // マスクテクスチャ
uniform float gridSize;

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
  
  // 平面のまま
  gl_Position = mvpMatrix * vec4(position, 1.0);
  
  // ポイントサイズ
  gl_PointSize = pointSize;
}
