/** ===========================================================================
 * ASCII Art Effect with Video Particles
 * bitnb.io風のASCIIエフェクトを実装
 * 2パスレンダリング:
 *   Pass 1: 動画パーティクルをフレームバッファに描画
 *   Pass 2: フレームバッファのテクスチャをASCII化して画面に描画
 * ========================================================================= */

import { WebGLUtility, ShaderProgram } from '../lib/webgl.js';
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
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.running = false;

    this.resize = this.resize.bind(this);
    this.render = this.render.bind(this);

    // Particle用のパラメータ
    this.uMouse = [0.0, 0.0];
    this.startTime = Date.now();
    
    // ASCII用のパラメータ
    this.asciiParams = {
      tileSize: 10.0,
      tileStrength: 1.0,
      colorStep: 0.1,
      bioMode: false,
    };

    // マウスイベント
    window.addEventListener('pointermove', (mouseEvent) => {
      const x = mouseEvent.pageX / window.innerWidth;
      const y = mouseEvent.pageY / window.innerHeight;
      const signedX = x * 2.0 - 1.0;
      const signedY = y * 2.0 - 1.0;
      this.uMouse[0] = signedX;
      this.uMouse[1] = -signedY;
    }, false);
  }

  async load() {
    // パーティクル用シェーダー
    const particleVs = await WebGLUtility.loadFile('./main.vert');
    const particleFs = await WebGLUtility.loadFile('./main.frag');
    this.particleProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: particleVs,
      fragmentShaderSource: particleFs,
      attribute: ['position', 'color'],
      stride: [3, 4],
      uniform: ['mouse', 'resolution', 'time'],
      type: ['uniform2fv', 'uniform2fv', 'uniform1f'],
    });

    // ASCII用シェーダー
    const asciiVs = await WebGLUtility.loadFile('./ascii.vert');
    const asciiFs = await WebGLUtility.loadFile('./ascii.frag');
    this.asciiProgram = new ShaderProgram(this.gl, {
      vertexShaderSource: asciiVs,
      fragmentShaderSource: asciiFs,
      attribute: ['position', 'uv'],
      stride: [3, 2],
      uniform: [
        'uResolution',
        'uTextureSize',
        'uTexture',
        'uAsciiMap',
        'uAsciiColorStep',
        'uTileSize',
        'uTileStrength',
        'uBioMode',
      ],
      type: [
        'uniform2fv',
        'uniform2fv',
        'uniform1i',
        'uniform1i',
        'uniform1f',
        'uniform1f',
        'uniform1f',
        'uniform1i',
      ],
    });

    await this.loadVideo('./44019-437624507_tiny.mp4');
  }

  loadVideo(src) {
    return new Promise((resolve, reject) => {
      this.video = document.createElement('video');
      this.video.src = src;
      this.video.loop = true;
      this.video.muted = true;
      this.video.crossOrigin = 'anonymous';
      
      this.video.addEventListener('loadedmetadata', () => {
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

  setup() {
    const gl = this.gl;
    
    this.setupParticleGeometry();
    this.setupScreenQuad();
    this.createFramebuffer();
    this.createAsciiMap();
    
    this.resize();
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    
    // ブレンディングを有効化
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    this.setupGUI();
    this.running = true;
  }

  setupParticleGeometry() {
    this.position = [];
    this.color = [];
    this.SAMPLING = 4;
    this.ALPHA_THRESHOLD = 10;

    this.particleVbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
    ];
  }

  setupScreenQuad() {
    // フルスクリーンクワッド（画面全体を覆う四角形）
    const position = [
      -1.0,  1.0, 0.0,
       1.0,  1.0, 0.0,
      -1.0, -1.0, 0.0,
       1.0, -1.0, 0.0,
    ];
    
    const uv = [
      0.0, 1.0,
      1.0, 1.0,
      0.0, 0.0,
      1.0, 0.0,
    ];

    this.quadVbo = [
      WebGLUtility.createVbo(this.gl, position),
      WebGLUtility.createVbo(this.gl, uv),
    ];
  }

  createFramebuffer() {
    const gl = this.gl;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // フレームバッファ作成
    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // カラーテクスチャ作成
    this.renderTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // テクスチャをフレームバッファに関連付け
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.renderTexture, 0);

    // フレームバッファのステータス確認
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer is not complete:', status);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  createAsciiMap() {
    const gl = this.gl;
    
    // ASCII文字列（明るい順）
    const chars = ' .:-=+*#%@';
    const charCount = chars.length;
    const fontSize = 32;
    const charWidth = fontSize * 0.6;
    
    // Canvasを作成
    const canvas = document.createElement('canvas');
    canvas.width = charWidth * charCount;
    canvas.height = fontSize;
    const ctx = canvas.getContext('2d');
    
    // 背景を黒に
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 文字を白で描画
    ctx.fillStyle = 'white';
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (let i = 0; i < charCount; i++) {
      ctx.fillText(chars[i], charWidth * i + charWidth / 2, fontSize / 2);
    }
    
    // テクスチャ作成
    this.asciiTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.asciiTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  updateParticlesFromVideo() {
    this.position = [];
    this.color = [];
    
    this.videoCtx.drawImage(this.video, 0, 0);
    const imageData = this.videoCtx.getImageData(0, 0, this.videoCanvas.width, this.videoCanvas.height);
    const pixels = imageData.data;
    
    const width = this.videoCanvas.width;
    const height = this.videoCanvas.height;
    
    for (let y = 0; y < height; y += this.SAMPLING) {
      for (let x = 0; x < width; x += this.SAMPLING) {
        const i = (y * width + x) * 4;
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];

        const isWhiteBackground = r > 250 && g > 250 && b > 250;

        if (a > this.ALPHA_THRESHOLD && !isWhiteBackground) {
          const normalizedX = (x / width) * 2.0 - 1.0;
          const normalizedY = -((y / height) * 2.0 - 1.0);
          
          this.position.push(normalizedX, normalizedY, 0.0);
          this.color.push(r / 255, g / 255, b / 255, a / 255);
        }
      }
    }

    if (this.particleVbo) {
      this.particleVbo.forEach(vbo => this.gl.deleteBuffer(vbo));
    }

    this.particleVbo = [
      WebGLUtility.createVbo(this.gl, this.position),
      WebGLUtility.createVbo(this.gl, this.color),
    ];
  }

  render() {
    const gl = this.gl;

    if (this.running === true) {
      requestAnimationFrame(this.render);
    }

    if (this.video && this.video.readyState >= 2) {
      this.updateParticlesFromVideo();
    }

    const time = (Date.now() - this.startTime) * 0.001;

    // Pass 1: パーティクルをフレームバッファに描画
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.particleProgram.use();
    this.particleProgram.setAttribute(this.particleVbo);
    this.particleProgram.setUniform([
      this.uMouse,
      [this.canvas.width, this.canvas.height],
      time,
    ]);
    gl.drawArrays(gl.POINTS, 0, this.position.length / 3);

    // Pass 2: フレームバッファのテクスチャをASCII化して画面に描画
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.asciiProgram.use();
    this.asciiProgram.setAttribute(this.quadVbo);
    
    // テクスチャをバインド
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.asciiTexture);
    
    this.asciiProgram.setUniform([
      [this.canvas.width, this.canvas.height],
      [this.canvas.width, this.canvas.height],
      0,
      1,
      this.asciiParams.colorStep,
      this.asciiParams.tileSize,
      this.asciiParams.tileStrength,
      this.asciiParams.bioMode ? 1 : 0,
    ]);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  setupGUI() {
    const pane = new Pane();
    
    pane.addBinding(this.asciiParams, 'tileSize', {
      label: 'Tile Size',
      min: 10,
      max: 100,
      step: 1,
    });
    
    pane.addBinding(this.asciiParams, 'tileStrength', {
      label: 'Tile Strength',
      min: 0.5,
      max: 2.0,
      step: 0.1,
    });
    
    pane.addBinding(this.asciiParams, 'colorStep', {
      label: 'Color Step',
      min: 0.05,
      max: 0.2,
      step: 0.01,
    });
    
    pane.addBinding(this.asciiParams, 'bioMode', {
      label: 'Bio Mode',
    });
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    
    // フレームバッファのリサイズ
    if (this.framebuffer) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, this.renderTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.canvas.width, this.canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

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
