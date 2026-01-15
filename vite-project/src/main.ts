import * as THREE from 'three';
import './style.css';

// シェーダーをインポート
import feedbackVert from './shaders/feedback.vert?raw';
import feedbackFrag from './shaders/feedback.frag?raw';
import outputFrag from './shaders/output.frag?raw';

// === パラメータ ===
const params = {
  decayRate: 0.985,
  hueShiftSpeed: 2.0,
  lineWidth: 12.0,
  glowAmount: 1.5,
};

// === セットアップ ===
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// === シーン・カメラ ===
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// === レンダーターゲット（ピンポンバッファ）===
const createRenderTarget = () => {
  return new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
};

let rtA = createRenderTarget();
let rtB = createRenderTarget();

// === フィードバック用マテリアル ===
const feedbackMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tPrev: { value: null },
    uMouse: { value: new THREE.Vector2() },
    uPrevMouse: { value: new THREE.Vector2() },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uDecay: { value: params.decayRate },
    uHueShift: { value: params.hueShiftSpeed },
    uLineWidth: { value: params.lineWidth },
    uGlow: { value: params.glowAmount },
    uTime: { value: 0 },
  },
  vertexShader: feedbackVert,
  fragmentShader: feedbackFrag,
});

// === 出力用マテリアル ===
const outputMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  },
  vertexShader: feedbackVert,
  fragmentShader: outputFrag,
});

// === フルスクリーンクワッド ===
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, feedbackMaterial);
scene.add(mesh);

// === マウス追跡 ===
const mouse = {
  x: -2,
  y: -2,
  prevX: -2,
  prevY: -2,
  active: false,
};

// === ヘルパー関数 ===
// マウス座標を-1〜1の正規化座標に変換
const convertToNormalizedCoords = (clientX: number, clientY: number): [number, number] => {
  const x = (clientX / window.innerWidth) * 2 - 1;
  const y = -((clientY / window.innerHeight) * 2 - 1); // Y軸は反転
  return [x, y];
};

const updateMousePosition = (clientX: number, clientY: number) => {
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
  [mouse.x, mouse.y] = convertToNormalizedCoords(clientX, clientY);
};

const resetMousePosition = () => {
  mouse.active = false;
  mouse.x = -2;
  mouse.y = -2;
  mouse.prevX = -2;
  mouse.prevY = -2;
};

const updateShaderMouseUniforms = () => {
  const OFFSCREEN_COORD = -2;
  const MOVEMENT_THRESHOLD = 0.005; // 正規化座標用の閾値

  if (!mouse.active) {
    feedbackMaterial.uniforms.uMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
    feedbackMaterial.uniforms.uPrevMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
    return;
  }

  const hasMoved =
    Math.abs(mouse.x - mouse.prevX) > MOVEMENT_THRESHOLD ||
    Math.abs(mouse.y - mouse.prevY) > MOVEMENT_THRESHOLD;

  if (hasMoved) {
    feedbackMaterial.uniforms.uMouse.value.set(mouse.x, mouse.y);
    feedbackMaterial.uniforms.uPrevMouse.value.set(mouse.prevX, mouse.prevY);
  } else {
    feedbackMaterial.uniforms.uMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
    feedbackMaterial.uniforms.uPrevMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
  }
};

// === イベントリスナー ===
// マウスイベント
canvas.addEventListener('mouseenter', () => {
  mouse.active = true;
});

canvas.addEventListener('mouseleave', resetMousePosition);

canvas.addEventListener('mousemove', (e) => {
  updateMousePosition(e.clientX, e.clientY);
  mouse.active = true;
});

// タッチイベント
canvas.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  updateMousePosition(touch.clientX, touch.clientY);
  mouse.active = true;
});

canvas.addEventListener('touchend', resetMousePosition);

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  updateMousePosition(touch.clientX, touch.clientY);
});

// === リサイズ ===
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);
  
  rtA.dispose();
  rtB.dispose();
  rtA = createRenderTarget();
  rtB = createRenderTarget();

  feedbackMaterial.uniforms.uResolution.value.set(width, height);
  outputMaterial.uniforms.uResolution.value.set(width, height);
});

// === アニメーションループ ===
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  // シェーダーのマウスユニフォームを更新
  updateShaderMouseUniforms();
  feedbackMaterial.uniforms.uTime.value = time;

  // === パス1: フィードバック描画 ===
  feedbackMaterial.uniforms.tPrev.value = rtA.texture;
  mesh.material = feedbackMaterial;
  renderer.setRenderTarget(rtB);
  renderer.render(scene, camera);

  // === パス2: 画面出力 ===
  outputMaterial.uniforms.tDiffuse.value = rtB.texture;
  mesh.material = outputMaterial;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);

  // バッファをスワップ
  [rtA, rtB] = [rtB, rtA];

  // マウス履歴を更新
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
}

animate();

