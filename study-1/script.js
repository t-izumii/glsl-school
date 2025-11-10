/** ===========================================================================
 * ASCII Art Effect with Video Particles
 * bitnb.io風のASCIIエフェクトを実装
 *
 * 【2パスレンダリングの仕組み】
 * Pass 1: 動画から生成したパーティクルをフレームバッファ（オフスクリーン）に描画
 * Pass 2: フレームバッファのテクスチャをASCII文字で表現して画面に描画
 *
 * 【処理の流れ】
 * 1. 動画を読み込み、各フレームをCanvas2Dで描画
 * 2. Canvas2Dからピクセルデータを取得
 * 3. 各ピクセルをパーティクルとして3D空間に配置
 * 4. パーティクルをフレームバッファに描画（Pass 1）
 * 5. フレームバッファをASCII文字化して画面に描画（Pass 2）
 * ========================================================================= */

// WebGLユーティリティとシェーダープログラムクラスをインポート
import { WebGLUtility, ShaderProgram } from '../lib/webgl.js';
// Tweakpane（GUIライブラリ）をインポート
import { Pane } from '../lib/tweakpane-4.0.0.min.js';

// ========================================
// ページ読み込み完了時の初期化処理
// ========================================
window.addEventListener('DOMContentLoaded', async () => {
  // WebGLアプリケーションのインスタンスを作成
  const app = new WebGLApp();

  // ウィンドウリサイズ時のイベントリスナーを登録
  window.addEventListener('resize', app.resize, false);

  // WebGLの初期化（canvas要素の取得とWebGLコンテキストの作成）
  app.init('webgl-canvas');

  // シェーダーと動画の非同期読み込み
  await app.load();

  // 各種設定とジオメトリの準備
  app.setup();

  // レンダリングループの開始
  app.render();
}, false);

// ========================================
// WebGLアプリケーションクラス
// すべての処理を管理するメインクラス
// ========================================
class WebGLApp {
  /**
   * コンストラクタ
   * 初期値の設定とイベントリスナーの登録
   */
  constructor() {
    // Canvas要素への参照
    this.canvas = null;

    // WebGLコンテキスト
    this.gl = null;

    // レンダリングループの実行フラグ
    this.running = false;

    // thisのバインド（イベントリスナー内でthisを正しく参照するため）
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);

    // ========================================
    // パーティクル用のパラメータ
    // ========================================
    // マウス座標（-1.0 ~ 1.0の正規化座標）
    this.uMouse = [0.0, 0.0];

    // アニメーション開始時刻（ミリ秒）
    this.startTime = Date.now();

    // ========================================
    // ASCII効果用のパラメータ
    // ========================================
    this.asciiParams = {
      tileSize: 100.0,       // 1文字あたりのピクセルサイズ（初期値は大きく、アニメーションで小さくする）
      tileStrength: 2.0,     // 文字の明るさの強さ（倍率）
      colorStep: 0.01,       // 色の段階化の強さ（小さいほど階調が細かい）
      bioMode: false,        // Bio Mode（緑色モード）のオン/オフ
    };

    // アニメーション用のパラメータ
    this.tileSizeAnimation = {
      isAnimating: false,
      startValue: 100.0,
      endValue: 10.0,
      duration: 2000,        // 2秒（ミリ秒）
      delay: 2000,           // 2秒待ってから開始（ミリ秒）
      startTime: 0,
    };

    // ========================================
    // マウス移動イベントの登録
    // ========================================
    window.addEventListener('pointermove', (mouseEvent) => {
      // マウス座標を0.0 ~ 1.0に正規化
      const x = mouseEvent.pageX / window.innerWidth;
      const y = mouseEvent.pageY / window.innerHeight;

      // -1.0 ~ 1.0の範囲に変換（WebGLのクリップ空間座標系）
      // 0.0 ~ 1.0 を 2倍して 1を引く → -1.0 ~ 1.0
      const signedX = x * 2.0 - 1.0;
      const signedY = y * 2.0 - 1.0;

      // マウス座標を保存
      this.uMouse[0] = signedX;
      // Y座標は反転（画面座標系とWebGL座標系でY軸の向きが逆）
      this.uMouse[1] = -signedY;
    }, false);
  }

  /**
   * シェーダーと動画の非同期読み込み
   */
  async load() {
    // ========================================
    // パーティクル用シェーダーの読み込みとコンパイル
    // ========================================
    const particleVs = await WebGLUtility.loadFile('./main.vert');
    const particleFs = await WebGLUtility.loadFile('./main.frag');

    // シェーダープログラムの作成
    this.particleProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: particleVs,           // 頂点シェーダーのソースコード
      fragmentShaderSource: particleFs,         // フラグメントシェーダーのソースコード
      attribute: ['position', 'color'],         // attribute変数の名前
      stride: [3, 4],                          // 各attributeの要素数（position: xyz=3, color: rgba=4）
      uniform: ['mouse', 'resolution', 'time'], // uniform変数の名前
      type: ['uniform2fv', 'uniform2fv', 'uniform1f'], // uniformの型（2fv: vec2, 1f: float）
    });

    // ========================================
    // ASCII効果用シェーダーの読み込みとコンパイル
    // ========================================
    const asciiVs = await WebGLUtility.loadFile('./ascii.vert');
    const asciiFs = await WebGLUtility.loadFile('./ascii.frag');

    // シェーダープログラムの作成
    this.asciiProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: asciiVs,
      fragmentShaderSource: asciiFs,
      attribute: ['position', 'uv'],            // position: 頂点座標, uv: テクスチャ座標
      stride: [3, 2],                          // position: xyz=3, uv: st=2
      uniform: [
        'uResolution',     // 画面解像度
        'uTextureSize',    // テクスチャサイズ（現在未使用）
        'uTexture',        // パーティクルを描画したテクスチャ
        'uAsciiMap',       // ASCII文字マップテクスチャ
        'uAsciiColorStep', // 色の段階化
        'uTileSize',       // タイルサイズ
        'uTileStrength',   // タイルの強度
        'uBioMode',        // Bio Mode
      ],
      type: [
        'uniform2fv',      // vec2: 解像度
        'uniform2fv',      // vec2: テクスチャサイズ
        'uniform1i',       // sampler2D（整数でテクスチャユニット番号を指定）
        'uniform1i',       // sampler2D
        'uniform1f',       // float
        'uniform1f',       // float
        'uniform1f',       // float
        'uniform1i',       // int（boolの代わりに使用）
      ],
    });

    // ========================================
    // 動画ファイルの読み込み
    // ========================================
    await this.loadVideo('./44019-437624507_tiny.mp4');
  }

  /**
   * 動画の読み込み
   * @param {string} src - 動画ファイルのパス
   * @returns {Promise} 読み込み完了時にresolveされるPromise
   */
  loadVideo(src) {
    return new Promise((resolve, reject) => {
      // video要素を動的に作成
      this.video = document.createElement('video');
      this.video.src = src;
      this.video.loop = true;              // ループ再生を有効化
      this.video.muted = true;             // ミュート（自動再生に必要）
      this.video.playsInline = true;       // iOS対応：インライン再生を有効化
      this.video.setAttribute('playsinline', ''); // iOS Safari対応
      this.video.crossOrigin = 'anonymous'; // CORS設定（必要に応じて）

      // 動画のメタデータ読み込み完了時のイベント
      this.video.addEventListener('loadedmetadata', async () => {
        // 動画のフレームを描画するためのCanvas（オフスクリーン）
        this.videoCanvas = document.createElement('canvas');
        this.videoCtx = this.videoCanvas.getContext('2d');

        // Canvasサイズを動画サイズに合わせる
        this.videoCanvas.width = this.video.videoWidth;
        this.videoCanvas.height = this.video.videoHeight;

        // 動画の再生を開始（エラーハンドリング付き）
        try {
          await this.video.play();
          console.log('Video playback started successfully');
          resolve();
        } catch (error) {
          console.error('Video playback failed:', error);
          // 自動再生が失敗した場合、ユーザーインタラクションで再生
          this.setupVideoPlayOnClick();
          resolve(); // 一旦resolveして描画は続行
        }
      });

      // エラー時のハンドリング
      this.video.addEventListener('error', (e) => {
        console.error('Video loading error:', e);
        reject(e);
      });
    });
  }

  /**
   * ユーザーのクリック/タップで動画を再生
   * スマホでの自動再生ブロック対策
   */
  setupVideoPlayOnClick() {
    const playVideo = async () => {
      try {
        await this.video.play();
        console.log('Video started by user interaction');
        document.removeEventListener('click', playVideo);
        document.removeEventListener('touchstart', playVideo);
      } catch (error) {
        console.error('Failed to play video on user interaction:', error);
      }
    };

    // クリックまたはタッチで動画を再生
    document.addEventListener('click', playVideo, { once: true });
    document.addEventListener('touchstart', playVideo, { once: true });

    // ユーザーに通知
    console.log('Tap screen to start video');
  }

  /**
   * セットアップ処理
   * ジオメトリ、フレームバッファ、テクスチャなどの初期化
   */
  setup() {
    const gl = this.gl;

    // パーティクル用のジオメトリ（頂点データ）を準備
    this.setupParticleGeometry();

    // フルスクリーンクワッド（画面全体を覆う四角形）を準備
    this.setupScreenQuad();

    // フレームバッファ（オフスクリーンレンダリング用）を作成
    this.createFramebuffer();

    // ASCII文字マップテクスチャを作成
    this.createAsciiMap();

    // リサイズ処理を実行（Canvasサイズを画面サイズに合わせる）
    this.resize();

    // クリアカラーの設定（白: RGBA = 1.0, 1.0, 1.0, 1.0）
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    // ========================================
    // アルファブレンディングの有効化
    // ========================================
    gl.enable(gl.BLEND);
    // ブレンド式: 結果 = src * srcAlpha + dst * (1 - srcAlpha)
    // 半透明表現を実現
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // GUI（パラメータ調整用のコントロールパネル）を作成
    this.setupGUI();

    // レンダリングループの実行を許可
    this.running = true;

    // ========================================
    // tileSizeアニメーションを開始
    // ========================================
    this.startTileSizeAnimation();
  }

  /**
   * tileSizeのアニメーションを開始
   * 100から10まで2秒かけて変化させる
   */
  startTileSizeAnimation() {
    this.tileSizeAnimation.isAnimating = true;
    this.tileSizeAnimation.startTime = Date.now();
  }

  /**
   * tileSizeアニメーションの更新
   * イージング関数を使ってスムーズに変化させる
   */
  updateTileSizeAnimation() {
    if (!this.tileSizeAnimation.isAnimating) {
      return;
    }

    // 経過時間を計算
    const elapsed = Date.now() - this.tileSizeAnimation.startTime;
    const delay = this.tileSizeAnimation.delay;
    const duration = this.tileSizeAnimation.duration;

    // ========================================
    // ディレイ期間中は何もしない
    // ========================================
    if (elapsed < delay) {
      return;
    }

    // ディレイを引いた実際のアニメーション経過時間
    const animationElapsed = elapsed - delay;

    // アニメーション完了判定
    if (animationElapsed >= duration) {
      this.asciiParams.tileSize = this.tileSizeAnimation.endValue;
      this.tileSizeAnimation.isAnimating = false;
      return;
    }

    // 進行度（0.0 ~ 1.0）
    const progress = animationElapsed / duration;

    // イージング関数（easeOutCubic: 最初速く、後半ゆっくり）
    const eased = 1 - Math.pow(1 - progress, 3);

    // tileSizeを補間
    const startValue = this.tileSizeAnimation.startValue;
    const endValue = this.tileSizeAnimation.endValue;
    this.asciiParams.tileSize = startValue + (endValue - startValue) * eased;
  }

  /**
   * パーティクル用のジオメトリ（頂点データ）を準備
   * 初期化時は空の配列で、動画フレームごとに更新される
   */
  setupParticleGeometry() {
    // 頂点位置データ（初期は空）
    this.position = [];

    // 頂点カラーデータ（初期は空）
    this.color = [];

    // サンプリング間隔（ピクセル）
    // スマホの場合はサンプリング間隔を大きくしてパフォーマンス向上
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    this.SAMPLING = isMobile ? 8 : 4;

    // アルファ値の閾値
    // この値より大きいアルファ値を持つピクセルのみパーティクル化
    this.ALPHA_THRESHOLD = 10;

    console.log(`Device: ${isMobile ? 'Mobile' : 'Desktop'}, Sampling: ${this.SAMPLING}`);

    // VBO（Vertex Buffer Object）の作成
    // GPU上に頂点データを転送するためのバッファ
    this.particleVbo = [
      WebGLUtility.createVbo(this.gl, this.position), // 位置データ用VBO
      WebGLUtility.createVbo(this.gl, this.color),    // カラーデータ用VBO
    ];
  }

  /**
   * フルスクリーンクワッド（画面全体を覆う四角形）のジオメトリを準備
   * ASCII効果を画面全体に適用するために使用
   */
  setupScreenQuad() {
    // ========================================
    // 頂点位置データ（クリップ空間座標: -1.0 ~ 1.0）
    // ========================================
    // 4つの頂点で構成される四角形
    // (-1, 1)左上  →  (1, 1)右上
    //     ↓             ↓
    // (-1,-1)左下  →  (1,-1)右下
    const position = [
      -1.0,  1.0, 0.0,  // 左上
       1.0,  1.0, 0.0,  // 右上
      -1.0, -1.0, 0.0,  // 左下
       1.0, -1.0, 0.0,  // 右下
    ];

    // ========================================
    // UV座標（テクスチャ座標: 0.0 ~ 1.0）
    // ========================================
    // テクスチャのどの部分を頂点にマッピングするか
    // (0, 1)左上  →  (1, 1)右上
    //    ↓             ↓
    // (0, 0)左下  →  (1, 0)右下
    const uv = [
      0.0, 1.0,  // 左上
      1.0, 1.0,  // 右上
      0.0, 0.0,  // 左下
      1.0, 0.0,  // 右下
    ];

    // VBOの作成
    this.quadVbo = [
      WebGLUtility.createVbo(this.gl, position), // 位置データ用VBO
      WebGLUtility.createVbo(this.gl, uv),       // UV座標用VBO
    ];
  }

  /**
   * フレームバッファの作成
   * オフスクリーンレンダリング（画面外に描画）を実現
   * Pass 1でパーティクルをこのフレームバッファに描画し、
   * Pass 2でそのテクスチャをASCII化して画面に描画
   */
  createFramebuffer() {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // ========================================
    // フレームバッファオブジェクトの作成
    // ========================================
    this.framebuffer = gl.createFramebuffer();
    // フレームバッファをバインド（以降の操作はこのフレームバッファに対して行われる）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // ========================================
    // カラーテクスチャの作成
    // ========================================
    // フレームバッファに描画された内容を保存するテクスチャ
    this.renderTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);

    // テクスチャ画像データの設定（初期データはnull = 空のテクスチャ）
    // 引数: target, level, internalformat, width, height, border, format, type, pixels
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // テクスチャパラメータの設定
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // 縮小時の補間方法
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); // 拡大時の補間方法
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // 横方向のラップモード
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // 縦方向のラップモード

    // ========================================
    // テクスチャをフレームバッファに関連付け
    // ========================================
    // フレームバッファの COLOR_ATTACHMENT0 にテクスチャをアタッチ
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.renderTexture, 0);

    // ========================================
    // フレームバッファの完全性チェック
    // ========================================
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer is not complete:', status);
    }

    // バインドを解除（デフォルトのフレームバッファ = 画面に戻す）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * ASCII文字マップテクスチャの作成
   * Canvas2Dで文字を描画し、それをWebGLテクスチャに変換
   */
  createAsciiMap() {
    const gl = this.gl;

    // ========================================
    // ASCII文字セット（明るさ順に並べる）
    // ========================================
    // 暗い（スペース）→ 明るい（@記号）
    const chars = ' .:-=+*#%@';
    const charCount = chars.length;        // 文字数: 10
    const fontSize = 32;                   // フォントサイズ（ピクセル）
    const charWidth = fontSize * 0.6;      // 文字幅（等幅フォントの概算）

    // ========================================
    // Canvas2Dで文字を描画
    // ========================================
    const canvas = document.createElement('canvas');
    canvas.width = charWidth * charCount;  // 全文字を横に並べる幅
    canvas.height = fontSize;              // 高さは1文字分
    const ctx = canvas.getContext('2d');

    // 背景を黒で塗りつぶし
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 文字を白で描画
    ctx.fillStyle = 'white';
    ctx.font = `${fontSize}px monospace`;  // 等幅フォント
    ctx.textAlign = 'center';              // 中央揃え
    ctx.textBaseline = 'middle';           // 縦方向中央揃え

    // 各文字を横に並べて描画
    for (let i = 0; i < charCount; i++) {
      // X座標: charWidth * i + charWidth / 2（各文字の中心）
      // Y座標: fontSize / 2（縦方向の中心）
      ctx.fillText(chars[i], charWidth * i + charWidth / 2, fontSize / 2);
    }

    // ========================================
    // Canvas画像からWebGLテクスチャを作成
    // ========================================
    this.asciiTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.asciiTexture);

    // CanvasをテクスチャとしてGPUに転送
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    // テクスチャパラメータの設定
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // バインド解除
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * 動画フレームからパーティクルデータを更新
   * 毎フレーム呼ばれ、動画の現在のフレームをパーティクルに変換
   */
  updateParticlesFromVideo() {
    // 配列をリセット
    this.position = [];
    this.color = [];

    // ========================================
    // 動画フレームをCanvasに描画
    // ========================================
    this.videoCtx.drawImage(this.video, 0, 0);

    // ========================================
    // ピクセルデータを取得
    // ========================================
    const imageData = this.videoCtx.getImageData(0, 0, this.videoCanvas.width, this.videoCanvas.height);
    const pixels = imageData.data; // RGBA配列（各ピクセルは4つの値: R, G, B, A）

    const width = this.videoCanvas.width;
    const height = this.videoCanvas.height;

    // ========================================
    // 各ピクセルをサンプリングしてパーティクル化
    // ========================================
    for (let y = 0; y < height; y += this.SAMPLING) {
      for (let x = 0; x < width; x += this.SAMPLING) {
        // ピクセル配列のインデックスを計算
        // (y * width + x) でピクセル番号を求め、* 4 でRGBA配列のインデックスに変換
        const i = (y * width + x) * 4;

        // RGBA値を取得
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        // 白背景判定（RGBすべてが250より大きい）
        const isWhiteBackground = r > 250 && g > 250 && b > 250;

        // ========================================
        // パーティクル生成条件
        // ========================================
        // 1. アルファ値が閾値より大きい（不透明度が十分）
        // 2. 白背景ではない
        if (a > this.ALPHA_THRESHOLD && !isWhiteBackground) {
          // ========================================
          // 座標の正規化（0.0 ~ 1.0 → -1.0 ~ 1.0）
          // ========================================
          // X座標: 0 ~ width → 0.0 ~ 1.0 → -1.0 ~ 1.0
          const normalizedX = (x / width) * 2.0 - 1.0;

          // Y座標: 0 ~ height → 0.0 ~ 1.0 → -1.0 ~ 1.0
          // Y軸を反転（画面座標系とWebGL座標系でY軸の向きが逆）
          const normalizedY = -((y / height) * 2.0 - 1.0);

          // 位置データを追加（x, y, z）
          this.position.push(normalizedX, normalizedY, 0.0);

          // カラーデータを追加（r, g, b, a）
          // 0 ~ 255 → 0.0 ~ 1.0 に正規化
          this.color.push(r / 255, g / 255, b / 255, a / 255);
        }
      }
    }

    // ========================================
    // 古いVBOを削除
    // ========================================
    if (this.particleVbo) {
      this.particleVbo.forEach(vbo => this.gl.deleteBuffer(vbo));
    }

    // ========================================
    // 新しいVBOを作成
    // ========================================
    this.particleVbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
    ];
  }

  /**
   * レンダリング処理（毎フレーム呼ばれる）
   * 2パスレンダリングを実行
   */
  render() {
    const gl = this.gl;

    // ========================================
    // 次のフレームをリクエスト（レンダリングループ）
    // ========================================
    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    // ========================================
    // tileSizeアニメーションの更新
    // ========================================
    this.updateTileSizeAnimation();

    // ========================================
    // 動画フレームが準備できていればパーティクルを更新
    // ========================================
    // readyState >= 2: HAVE_CURRENT_DATA（現在のフレームが利用可能）
    if (this.video && this.video.readyState >= 2) {
      this.updateParticlesFromVideo();
    }

    // ========================================
    // 経過時間の計算（秒単位）
    // ========================================
    const time = (Date.now() - this.startTime) * 0.001;

    // ========================================
    // Pass 1: パーティクルをフレームバッファに描画
    // ========================================
    // フレームバッファにバインド（画面外に描画）
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // ビューポートを設定（描画領域）
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // フレームバッファをクリア（前フレームの内容を消去）
    gl.clear(gl.COLOR_BUFFER_BIT);

    // パーティクル用シェーダープログラムを使用
    this.particleProgram.use();

    // VBOをバインド（attribute変数にデータを関連付け）
    this.particleProgram.setAttribute(this.particleVbo);

    // Uniform変数に値を設定
    this.particleProgram.setUniform([
      this.uMouse,                              // マウス位置（vec2）
      [this.canvas.width, this.canvas.height],  // 画面解像度（vec2）
      time,                                     // 経過時間（float）
    ]);

    // パーティクルを描画
    // gl.POINTS: 各頂点を点として描画
    // 0: 開始インデックス
    // this.position.length / 3: 頂点数（positionは[x,y,z]の3要素で1頂点）
    gl.drawArrays(gl.POINTS, 0, this.position.length / 3);

    // ========================================
    // Pass 2: フレームバッファのテクスチャをASCII化して画面に描画
    // ========================================
    // デフォルトのフレームバッファにバインド（画面に描画）
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ビューポートを設定
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // 画面をクリア
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ASCII効果用シェーダープログラムを使用
    this.asciiProgram.use();

    // フルスクリーンクワッドのVBOをバインド
    this.asciiProgram.setAttribute(this.quadVbo);

    // ========================================
    // テクスチャをバインド
    // ========================================
    // テクスチャユニット0をアクティブ化
    gl.activeTexture(gl.TEXTURE0);
    // Pass 1で描画したテクスチャをバインド
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);

    // テクスチャユニット1をアクティブ化
    gl.activeTexture(gl.TEXTURE1);
    // ASCII文字マップテクスチャをバインド
    gl.bindTexture(gl.TEXTURE_2D, this.asciiTexture);

    // Uniform変数に値を設定
    this.asciiProgram.setUniform([
      [this.canvas.width, this.canvas.height],  // 画面解像度（vec2）
      [this.canvas.width, this.canvas.height],  // テクスチャサイズ（vec2）
      0,                                        // uTexture: テクスチャユニット0
      1,                                        // uAsciiMap: テクスチャユニット1
      this.asciiParams.colorStep,               // 色の段階化（float）
      this.asciiParams.tileSize,                // タイルサイズ（float）
      this.asciiParams.tileStrength,            // タイル強度（float）
      this.asciiParams.bioMode ? 1 : 0,         // Bio Mode（int: 1=ON, 0=OFF）
    ]);

    // フルスクリーンクワッドを描画
    // gl.TRIANGLE_STRIP: 三角形ストリップ（4頂点で2つの三角形を描画）
    // 頂点0-1-2で三角形1、頂点1-2-3で三角形2を構成 → 全体で四角形になる
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * GUIセットアップ
   * Tweakpaneを使ってパラメータ調整用のコントロールパネルを作成
   */
  setupGUI() {
    // Paneインスタンスを作成
    const pane = new Pane();

    // ========================================
    // Tile Size スライダー
    // ========================================
    pane.addBinding(this.asciiParams, 'tileSize', {
      label: 'Tile Size',  // ラベル
      min: 10,             // 最小値
      max: 100,            // 最大値
      step: 1,             // ステップ（増減の単位）
    });

    // ========================================
    // Tile Strength スライダー
    // ========================================
    pane.addBinding(this.asciiParams, 'tileStrength', {
      label: 'Tile Strength',
      min: 0.5,
      max: 2.0,
      step: 0.1,
    });

    // ========================================
    // Color Step スライダー
    // ========================================
    pane.addBinding(this.asciiParams, 'colorStep', {
      label: 'Color Step',
      min: 0.05,
      max: 0.2,
      step: 0.01,
    });

    // ========================================
    // Bio Mode チェックボックス
    // ========================================
    pane.addBinding(this.asciiParams, 'bioMode', {
      label: 'Bio Mode',
    });
  }

  /**
   * リサイズ処理
   * ウィンドウサイズが変わった時にCanvasとフレームバッファのサイズを更新
   * 16:9のアスペクト比を維持
   */
  resize() {
    // ========================================
    // 16:9のアスペクト比を維持してリサイズ
    // ========================================
    const targetAspect = 16 / 9; // 目標アスペクト比
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const windowAspect = windowWidth / windowHeight;

    let canvasWidth, canvasHeight;

    if (windowAspect > targetAspect) {
      // 画面が横長の場合、高さ基準で幅を計算
      canvasHeight = windowHeight;
      canvasWidth = windowHeight * targetAspect;
    } else {
      // 画面が縦長の場合、幅基準で高さを計算
      canvasWidth = windowWidth;
      canvasHeight = windowWidth / targetAspect;
    }

    // Canvasのサイズを設定
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    // ========================================
    // フレームバッファのリサイズ
    // ========================================
    if (this.framebuffer) {
      const gl = this.gl;

      // レンダーテクスチャをバインド
      gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);

      // テクスチャサイズを新しいCanvasサイズに更新
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      // バインド解除
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  /**
   * 初期化処理
   * Canvas要素の取得とWebGLコンテキストの作成
   * @param {HTMLCanvasElement|string} canvas - Canvas要素またはID文字列
   * @param {Object} option - WebGLコンテキストのオプション
   */
  init(canvas, option = {}) {
    // ========================================
    // Canvas要素の取得
    // ========================================
    if (canvas instanceof HTMLCanvasElement === true) {
      // 引数がCanvas要素の場合、そのまま使用
      this.canvas = canvas;
    } else if (Object.prototype.toString.call(canvas) === '[object String]') {
      // 引数が文字列の場合、IDとして要素を検索
      const c = document.querySelector(`#${canvas}`);
      if (c instanceof HTMLCanvasElement === true) {
        this.canvas = c;
      }
    }

    // Canvas要素が取得できなかった場合はエラー
    if (this.canvas == null) {
      console.error('Canvas element not found');
      throw new Error('invalid argument');
    }

    // ========================================
    // WebGLコンテキストの取得
    // ========================================
    this.gl = this.canvas.getContext('webgl', option) || this.canvas.getContext('experimental-webgl', option);

    // WebGLがサポートされていない場合はエラー
    if (this.gl == null) {
      console.error('WebGL is not supported on this device');
      alert('WebGL is not supported on your device. Please try a different browser.');
      throw new Error('webgl not supported');
    }

    console.log('WebGL initialized successfully');
    console.log('WebGL Version:', this.gl.getParameter(this.gl.VERSION));
    console.log('Renderer:', this.gl.getParameter(this.gl.RENDERER));
  }
}
