// Веб-версия MediaPipe Pose (работает в браузере без отдельного EXE)

class WebPoseDetector {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.animationId = null;
    this.isRunning = false;
    this.landmarks = null;
  }

  async start() {
    // Создаем контейнер
    const container = document.createElement('div');
    container.id = 'pose-container';
    container.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            width: 400px;
            background: #1a202c;
            border-radius: 12px;
            overflow: hidden;
            z-index: 1000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 2px solid #00ff00;
        `;

    container.innerHTML = `
            <div style="padding: 10px; background: #2d3748; color: white; display: flex; justify-content: space-between;">
                <span>🤖 MediaPipe Pose Analysis</span>
                <button id="close-pose" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
            </div>
            <div style="position: relative;">
                <video id="pose-video" autoplay playsinline style="width: 100%; transform: scaleX(-1);"></video>
                <canvas id="pose-canvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
            </div>
            <div id="pose-stats" style="padding: 10px; background: #2d3748; color: white; font-size: 12px;">
                Загрузка...
            </div>
        `;

    document.body.appendChild(container);

    document.getElementById('close-pose').onclick = () => this.stop();

    this.video = document.getElementById('pose-video');
    this.canvas = document.getElementById('pose-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Запускаем камеру
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    this.video.srcObject = stream;

    // Ждем загрузки MediaPipe
    await this.loadMediaPipe();

    this.isRunning = true;
    this.detect();
  }

  async loadMediaPipe() {
    return new Promise((resolve) => {
      // Загружаем MediaPipe Pose из CDN
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
      script.onload = () => {
        this.pose = new Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });

        this.pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        this.pose.onResults((results) => this.onResults(results));
        resolve();
      };
      document.head.appendChild(script);
    });
  }

  onResults(results) {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (results.poseLandmarks) {
      this.drawSkeleton(results.poseLandmarks);
      this.calculateStats(results.poseLandmarks);
    }
  }

  drawSkeleton(landmarks) {
    const connections = [
      [11, 12],
      [11, 23],
      [12, 24],
      [23, 24],
      [23, 25],
      [24, 26],
      [25, 27],
      [26, 28],
      [11, 13],
      [12, 14],
      [13, 15],
      [14, 16],
    ];

    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;

    connections.forEach(([s, e]) => {
      if (landmarks[s] && landmarks[e]) {
        this.ctx.beginPath();
        this.ctx.moveTo(landmarks[s].x * this.canvas.width, landmarks[s].y * this.canvas.height);
        this.ctx.lineTo(landmarks[e].x * this.canvas.width, landmarks[e].y * this.canvas.height);
        this.ctx.stroke();
      }
    });

    landmarks.forEach((lm) => {
      this.ctx.fillStyle = '#ff0000';
      this.ctx.beginPath();
      this.ctx.arc(lm.x * this.canvas.width, lm.y * this.canvas.height, 3, 0, 2 * Math.PI);
      this.ctx.fill();
    });
  }

  calculateStats(landmarks) {
    const angle = (a, b, c) => {
      const ba = { x: a.x - b.x, y: a.y - b.y };
      const bc = { x: c.x - b.x, y: c.y - b.y };
      const dot = ba.x * bc.x + ba.y * bc.y;
      const cross = ba.x * bc.y - ba.y * bc.x;
      return (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
    };

    const leftKnee =
      landmarks[23] && landmarks[25] && landmarks[27]
        ? Math.round(angle(landmarks[23], landmarks[25], landmarks[27]))
        : '--';
    const rightKnee =
      landmarks[24] && landmarks[26] && landmarks[28]
        ? Math.round(angle(landmarks[24], landmarks[26], landmarks[28]))
        : '--';

    const statsDiv = document.getElementById('pose-stats');
    if (statsDiv) {
      let status = '✅ Хорошо';
      if (leftKnee !== '--' && leftKnee > 105) status = '⚠️ Ноги не согнуты';
      if (leftKnee !== '--' && leftKnee < 75) status = '⚠️ Слишком глубоко';

      statsDiv.innerHTML = `
                <div>Левое колено: ${leftKnee}°</div>
                <div>Правое колено: ${rightKnee}°</div>
                <div>Статус: ${status}</div>
            `;
    }
  }

  detect() {
    if (!this.isRunning) return;

    if (this.video && this.video.videoWidth > 0) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;
      this.pose.send({ image: this.video });
    }

    this.animationId = requestAnimationFrame(() => this.detect());
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach((t) => t.stop());
    }
    const container = document.getElementById('pose-container');
    if (container) container.remove();
  }
}
