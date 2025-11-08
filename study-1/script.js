
/** ===========================================================================
 * このサンプルは、GLSL のその他のルールや仕様を解説するためのサンプルです。
 * 頂点シェーダ側に解説コメントが大量に記述されていますので、GLSL を記述するうえ
 * での最低限のルールを把握しておきましょう。
 * JavaScript のほうは変更箇所はなく、シェーダは少しだけ変更してあります。
 * ========================================================================= */

import { WebGLUtility, ShaderProgram } from '../lib/webgl.js';
import { Pane } from '../lib/tweakpane-4.0.0.min.js';

window.addEventListener('DOMContentLoaded', async () => {
  // WebGLApp クラスの初期化とリサイズ処理の設定
  const app = new WebGLApp();
  window.addEventListener('resize', app.resize, false);
  // アプリケーションのロードと初期化
  app.init('webgl-canvas');
  await app.load();
  // セットアップして描画を開始
  app.setup();
  app.render();
}, false);

class WebGLApp {
  /**
   * @constructor
   */
  constructor() {
    // 汎用的なプロパティ
    this.canvas = null;
    this.gl = null;
    this.running = false;

    // this を固定するためメソッドをバインドする
    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);

    // uniform 変数用
    this.uPointSize = 1.0;
    this.uMouse = [0.0, 0.0]; // マウス座標用
    this.startTime = Date.now(); // 追加


    // マウス座標用のイベントを設定
    window.addEventListener('pointermove', (mouseEvent) => {
      const x = mouseEvent.pageX / window.innerWidth;
      const y = mouseEvent.pageY / window.innerHeight;
      const signedX = x * 2.0 - 1.0;
      const signedY = y * 2.0 - 1.0;

      this.uMouse[0] = signedX;
      this.uMouse[1] = -signedY; // スクリーン空間とは正負が逆
    }, false);
  }
  /**
   * シェーダやテクスチャ用の画像など非同期で読み込みする処理を行う。
   * @return {Promise}
   */
  async load() {
    const vs = await WebGLUtility.loadFile('./main.vert');
    const fs = await WebGLUtility.loadFile('./main.frag');
    this.shaderProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: vs,
      fragmentShaderSource: fs,
      attribute: [
        'position',
        'color',
      ],
      stride: [
        3,
        4,
      ],
      uniform: [
        'mouse',
        'resolution',
        'time',
      ],
      type: [
        'uniform2fv',
        'uniform2fv',
        'uniform1f',
      ],
    });

    // 動画を読み込む
    await this.loadVideo('./44019-437624507_tiny.mp4');
  }


  /**
   * 動画を読み込むヘルパー関数
   */
  loadVideo(src) {
  return new Promise((resolve, reject) => {
    this.video = document.createElement('video');
    this.video.src = src;
    this.video.loop = true;
    this.video.muted = true;
    this.video.crossOrigin = 'anonymous';
    
    this.video.addEventListener('loadedmetadata', () => {
      // Canvas準備
      this.videoCanvas = document.createElement('canvas');
      this.videoCtx = this.videoCanvas.getContext('2d');
      this.videoCanvas.width = this.video.videoWidth;
      this.videoCanvas.height = this.video.videoHeight;
      
      this.video.play();
      resolve();
    });
    
    this.video.addEventListener('error', reject);
  });
}

  /**
   * WebGL のレンダリングを開始する前のセットアップを行う。
   */
  setup() {
    this.setupGeometry();
    this.resize();
    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.running = true;
  }
  /**
   * ジオメトリ（頂点情報）を構築するセットアップを行う。
   */
  setupGeometry() {
    this.position = [];
    this.color = [];

    this.SAMPLING = 4; // パーティクル密度
    this.ALPHA_THRESHOLD = 10; // 透明度閾値


    this.vbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
    ];
  }

  /**
 * 動画から現在のフレームのパーティクルを更新
 */
updateParticlesFromVideo() {
  // 配列をリセット
  this.position = [];
  this.color = [];
  
  // 現在のフレームを描画
  this.videoCtx.drawImage(this.video, 0, 0);
  const imageData = this.videoCtx.getImageData(
    0, 0, 
    this.videoCanvas.width, 
    this.videoCanvas.height
  );
  const pixels = imageData.data;
  
  const width = this.videoCanvas.width;
  const height = this.videoCanvas.height;
  
  // ピクセルをサンプリングしてパーティクル化
  for (let y = 0; y < height; y += this.SAMPLING) {
    for (let x = 0; x < width; x += this.SAMPLING) {
      const i = (y * width + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      const isWhiteBackground = r > 250 && g > 250 && b > 250;

      if (a > this.ALPHA_THRESHOLD && !isWhiteBackground) {
        // 座標を -1.0 ~ 1.0 の範囲に正規化
        const normalizedX = (x / width) * 2.0 - 1.0;
        const normalizedY = -((y / height) * 2.0 - 1.0); // Y軸反転
        
        this.position.push(normalizedX, normalizedY, 0.0);

        this.color.push(
          r / 255,
          g / 255,
          b / 255,
          a / 255
        );
      }
    }
  }

  // VBOを更新
  if (this.vbo) {
    this.vbo.forEach(vbo => this.gl.deleteBuffer(vbo));
  }

  this.vbo = [
    WebGLUtility.createVbo(this.gl, this.position),
    WebGLUtility.createVbo(this.gl, this.color),
  ];
}

  /**
   * WebGL を利用して描画を行う。
   */
  render() {
    const gl = this.gl;

    // running が true の場合は requestAnimationFrame を呼び出す
    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    // 動画から毎フレームパーティクルを更新
    if (this.video && this.video.readyState >= 2) {
      this.updateParticlesFromVideo();
    }

    // ビューポートの設定と背景のクリア
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

     const time = (Date.now() - this.startTime) * 0.001;

    // プログラムオブジェクトを指定し、VBO と uniform 変数を設定
    this.shaderProgram.use();
    this.shaderProgram.setAttribute(this.vbo);
    this.shaderProgram.setUniform([
      this.uMouse, // マウス座標用
      [this.canvas.width, this.canvas.height],
      time,
    ]);

    // 設定済みの情報を使って、頂点を画面にレンダリングする
    gl.drawArrays(gl.POINTS, 0, this.position.length / 3);
  }
  /**
   * リサイズ処理を行う。
   */
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  /**
   * WebGL を実行するための初期化処理を行う。
   * @param {HTMLCanvasElement|string} canvas - canvas への参照か canvas の id 属性名のいずれか
   * @param {object} [option={}] - WebGL コンテキストの初期化オプション
   */
  init(canvas, option = {}) {
    if (canvas instanceof HTMLCanvasElement === true) {
      this.canvas = canvas;
    } else if (Object.prototype.toString.call(canvas) === '[object String]') {
      const c = document.querySelector(`#${canvas}`);
      if (c instanceof HTMLCanvasElement === true) {
        this.canvas = c;
      }
    }
    if (this.canvas == null) {
      throw new Error('invalid argument');
    }
    this.gl = this.canvas.getContext('webgl', option);
    if (this.gl == null) {
      throw new Error('webgl not supported');
    }
  }
}

