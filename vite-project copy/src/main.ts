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
  x: -1000,
  y: -1000,
  prevX: -1000,
  prevY: -1000,
  active: false,
};

// ホバーで描画
canvas.addEventListener('mouseenter', () => {
  mouse.active = true;
});

canvas.addEventListener('mouseleave', () => {
  mouse.active = false;
  mouse.x = -1000;
  mouse.y = -1000;
  mouse.prevX = -1000;
  mouse.prevY = -1000;
});

canvas.addEventListener('mousemove', (e) => {
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
  mouse.x = e.clientX;
  mouse.y = window.innerHeight - e.clientY; // Y座標を反転
  mouse.active = true;
});

// タッチ対応
canvas.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  mouse.x = touch.clientX;
  mouse.y = window.innerHeight - touch.clientY;
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
  mouse.active = true;
});

canvas.addEventListener('touchend', () => {
  mouse.active = false;
  mouse.x = -1000;
  mouse.y = -1000;
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
  mouse.x = touch.clientX;
  mouse.y = window.innerHeight - touch.clientY;
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

  // マウス位置を更新
  if (mouse.active) {
// マウスが動いている時だけ描画
  const moved = Math.abs(mouse.x - mouse.prevX) > 0.5 ||
                Math.abs(mouse.y - mouse.prevY) > 0.5;
  if (moved) {
    feedbackMaterial.uniforms.uMouse.value.set(mouse.x, mouse.y);
    feedbackMaterial.uniforms.uPrevMouse.value.set(mouse.prevX, mouse.prevY);
  } else {
    // 停止中は描画しない
    feedbackMaterial.uniforms.uMouse.value.set(-1000, -1000);
    feedbackMaterial.uniforms.uPrevMouse.value.set(-1000, -1000);
  }
  } else {
    // マウスが画面外の時は描画しない
    feedbackMaterial.uniforms.uMouse.value.set(-1000, -1000);
    feedbackMaterial.uniforms.uPrevMouse.value.set(-1000, -1000);
  }

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

