attribute vec3 position;
attribute vec4 color;
uniform vec2 mouse;
uniform vec2 resolution;
uniform float time;

varying vec4 vColor;

void main() {
  float aspect = resolution.x / resolution.y;

  vec2 correctedPosition = position.xy;
  correctedPosition.x *= aspect;

  vec2 correctedMouse = mouse;
  correctedMouse.x *= aspect;

  vec2 toMouse = correctedMouse - correctedPosition;
  float distanceToMouse = length(toMouse);
  float explosion = exp(-distanceToMouse * 2.0);

  float randomOffset = sin(position.x * 100.0) * cos(position.y * 100.0);
  float explosionTime = sin(time * 4.0 + randomOffset * 3.14) * 0.5 + 0.5;

  vec2 normalizedToMouse = normalize(toMouse);
  vec2 offset = -normalizedToMouse * explosion * explosionTime * 0.8;
  offset.x /= aspect;

  float zOffset = explosion * explosionTime * 3.0;

  vec3 p = vec3(position.xy + offset, position.z + zOffset);
  gl_Position = vec4(p, 1.0);

  vec3 heat = vec3(1.0, 0.5, 0.0) * explosion * explosionTime;
  vColor = vec4(color.rgb + heat, color.a);

  gl_PointSize = mix(3.0, 35.0, explosion * explosionTime);
}