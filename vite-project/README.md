# Feedback Drawing Effect - Three.js

Three.jsとGLSLシェーダーを使用したインタラクティブなネオンエフェクト描画アプリケーション。

![License](https://img.shields.io/badge/license-Private-blue)
![Three.js](https://img.shields.io/badge/Three.js-0.182.0-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue)

## 目次

- [プロジェクト概要](#プロジェクト概要)
- [主な機能](#主な機能)
- [技術スタック](#技術スタック)
- [プロジェクト構造](#プロジェクト構造)
- [実装の詳細](#実装の詳細)
- [技術的な特徴](#技術的な特徴)
- [セットアップと実行](#セットアップと実行)
- [使い方](#使い方)
- [カスタマイズガイド](#カスタマイズガイド)
- [トラブルシューティング](#トラブルシューティング)
- [パフォーマンス最適化](#パフォーマンス最適化)
- [開発のヒント](#開発のヒント)
- [参考資料](#参考資料)

---

## プロジェクト概要

このプロジェクトは、WebGLとカスタムGLSLシェーダーを使用して、マウスやタッチ操作でネオン風の軌跡を描画できるインタラクティブなビジュアルエフェクトを実装しています。

### 核となる技術

1. **フィードバックループ**: 前フレームの描画結果を次フレームの入力として使用
2. **ピンポンバッファリング**: 2つのレンダーターゲットを交互に切り替え
3. **カスタムGLSLシェーダー**: GPU上で高速なエフェクト処理
4. **正規化座標系**: デバイス非依存の座標システム(-1〜1)

描画された軌跡は徐々に減衰しながら色相を変化させ、美しいネオンエフェクトを生み出します。

---

## 主な機能

- ✨ **インタラクティブ描画**: マウスまたはタッチ操作で自由に描画
- 🎨 **ネオンエフェクト**: グローとブルーム効果による美しいネオン風の表現
- 🌈 **色相シフト**: 時間経過とともに色が虹色に変化
- 👻 **フィードバック効果**: 描画された軌跡が徐々に減衰しながら残像として残る
- 📱 **レスポンシブデザイン**: ウィンドウサイズに応じて自動調整
- 🎯 **アスペクト比補正**: 画面比率に関係なく正確な円形描画

---

## 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Vite** | ^7.2.4 | 高速な開発サーバーとビルドツール |
| **TypeScript** | ~5.9.3 | 型安全なJavaScript |
| **Three.js** | ^0.182.0 | WebGLを扱いやすくする3Dライブラリ |
| **GLSL ES 3.0** | - | カスタムシェーダープログラミング |

---

## プロジェクト構造

```
vite-project/
├── src/
│   ├── main.ts                    # メインアプリケーションロジック（約200行）
│   ├── style.css                  # スタイル定義
│   ├── shaders/
│   │   ├── feedback.vert          # 頂点シェーダー（共通）
│   │   ├── feedback.frag          # フィードバック効果のフラグメントシェーダー
│   │   └── output.frag            # 最終出力とポストプロセッシング
│   └── vite-env.d.ts              # Viteの型定義
├── index.html                     # エントリーポイント
├── package.json                   # 依存関係とスクリプト
├── tsconfig.json                  # TypeScript設定
└── README.md                      # このファイル
```

---

## 実装の詳細

### main.ts - メインアプリケーション

#### 1. 初期設定とパラメータ (src/main.ts:1-21)

```typescript
import * as THREE from 'three';
import feedbackVert from './shaders/feedback.vert?raw';
import feedbackFrag from './shaders/feedback.frag?raw';
import outputFrag from './shaders/output.frag?raw';

const params = {
  decayRate: 0.985,      // 減衰率: 0.0 (即座に消える) 〜 1.0 (永続)
  hueShiftSpeed: 2.0,    // 色相シフト速度: 値が大きいほど色の変化が速い
  lineWidth: 12.0,       // ライン幅: 正規化座標では0.001倍される
  glowAmount: 1.5,       // グロー強度: ネオンの光の強さ
};
```

**パラメータの詳細:**
- `decayRate`: フィードバック効果の減衰率。0.985は約60フレーム(1秒)で50%の明るさになる
- `hueShiftSpeed`: 色相環を1周する速度。2.0 は約125フレーム(約2秒)で1周
- `lineWidth`: ピクセル座標でのライン幅基準値。正規化座標では `lineWidth * 0.001` として使用
- `glowAmount`: グロー効果の乗数。大きいほどネオンが明るく光る

#### 2. レンダラーとシーンのセットアップ (src/main.ts:18-25)

```typescript
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
```

**OrthographicCamera の理由:**
- 2D描画のため透視投影は不要
- (-1, 1) の範囲で正規化デバイス座標(NDC)に直接マッピング
- フルスクリーンクワッドとの相性が良い

**PixelRatio の制限:**
- `Math.min(window.devicePixelRatio, 2)` で最大2倍まで
- Retina/高DPIディスプレイでのパフォーマンス確保
- 4K以上の高解像度でも負荷を抑制

#### 3. ピンポンバッファの作成 (src/main.ts:27-37)

```typescript
const createRenderTarget = () => {
  return new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
};

let rtA = createRenderTarget();
let rtB = createRenderTarget();
```

**レンダーターゲットの設定:**
- `LinearFilter`: テクスチャの補間方法。滑らかなブラー効果に必要
- `RGBAFormat`: 色情報 + アルファチャンネル（ここではアルファは未使用）
- サイズはウィンドウと同じ解像度

**ピンポンバッファの仕組み:**
```
フレーム1: rtA(前フレーム) → 処理 → rtB(現フレーム)
フレーム2: rtB(前フレーム) → 処理 → rtA(現フレーム)
フレーム3: rtA(前フレーム) → 処理 → rtB(現フレーム)
...
```

#### 4. シェーダーマテリアルの設定 (src/main.ts:39-64)

```typescript
const feedbackMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tPrev: { value: null },                    // 前フレームのテクスチャ
    uMouse: { value: new THREE.Vector2() },    // 現在のマウス位置（正規化座標）
    uPrevMouse: { value: new THREE.Vector2() },// 前フレームのマウス位置
    uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uDecay: { value: params.decayRate },
    uHueShift: { value: params.hueShiftSpeed },
    uLineWidth: { value: params.lineWidth },
    uGlow: { value: params.glowAmount },
    uTime: { value: 0 },                       // 経過時間
  },
  vertexShader: feedbackVert,
  fragmentShader: feedbackFrag,
});
```

**Uniformsの役割:**
- `tPrev`: GPUテクスチャ。前フレームの描画結果を保持
- `uMouse/uPrevMouse`: ベクトル2D。正規化座標(-1〜1)
- `uResolution`: 画面解像度。アスペクト比計算に使用
- その他: エフェクトパラメータ

#### 5. 正規化座標変換 (src/main.ts:81-92)

```typescript
const convertToNormalizedCoords = (clientX: number, clientY: number): [number, number] => {
  const x = (clientX / window.innerWidth) * 2 - 1;
  const y = -((clientY / window.innerHeight) * 2 - 1); // Y軸は反転
  return [x, y];
};
```

**座標変換の詳細:**

| 座標系 | 範囲 | 原点位置 | 説明 |
|--------|------|----------|------|
| **Client座標** | x: 0〜width, y: 0〜height | 左上 | ブラウザのマウスイベント座標 |
| **正規化座標** | x: -1〜1, y: -1〜1 | 中央 | デバイス非依存、WebGL標準 |

**変換式:**
- X: `(clientX / width) * 2 - 1`
  - 例: width=800, clientX=400 → (400/800)*2-1 = 0 (中央)
  - 例: width=800, clientX=0 → (0/800)*2-1 = -1 (左端)

- Y: `-((clientY / height) * 2 - 1)`
  - マイナスを付けてY軸を反転（WebGLは下が-1、上が+1）
  - 例: height=600, clientY=0 → -((0/600)*2-1) = 1 (上端)

**オフスクリーン座標:**
- 画面外: `-2` (正規化座標の範囲外)
- これによりシェーダー側で「マウスなし」を判定可能

#### 6. マウス移動検出とシェーダー更新 (src/main.ts:102-120)

```typescript
const updateShaderMouseUniforms = () => {
  const OFFSCREEN_COORD = -2;
  const MOVEMENT_THRESHOLD = 0.005; // 正規化座標用の閾値

  if (!mouse.active) {
    // マウスが画面外
    feedbackMaterial.uniforms.uMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
    return;
  }

  const hasMoved =
    Math.abs(mouse.x - mouse.prevX) > MOVEMENT_THRESHOLD ||
    Math.abs(mouse.y - mouse.prevY) > MOVEMENT_THRESHOLD;

  if (hasMoved) {
    feedbackMaterial.uniforms.uMouse.value.set(mouse.x, mouse.y);
    feedbackMaterial.uniforms.uPrevMouse.value.set(mouse.prevX, mouse.prevY);
  } else {
    // 静止している場合は描画しない
    feedbackMaterial.uniforms.uMouse.value.set(OFFSCREEN_COORD, OFFSCREEN_COORD);
  }
};
```

**移動閾値の意味:**
- `0.005`: 正規化座標での最小移動距離
- 画面幅1920pxの場合: 1920 * 0.005 / 2 ≈ 4.8px
- 微小な揺れを無視してノイズを防ぐ

#### 7. リサイズ処理 (src/main.ts:150-164)

```typescript
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer.setSize(width, height);

  // レンダーターゲットを再生成
  rtA.dispose();
  rtB.dispose();
  rtA = createRenderTarget();
  rtB = createRenderTarget();

  // シェーダーの解像度を更新
  feedbackMaterial.uniforms.uResolution.value.set(width, height);
  outputMaterial.uniforms.uResolution.value.set(width, height);
});
```

**重要なポイント:**
- `dispose()` でGPUメモリを解放（メモリリーク防止）
- レンダーターゲットは必ず再生成が必要
- 解像度変更後もアスペクト比が正しく維持される

#### 8. アニメーションループ (src/main.ts:169-196)

```typescript
function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

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

  mouse.prevX = mouse.x;
  mouse.prevY = mouse.y;
}
```

**2パスレンダリングの流れ:**

```
┌─────────────────────────────────────────┐
│ パス1: フィードバック処理               │
├─────────────────────────────────────────┤
│ 入力: rtA (前フレームの結果)            │
│ 処理: feedback.frag                     │
│   - 前フレームの色を減衰 + 色相シフト   │
│   - マウス軌跡の描画                    │
│ 出力: rtB (オフスクリーン)              │
└─────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────┐
│ パス2: 最終出力                         │
├─────────────────────────────────────────┤
│ 入力: rtB                               │
│ 処理: output.frag                       │
│   - ブルーム効果                        │
│   - トーンマッピング                    │
│   - 彩度・ビネット・ガンマ補正          │
│ 出力: 画面 (canvas)                     │
└─────────────────────────────────────────┘
                 ↓
         rtA ⇄ rtB スワップ
```

---

### feedback.vert - 頂点シェーダー (src/shaders/feedback.vert:1-7)

```glsl
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

**解説:**
- `varying`: フラグメントシェーダーに補間されて渡される変数
- `uv`: Three.jsが提供する組み込み属性（0〜1の範囲）
- `gl_Position`: 頂点の最終的な位置（クリップ空間座標）

**Three.jsの組み込み変数:**
- `position`: 頂点座標 (vec3)
- `uv`: テクスチャ座標 (vec2)
- `projectionMatrix`: 投影行列 (mat4)
- `modelViewMatrix`: モデルビュー行列 (mat4)

---

### feedback.frag - フィードバックシェーダー (src/shaders/feedback.frag:1-101)

#### 1. Uniform変数の定義 (src/shaders/feedback.frag:1-11)

```glsl
uniform sampler2D tPrev;      // 前フレームのテクスチャ
uniform vec2 uMouse;          // 現在のマウス位置（正規化座標）
uniform vec2 uPrevMouse;      // 前フレームのマウス位置
uniform vec2 uResolution;     // 画面解像度
uniform float uDecay;         // 減衰率
uniform float uHueShift;      // 色相シフト速度
uniform float uLineWidth;     // ライン幅
uniform float uGlow;          // グロー強度
uniform float uTime;          // 経過時間

varying vec2 vUv;
```

#### 2. 色空間変換関数 (src/shaders/feedback.frag:14-27)

**RGB → HSV 変換:**

```glsl
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
```

**HSV → RGB 変換:**

```glsl
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
```

**HSVとは:**
- **H (Hue)**: 色相 (0.0〜1.0) - 色環上の位置
  - 0.0 = 赤, 0.33 = 緑, 0.66 = 青, 1.0 = 赤に戻る
- **S (Saturation)**: 彩度 (0.0〜1.0) - 鮮やかさ
  - 0.0 = グレー, 1.0 = 最も鮮やか
- **V (Value)**: 明度 (0.0〜1.0) - 明るさ
  - 0.0 = 黒, 1.0 = 最も明るい

**色相シフトの利点:**
- HSV空間では色相(H)を単純に加算するだけで色が変化
- RGB空間では複雑な計算が必要

#### 3. 線分までの距離計算 (src/shaders/feedback.frag:30-35)

```glsl
float lineDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / (dot(ba, ba) + 0.0001), 0.0, 1.0);
  return length(pa - ba * h);
}
```

**アルゴリズムの解説:**

```
点p から線分ab までの最短距離を計算

  p (ピクセル位置)
  |
  |＼
  |  ＼ ← 最短距離
  |    ＼
  a------c------b (線分)
        ↑
        最近接点
```

**数学的解説:**
1. `pa = p - a`: 点aから点pへのベクトル
2. `ba = b - a`: 線分のベクトル
3. `h = dot(pa, ba) / dot(ba, ba)`: 線分上の最近接点のパラメータ(0〜1)
   - 0: 点a, 1: 点b, 0.5: 中点
4. `clamp(h, 0.0, 1.0)`: 線分の範囲内に制限
5. `pa - ba * h`: 点pから最近接点へのベクトル
6. `length(...)`: そのベクトルの長さ = 最短距離

#### 4. メイン処理 (src/shaders/feedback.frag:37-101)

```glsl
void main() {
  vec2 uv = vUv;
  vec4 prev = texture2D(tPrev, uv);

  // 1. フィードバック処理（減衰 + 色相シフト）
  vec3 hsv = rgb2hsv(prev.rgb);
  hsv.x = fract(hsv.x + uHueShift * 0.001);  // 色相をシフト
  vec3 faded = hsv2rgb(hsv) * uDecay;         // 減衰を適用

  // 微小値をカット（完全に黒になるように）
  faded = faded - 0.002;
  faded = max(faded, vec3(0.0));

  // 2. マウス描画（正規化座標）
  vec2 normalizedCoord = uv * 2.0 - 1.0;  // 0〜1 → -1〜1

  // アスペクト比補正
  float aspect = uResolution.x / uResolution.y;
  normalizedCoord.x *= aspect;
  vec2 mousePos = uMouse;
  mousePos.x *= aspect;
  vec2 prevMousePos = uPrevMouse;
  prevMousePos.x *= aspect;

  float dist = lineDist(normalizedCoord, mousePos, prevMousePos);
  float lineLength = length(mousePos - prevMousePos);

  // 正規化座標用のライン幅
  float normalizedLineWidth = uLineWidth * 0.001;

  // ネオンライン（コア + グロー）
  float line = smoothstep(normalizedLineWidth, normalizedLineWidth * 0.3, dist);
  float glow = normalizedLineWidth / (dist + normalizedLineWidth);
  glow = pow(glow, 2.0);
  glow *= smoothstep(0.0, 0.01, lineLength);  // 短い線はグローを抑制

  float intensity = line + glow * 0.3;

  // ネオンカラー（時間で変化）
  float hue = fract(uTime * 0.08);
  vec3 neonColor = hsv2rgb(vec3(hue, 1.0, 1.0));

  // コアは白っぽく
  vec3 coreColor = mix(neonColor, vec3(1.0), smoothstep(0.0, 1.0, intensity * 0.5));
  vec3 brushResult = coreColor * intensity * (0.5 + uGlow * 0.3);

  // 加算合成
  vec3 finalColor = faded + brushResult;

  gl_FragColor = vec4(finalColor, 1.0);
}
```

**アスペクト比補正の必要性:**

```
アスペクト比 = 16:9 (1.78) の場合

補正なし:
  X軸: -1〜1 (幅2)
  Y軸: -1〜1 (幅2)
  → 円が横に伸びた楕円になる

補正あり:
  X軸: -1.78〜1.78 (幅3.56)
  Y軸: -1〜1 (幅2)
  → 正しい円形になる
```

**ネオンエフェクトの仕組み:**

```
距離(dist)
    ↓
┌─────────────────────────────────┐
│ line: smoothstep               │ ← 鋭いコア
├─────────────────────────────────┤
│ glow: 1/距離                    │ ← 柔らかいグロー
└─────────────────────────────────┘
    ↓
intensity = line + glow * 0.3
    ↓
色を適用 + 明るさ調整
```

**smoothstep関数:**
```glsl
smoothstep(edge0, edge1, x)
```
- `x < edge0`: 0を返す
- `x > edge1`: 1を返す
- 中間: S字カーブで滑らかに補間

**グロー効果の数式:**
```glsl
glow = normalizedLineWidth / (dist + normalizedLineWidth)
```
- 距離が0に近い: glowは1に近い（明るい）
- 距離が大きい: glowは0に近い（暗い）
- `1/距離`の挙動で自然な光の拡散を表現

---

### output.frag - 出力シェーダー (src/shaders/output.frag:1-57)

#### 1. 多段階ブルーム効果 (src/shaders/output.frag:11-32)

```glsl
vec3 bloom = vec3(0.0);

// ブラーサイズと重み
float blurSizes[3];
blurSizes[0] = 2.0 / uResolution.x;   // 小: 鋭いグロー
blurSizes[1] = 5.0 / uResolution.x;   // 中: 中間のグロー
blurSizes[2] = 10.0 / uResolution.x;  // 大: 拡散したグロー

float weights[3];
weights[0] = 0.4;  // 小サイズの寄与度: 40%
weights[1] = 0.3;  // 中サイズの寄与度: 30%
weights[2] = 0.2;  // 大サイズの寄与度: 20%

for (int b = 0; b < 3; b++) {
  vec3 layerBloom = vec3(0.0);

  // 12方向サンプリング（30度ずつ）
  for (int i = 0; i < 12; i++) {
    float angle = float(i) * 0.5236; // PI/6 = 30度
    vec2 offset = vec2(cos(angle), sin(angle)) * blurSizes[b];
    layerBloom += texture2D(tDiffuse, uv + offset).rgb;
  }

  bloom += (layerBloom / 12.0) * weights[b];
}

color += bloom * 0.6;
```

**ブルームの仕組み:**

```
        N (12時)
        |
   NW   |   NE
     ＼ | ／
  W ──── ● ──── E  ← 現在のピクセル
     ／ | ＼
   SW   |   SE
        |
        S (6時)

12方向からサンプリングして平均化
→ 放射状にぼかした効果
```

**3段階のブラーサイズ:**
- **小 (2px)**: 鋭いネオンの縁取り
- **中 (5px)**: 中間的な光のにじみ
- **大 (10px)**: 広範囲の光の拡散

これらを重み付けして合成することで、自然で豊かなグロー効果を実現。

#### 2. トーンマッピング (src/shaders/output.frag:37-39)

```glsl
// Reinhardトーンマッピング
color = color / (color + vec3(1.0));
```

**トーンマッピングとは:**
- HDR (High Dynamic Range) → SDR (Standard Dynamic Range) への変換
- 明るすぎる色を表示可能な範囲に圧縮

**Reinhard式の特徴:**
```
入力 → 出力
0.0  → 0.0   (黒はそのまま)
0.5  → 0.33  (中間はやや暗く)
1.0  → 0.5   (明るい部分を圧縮)
2.0  → 0.67  (非常に明るい部分も保持)
∞    → 1.0   (無限大でも1.0に収束)
```

#### 3. 彩度ブースト (src/shaders/output.frag:44-46)

```glsl
float gray = dot(color, vec3(0.299, 0.587, 0.114));
color = mix(vec3(gray), color, 1.3);
```

**彩度の計算:**
- `gray`: 知覚的な明るさ（人間の目の感度に基づく重み）
  - 緑(0.587)が最も明るく見え、青(0.114)が最も暗く見える
- `mix(gray, color, 1.3)`: グレースケールから元の色へ130%補間
  - 1.0 = 元のまま
  - 1.3 = 30%彩度が増加
  - 鮮やかなネオンカラーを強調

#### 4. ビネット効果 (src/shaders/output.frag:48-50)

```glsl
float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5) * 1.5);
color *= vignette;
```

**ビネットの仕組み:**
```
画面中央からの距離を計算
    ↓
0.0 (中央) → 1.0 (明るい)
0.5 (中間) → 0.5 (やや暗い)
1.0 (端)   → 0.0 (暗い)
    ↓
色に乗算して周辺を暗く
```

**パラメータの意味:**
- `length(uv - 0.5)`: 中央(0.5, 0.5)からの距離
- `* 1.5`: 効果の強度
- `smoothstep(0.4, 1.2, ...)`: 0.4以内は明るいまま、1.2以上は完全に暗い

#### 5. ガンマ補正 (src/shaders/output.frag:52-53)

```glsl
color = pow(color, vec3(1.0 / 2.2));
```

**ガンマ補正とは:**
- ディスプレイの非線形な特性を補正
- リニア色空間 → sRGB色空間への変換

**数学的背景:**
```
ディスプレイ: 入力^2.2 = 実際の明度
シェーダー: 色^(1/2.2) = 補正された色
結果: (色^(1/2.2))^2.2 = 色 (正しい明度)
```

**ガンマ 2.2 の理由:**
- sRGB標準の近似値
- 人間の目の感度特性に近い
- ほとんどのモニターが採用

---

## 技術的な特徴

### 1. ピンポンバッファリング

**概念:**
```
時刻 t=0:
  rtA: [空] ────読取──→ shader ────書込──→ rtB: [初期描画]

時刻 t=1:
  rtB: [初期描画] ──読取─→ shader ──書込─→ rtA: [描画+フィードバック]

時刻 t=2:
  rtA: [描画+フィードバック] ──読取─→ shader ──書込─→ rtB: [新しい描画]

...繰り返し
```

**利点:**
- フレームバッファの内容を次フレームで使用可能
- GPU上で完結するため高速
- メモリコピーが不要（ポインタのスワップのみ）

**用途:**
- フィードバック効果
- ブラー・モーションブラー
- 流体シミュレーション
- パーティクルシステム

### 2. 正規化デバイス座標 (NDC)

**座標系の比較:**

| 座標系 | 範囲 | 原点 | 特徴 |
|--------|------|------|------|
| **ピクセル座標** | 0〜width, 0〜height | 左上 | デバイス依存、解像度の影響を受ける |
| **正規化座標** | -1〜1, -1〜1 | 中央 | デバイス非依存、数学的に扱いやすい |
| **UV座標** | 0〜1, 0〜1 | 左下 | テクスチャマッピング用 |

**正規化座標の利点:**
1. **デバイス非依存**: 画面サイズに関係なく同じコードで動作
2. **対称性**: 中央が(0, 0)で計算が直感的
3. **数学的操作が容易**: 回転、スケール、距離計算など
4. **WebGL標準**: クリップ空間座標と一致

### 3. アスペクト比補正

**問題:**
```
正規化座標 (-1〜1) は正方形
実際の画面は矩形（例: 16:9）
→ X軸とY軸で1単位の物理的な長さが異なる
→ 円が楕円になる
```

**解決策:**
```glsl
float aspect = uResolution.x / uResolution.y;
normalizedCoord.x *= aspect;
mousePos.x *= aspect;
```

**効果:**
```
16:9の場合 (aspect = 1.78)
  X軸: -1.78 〜 1.78
  Y軸: -1.0 〜 1.0
→ X軸とY軸で1単位の物理的な長さが等しくなる
→ 円が正しく描画される
```

### 4. 距離フィールドによる描画

**従来の手法:**
- ピクセルごとにライン上かチェック
- アンチエイリアス処理が複雑
- パフォーマンスが悪い

**距離フィールド手法:**
- 各ピクセルから線分までの距離を計算
- 距離に基づいて色を決定
- 滑らかなグラデーション
- GPU並列処理に最適

**数学的利点:**
```
dist = lineDist(pixel, a, b)

if (dist < lineWidth) {
  // ライン内部
} else {
  // ライン外部
}

// さらに滑らかに:
intensity = smoothstep(lineWidth, 0, dist);
```

---

## セットアップと実行

### 必要環境

- **Node.js**: v18.0.0 以上
- **npm**: v8.0.0 以上
- **モダンブラウザ**: WebGL 2.0対応

### インストール

```bash
# リポジトリのクローン（または移動）
cd vite-project

# 依存関係のインストール
npm install
```

### 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開いてアプリケーションを確認できます。

**開発サーバーの機能:**
- ホットモジュールリロード (HMR)
- TypeScriptの自動コンパイル
- シェーダーファイルの変更を即座に反映

### ビルド

```bash
npm run build
```

**出力:**
- `dist/` フォルダに最適化されたファイルを生成
- JavaScriptのミニファイ
- アセットのハッシュ化（キャッシュ対策）

### プレビュー

```bash
npm run preview
```

ビルド後のアプリケーションをローカルでプレビューできます。

---

## 使い方

### 基本操作

1. ブラウザでアプリケーションを開く
2. **マウスをドラッグ**: ネオンの軌跡を描画
3. **タッチ操作**: モバイル・タブレットでも動作
4. **画面をクリア**: 何もせず待つと自然に消える

### エフェクトの特徴

- **虹色の変化**: 描いた線が時間とともに色が変わる
- **残像効果**: 軌跡が徐々に薄くなりながら残る
- **ネオングロー**: 線の周りに光のにじみが広がる
- **滑らかな描画**: 60FPSの滑らかなアニメーション

---

## カスタマイズガイド

### パラメータ調整

`src/main.ts` の `params` オブジェクトを編集:

```typescript
const params = {
  decayRate: 0.985,      // 推奨: 0.95〜0.995
  hueShiftSpeed: 2.0,    // 推奨: 0.5〜5.0
  lineWidth: 12.0,       // 推奨: 5.0〜30.0
  glowAmount: 1.5,       // 推奨: 0.5〜3.0
};
```

### カスタマイズ例

#### 1. 長く残る軌跡

```typescript
const params = {
  decayRate: 0.995,  // ← 値を大きく
  hueShiftSpeed: 1.0,
  lineWidth: 12.0,
  glowAmount: 1.5,
};
```

**効果:** 軌跡が10秒以上残り、ゆっくりと消える

#### 2. 素早く色が変わる虹色

```typescript
const params = {
  decayRate: 0.985,
  hueShiftSpeed: 5.0,  // ← 値を大きく
  lineWidth: 12.0,
  glowAmount: 1.5,
};
```

**効果:** 色相が高速で変化し、サイケデリックな印象

#### 3. 太いネオン

```typescript
const params = {
  decayRate: 0.985,
  hueShiftSpeed: 2.0,
  lineWidth: 30.0,    // ← 値を大きく
  glowAmount: 2.5,    // ← 値を大きく
};
```

**効果:** 太くて明るいネオン、ポップな印象

#### 4. 細く繊細な線

```typescript
const params = {
  decayRate: 0.98,
  hueShiftSpeed: 2.0,
  lineWidth: 5.0,     // ← 値を小さく
  glowAmount: 0.8,    // ← 値を小さく
};
```

**効果:** 細くて繊細な線、エレガントな印象

### シェーダーのカスタマイズ

#### 色を固定する

`src/shaders/feedback.frag` の86行目付近:

```glsl
// 変更前
float hue = fract(uTime * 0.08);

// 変更後: 青色で固定
float hue = 0.66; // 0.0=赤, 0.33=緑, 0.66=青
```

#### ブルーム効果を強化

`src/shaders/output.frag` の35行目付近:

```glsl
// 変更前
color += bloom * 0.6;

// 変更後
color += bloom * 1.2;  // ← 値を大きく
```

#### ビネットを無効化

`src/shaders/output.frag` の48〜50行目をコメントアウト:

```glsl
// float vignette = 1.0 - smoothstep(0.4, 1.2, length(uv - 0.5) * 1.5);
// color *= vignette;
```

---

## トラブルシューティング

### 描画されない

**症状:** マウスを動かしても何も表示されない

**原因と解決策:**

1. **WebGLが無効**
   - ブラウザのWebGL設定を確認
   - `chrome://gpu` で確認 (Chrome)

2. **シェーダーコンパイルエラー**
   - ブラウザのコンソールを確認
   - GLSLの構文エラーを修正

3. **マウス座標がオフスクリーン**
   - `console.log(mouse.x, mouse.y)` でデバッグ
   - -1〜1の範囲内か確認

### パフォーマンスが悪い

**症状:** カクカクする、フレームレートが低い

**解決策:**

1. **PixelRatioを下げる**
   ```typescript
   renderer.setPixelRatio(1); // 固定を1に
   ```

2. **ブルームのサンプリング数を減らす**
   ```glsl
   // 12 → 8に変更
   for (int i = 0; i < 8; i++) {
   ```

3. **解像度を下げる**
   ```typescript
   const scale = 0.75;
   renderer.setSize(
     window.innerWidth * scale,
     window.innerHeight * scale
   );
   ```

### 色がおかしい

**症状:** 色が暗い、鮮やかでない

**原因と解決策:**

1. **ガンマ補正が二重に適用**
   - Three.jsの設定を確認:
     ```typescript
     renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
     ```

2. **彩度ブーストが不足**
   - `output.frag` で値を調整:
     ```glsl
     color = mix(vec3(gray), color, 1.5); // 1.3 → 1.5
     ```

### リサイズ後に描画がずれる

**症状:** ウィンドウをリサイズすると描画位置がずれる

**原因:** レンダーターゲットが再生成されていない

**解決策:** リサイズ処理を確認:
```typescript
window.addEventListener('resize', () => {
  rtA.dispose();
  rtB.dispose();
  rtA = createRenderTarget();
  rtB = createRenderTarget();
  // ...
});
```

---

## パフォーマンス最適化

### 計測

**FPS測定:**
```typescript
const stats = new Stats();
document.body.appendChild(stats.dom);

function animate() {
  stats.begin();
  // ... レンダリング処理
  stats.end();
}
```

**GPU使用率:** ブラウザの開発者ツール → パフォーマンスタブ

### 最適化テクニック

#### 1. レンダーターゲットの解像度を下げる

```typescript
const scale = 0.75; // 75%の解像度

const createRenderTarget = () => {
  return new THREE.WebGLRenderTarget(
    window.innerWidth * scale,
    window.innerHeight * scale,
    { /* ... */ }
  );
};
```

**効果:**
- レンダリング負荷: 56% (0.75^2)
- 見た目の劣化: わずか

#### 2. ブルームの最適化

```glsl
// サンプリング数を減らす
for (int i = 0; i < 8; i++) {  // 12 → 8

// ブラー段階を減らす
for (int b = 0; b < 2; b++) {  // 3 → 2
```

**効果:**
- GPU負荷: 約30%削減
- 見た目: ほぼ変わらず

#### 3. 条件分岐の削減

```glsl
// 変更前（遅い）
if (hasMoved) {
  // 処理A
} else {
  // 処理B
}

// 変更後（速い）
float moveFactor = step(THRESHOLD, distance);
// moveFactor を使った計算
```

**理由:** GPUは分岐処理が苦手（SIMD構造のため）

#### 4. テクスチャフォーマットの最適化

```typescript
// Float16を使用（精度とパフォーマンスのバランス）
const createRenderTarget = () => {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,  // ← Float16
    // ...
  });
};
```

---

## 開発のヒント

### シェーダーのデバッグ

**1. カラーデバッグ:**
```glsl
// 値を色として表示
gl_FragColor = vec4(vec3(dist), 1.0);  // dist を グレースケールで表示
gl_FragColor = vec4(normalizedCoord.x, normalizedCoord.y, 0.0, 1.0);  // 座標を色で表示
```

**2. 値の範囲チェック:**
```glsl
// 値が0〜1の範囲外なら赤で警告
vec3 debugColor = mix(color, vec3(1.0, 0.0, 0.0), step(1.0, length(color)));
```

**3. ステップごとの確認:**
```glsl
// 各処理段階を個別に確認
gl_FragColor = vec4(faded, 1.0);        // フィードバックのみ
// gl_FragColor = vec4(brushResult, 1.0);  // 描画のみ
// gl_FragColor = vec4(finalColor, 1.0);   // 最終結果
```

### Hot Reload

**シェーダーの変更を即座に反映:**

1. `?raw` インポートにより、Viteが自動的にHMRを処理
2. シェーダーファイルを保存すると即座に再コンパイル
3. エラーがあればブラウザのコンソールに表示

### TypeScriptの活用

**型安全なUniform更新:**
```typescript
interface Uniforms {
  uMouse: { value: THREE.Vector2 };
  uTime: { value: number };
  // ...
}

const updateUniforms = (uniforms: Uniforms, mouse: MouseData) => {
  uniforms.uMouse.value.set(mouse.x, mouse.y);
};
```

---

## 参考資料

### WebGL / GLSL

- [WebGL Fundamentals](https://webglfundamentals.org/) - WebGLの基礎
- [The Book of Shaders](https://thebookofshaders.com/) - GLSL入門
- [Shadertoy](https://www.shadertoy.com/) - シェーダーの作例集

### Three.js

- [Three.js公式ドキュメント](https://threejs.org/docs/)
- [Three.js Examples](https://threejs.org/examples/) - 公式サンプル集

### 色空間

- [Color Spaces - Wikipedia](https://en.wikipedia.org/wiki/Color_space)
- [HSV Color Space](https://en.wikipedia.org/wiki/HSL_and_HSV)
- [sRGB - Wikipedia](https://en.wikipedia.org/wiki/SRGB)

### ポストプロセッシング

- [Bloom Effect](https://learnopengl.com/Advanced-Lighting/Bloom)
- [Tone Mapping](https://64.github.io/tonemapping/)

### 数学

- [Distance to Line Segment](https://mathworld.wolfram.com/Point-LineDistance2-Dimensional.html)
- [Smoothstep Function](https://en.wikipedia.org/wiki/Smoothstep)

---

## ブラウザ対応

| ブラウザ | バージョン | 対応状況 |
|---------|-----------|---------|
| Chrome | 90+ | ✅ 完全対応 |
| Firefox | 88+ | ✅ 完全対応 |
| Safari | 14+ | ✅ 完全対応 |
| Edge | 90+ | ✅ 完全対応 |

**必要要件:**
- WebGL 2.0 サポート
- ES2022 サポート
- Canvas API

---

## ライセンス

プライベートプロジェクト

---

## 作者

GLSLスクール 2025 課題プロジェクト

---

## 変更履歴

### v1.1.0 (2025-01-14)
- 正規化座標系(-1〜1)に変更
- アスペクト比補正を追加
- マウス座標処理を改善

### v1.0.0 (2025-01-14)
- 初回リリース
- フィードバック描画機能
- ネオンエフェクト実装
