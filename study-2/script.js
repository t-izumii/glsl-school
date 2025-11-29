/** ===========================================================================
 * 単に複数の画像を切替えるだけのシンプルなフェードイン・アウトを、さらに発展さ
 * せるとより奥深い表現が可能になります。
 * ここではフェードする際の係数として利用する係数マップを新たに用意し、シェーダ
 * 内でこれを参照しながらフェードするタイミングがフラグメントごとに変化するよう
 * にしてみます。
 * 係数マップはモノクロの画像として用意し、１チャンネルだけを使います。実案件な
 * どで同様の表現・テクニックを用いる場合は、１つの画像ファイルのなかには４つの
 * チャンネルが存在するので係数マップを最大４枚分まで同時に詰め込んだりすること
 * も可能ですし、そうすることでデータの節約になります。
 * 係数マップの模様を工夫するだけで様々なバリエーションの表現が可能です。
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
    this.previousTime = 0; // 直前のフレームのタイムスタンプ
    this.timeScale = 0.0;  // 時間の進み方に対するスケール
    this.uTime = 0.0;      // uniform 変数 time 用
    this.uRatio = 0.0;     // 変化の割合い

    // 動画要素用 @@@
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
      view: 'list',
      label: 'monochrome',
      options: [
        {text: 'monochrome-0', value: 0},
        {text: 'monochrome-1', value: 1},
        {text: 'monochrome-2', value: 2},
      ],
      value: 0,
    })
    .on('change', (v) => {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.monochrome[v.value]);
    });
  }

  /**
   * 動画要素を作成し、再生可能になるまで待機する
   * @param {string} src - 動画ファイルのパス
   * @return {Promise<HTMLVideoElement>}
   */
  createVideo(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = src;
      video.muted = true;       // ミュートにしないと自動再生できない
      video.loop = true;        // ループ再生
      video.playsInline = true; // iOS対応
      
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
   * @param {HTMLVideoElement} video - 動画要素
   * @return {WebGLTexture}
   */
  createTextureFromVideo(video) {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // 初期化用の仮データ（動画がまだ準備できていない場合用）
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
    
    // テクスチャパラメータ（NPOT対応）
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    return texture;
  }

  /**
   * 動画テクスチャを更新する
   * @param {WebGLTexture} texture - 更新するテクスチャ
   * @param {HTMLVideoElement} video - 動画要素
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
        'textureUnit2', // モノクロテクスチャ
        'ratio',
      ],
      type: [
        'uniformMatrix4fv',
        'uniform1i',
        'uniform1i',
        'uniform1i',
        'uniform1f',
      ],
    });

    // 動画を読み込む @@@
    this.video0 = await this.createVideo('./2421545-hd_1920_1080_30fps.mp4');
    this.video1 = await this.createVideo('./18905022-hd_1920_1080_24fps (1).mp4');
    
    // 動画用テクスチャを作成 @@@
    this.texture0 = this.createTextureFromVideo(this.video0);
    this.texture1 = this.createTextureFromVideo(this.video1);

    this.monochrome = [
      await WebGLUtility.createTextureFromFile(this.gl, './monochrome1.jpg'),
      await WebGLUtility.createTextureFromFile(this.gl, './monochrome2.jpg'),
      await WebGLUtility.createTextureFromFile(this.gl, './monochrome3.jpg'),
    ];
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
    this.resize();
    this.running = true;
    this.previousTime = Date.now();

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);

    // ３つのユニットにそれぞれテクスチャをバインドしておく
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texture1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.monochrome[0]);
  }
  /**
   * ジオメトリ（頂点情報）を構築するセットアップを行う。
   */
  setupGeometry() {
    // 頂点座標
    this.position = [
      -1.0,  1.0,  0.0,
       1.0,  1.0,  0.0,
      -1.0, -1.0,  0.0,
       1.0, -1.0,  0.0,
    ];
    // テクスチャ座標
    this.texCoord = [
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      1.0, 1.0,
    ];
    // すべての頂点属性を VBO にしておく
    this.vbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.texCoord),
    ];
  }
  /**
   * WebGL を利用して描画を行う。
   */
  render() {
    // 短く書けるようにローカル変数に一度代入する
    const gl = this.gl;
    const m4 = WebGLMath.Mat4;
    const v3 = WebGLMath.Vec3;

    // running が true の場合は requestAnimationFrame を呼び出す
    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    // 直前のフレームからの経過時間を取得
    const now = Date.now();
    const time = (now - this.previousTime) / 1000;
    this.uTime += time * this.timeScale;
    this.previousTime = now;

    // 動画テクスチャを更新 @@@
    gl.activeTexture(gl.TEXTURE0);
    this.updateVideoTexture(this.texture0, this.video0);
    gl.activeTexture(gl.TEXTURE1);
    this.updateVideoTexture(this.texture1, this.video1);

    // ビューポートの設定と背景色・深度値のクリア
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // - 各種行列を生成する ---------------------------------------------------
    // モデル座標変換行列
    const rotateAxis  = v3.create(0.0, 1.0, 0.0);
    const rotateAngle = this.uTime * 0.2;
    const m = m4.rotate(m4.identity(), rotateAngle, rotateAxis);

    // ビュー座標変換行列（WebGLOrbitCamera から行列を取得する）
    const v = this.camera.update();

    // プロジェクション座標変換行列
    const fovy   = 60;                                     // 視野角（度数）
    const aspect = this.canvas.width / this.canvas.height; // アスペクト比
    const near   = 0.1;                                    // ニア・クリップ面までの距離
    const far    = 20.0;                                   // ファー・クリップ面までの距離
    const p = m4.perspective(fovy, aspect, near, far);

    // 行列を乗算して MVP 行列を生成する（行列を掛ける順序に注意）
    const vp = m4.multiply(p, v);
    const mvp = m4.multiply(vp, m);
    // ------------------------------------------------------------------------

    // プログラムオブジェクトを指定し、VBO と uniform 変数を設定
    this.shaderProgram.use();
    this.shaderProgram.setAttribute(this.vbo);
    this.shaderProgram.setUniform([
      mvp,
      0,
      1,
      2, // モノクロの係数テクスチャ
      this.uRatio,
    ]);

    // 設定済みの情報を使って、頂点を画面にレンダリングする
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.position.length / 3);
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
