/** ===========================================================================
 * ビデオプロジェクションマッピング
 * マスク画像を使って、ポイント（頂点）ベースでビデオを投影する
 * ========================================================================= */

import { WebGLUtility, ShaderProgram } from '../lib/webgl.js';
import { WebGLMath } from '../lib/math.js';
import { WebGLOrbitCamera } from '../lib/camera.js';
import { Pane } from '../lib/tweakpane-4.0.0.min.js';

window.addEventListener('DOMContentLoaded', async () => {
  const app = new WebGLApp();
  window.addEventListener('resize', app.resize, false);
  app.init('webgl-canvas');
  await app.load();
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

    // 各種パラメータや uniform 変数用
    this.previousTime = 0;
    this.timeScale = 0.0;
    this.uTime = 0.0;
    this.uRatio = 0.5;
    this.uPointSize = 25.0;   // ポイントサイズ
    this.uThreshold = 0.85;    // マスクの閾値
    this.uGap = 0.0;          // ギャップ（0.0〜1.0）
    this.gridSize = 24;       // グリッドの解像度
    this.mousePos = [0.0, 0.0]; // マウス位置（-1〜1）
    this.uHoverRadius = 0.3;    // ホバー影響範囲
    this.uHoverStrength = 0.5;  // ホバーの強さ（Z方向）

    // 動画要素用
    this.video0 = null;
    this.video1 = null;

    // tweakpane を初期化
    const pane = new Pane();
    pane.addBlade({
      view: 'slider',
      label: 'time-scale',
      min: 0.0,
      max: 2.0,
      value: this.timeScale,
    })
    .on('change', (v) => {
      this.timeScale = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'ratio',
      min: 0.0,
      max: 1.0,
      value: this.uRatio,
    })
    .on('change', (v) => {
      this.uRatio = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'point-size',
      min: 1.0,
      max: 50.0,
      value: this.uPointSize,
    })
    .on('change', (v) => {
      this.uPointSize = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'threshold',
      min: 0.0,
      max: 1.0,
      value: this.uThreshold,
    })
    .on('change', (v) => {
      this.uThreshold = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'gap',
      min: 0.0,
      max: 0.5,
      value: this.uGap,
    })
    .on('change', (v) => {
      this.uGap = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'hover-radius',
      min: 0.1,
      max: 1.0,
      value: this.uHoverRadius,
    })
    .on('change', (v) => {
      this.uHoverRadius = v.value;
    });
    pane.addBlade({
      view: 'slider',
      label: 'hover-strength',
      min: 0.1,
      max: 1.5,
      value: this.uHoverStrength,
    })
    .on('change', (v) => {
      this.uHoverStrength = v.value;
    });
  }

  /**
   * 動画要素を作成し、再生可能になるまで待機する
   */
  createVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      
      video.addEventListener('canplaythrough', () => {
        video.play();
        resolve(video);
      }, { once: true });
      
      video.addEventListener('error', (e) => {
        reject(new Error(`動画の読み込みに失敗: ${src}`));
      }, { once: true });
      
      video.load();
    });
  }

  /**
   * 動画からテクスチャを作成する
   */
  createTextureFromVideo(video) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    return texture;
  }

  /**
   * 動画テクスチャを更新する
   */
  updateVideoTexture(texture, video) {
    const gl = this.gl;
    if (video.readyState >= video.HAVE_CURRENT_DATA) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
      );
    }
  }

  /**
   * シェーダやテクスチャ用の画像など非同期で読み込みする処理を行う。
   */
  async load() {
    const vs = await WebGLUtility.loadFile('./main.vert');
    const fs = await WebGLUtility.loadFile('./main.frag');
    this.shaderProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: vs,
      fragmentShaderSource: fs,
      attribute: [
        'position',
        'texCoord',
      ],
      stride: [
        3,
        2,
      ],
      uniform: [
        'mvpMatrix',
        'textureUnit0',
        'textureUnit1',
        'textureUnit2',
        'ratio',
        'pointSize',
        'threshold',
        'gap',
        'gridSize',
        'mousePos',
        'hoverRadius',
        'hoverStrength',
      ],
      type: [
        'uniformMatrix4fv',
        'uniform1i',
        'uniform1i',
        'uniform1i',
        'uniform1f',
        'uniform1f',
        'uniform1f',
        'uniform1f',
        'uniform1f',
        'uniform2fv',
        'uniform1f',
        'uniform1f',
      ],
    });

    // 動画を読み込む
    this.video0 = await this.createVideo('./14790539_1080_1920_24fps.mp4');
    this.video1 = await this.createVideo('./2324293-hd_1280_720_25fps.mp4');
    
    // 動画用テクスチャを作成
    this.texture0 = this.createTextureFromVideo(this.video0);
    this.texture1 = this.createTextureFromVideo(this.video1);

    // マスク用テクスチャ
    this.maskTexture = await WebGLUtility.createTextureFromFile(this.gl, './icon.png');
  }

  /**
   * WebGL のレンダリングを開始する前のセットアップを行う。
   */
  setup() {
    const gl = this.gl;

    const cameraOption = {
      distance: 3.0,
      min: 1.0,
      max: 10.0,
      move: 2.0,
    };
    this.camera = new WebGLOrbitCamera(this.canvas, cameraOption);

    this.setupGeometry();
    this.setupMouseEvents();
    this.resize();
    this.running = true;
    this.previousTime = Date.now();

    gl.clearColor(0.05, 0.05, 0.05, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    
    // ブレンディングを有効化（透明度のため）
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // テクスチャをバインド
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
  }

  /**
   * マウスイベントのセットアップ
   */
  setupMouseEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      // マウス位置を -1 〜 1 に正規化
      const rect = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      const y = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0); // Yは反転
      this.mousePos = [x, y];
    });
    
    this.canvas.addEventListener('mouseleave', () => {
      // マウスが離れたら画面外に
      this.mousePos = [10.0, 10.0];
    });
  }

  /**
   * グリッド状の頂点を生成する
   */
  setupGeometry() {
    const positions = [];
    const texCoords = [];
    
    const size = this.gridSize;
    
    // グリッド状に頂点を配置
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // 位置（-1 ~ 1 の範囲）
        const px = (x / (size - 1)) * 2.0 - 1.0;
        const py = (y / (size - 1)) * 2.0 - 1.0;
        const pz = 0.0;
        
        positions.push(px, py, pz);
        
        // テクスチャ座標（0 ~ 1 の範囲）
        const u = x / (size - 1);
        const v = 1.0 - y / (size - 1); // Y反転
        
        texCoords.push(u, v);
      }
    }
    
    this.position = positions;
    this.texCoord = texCoords;
    this.vertexCount = size * size;
    
    // VBO を作成
    this.vbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.texCoord),
    ];
  }

  /**
   * WebGL を利用して描画を行う。
   */
  render() {
    const gl = this.gl;
    const m4 = WebGLMath.Mat4;
    const v3 = WebGLMath.Vec3;

    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    // 時間更新
    const now = Date.now();
    const time = (now - this.previousTime) / 1000;
    this.uTime += time * this.timeScale;
    this.previousTime = now;

    // 動画テクスチャを更新
    gl.activeTexture(gl.TEXTURE0);
    this.updateVideoTexture(this.texture0, this.video0);
    gl.activeTexture(gl.TEXTURE1);
    this.updateVideoTexture(this.texture1, this.video1);

    // ビューポートの設定とクリア
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 行列を生成
    const rotateAxis = v3.create(0.0, 1.0, 0.0);
    const rotateAngle = this.uTime * 0.2;
    const m = m4.rotate(m4.identity(), rotateAngle, rotateAxis);

    const v = this.camera.update();

    const fovy = 60;
    const aspect = this.canvas.width / this.canvas.height;
    const near = 0.1;
    const far = 20.0;
    const p = m4.perspective(fovy, aspect, near, far);

    const vp = m4.multiply(p, v);
    const mvp = m4.multiply(vp, m);

    // シェーダを使用して描画
    this.shaderProgram.use();
    this.shaderProgram.setAttribute(this.vbo);
    this.shaderProgram.setUniform([
      mvp,
      0,
      1,
      2,
      this.uRatio,
      this.uPointSize,
      this.uThreshold,
      this.uGap,
      this.gridSize,
      this.mousePos,
      this.uHoverRadius,
      this.uHoverStrength,
    ]);

    // ポイントとして描画
    gl.drawArrays(gl.POINTS, 0, this.vertexCount);
  }

  /**
   * リサイズ処理
   */
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * WebGL を実行するための初期化処理
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
