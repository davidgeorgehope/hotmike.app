export type LayoutMode = 'face_card' | 'face_only' | 'screen_pip';
export type PIPPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type PIPSize = 'small' | 'medium' | 'large';
export type PIPShape = 'circle' | 'square';
export type OverlayPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

// Circle PIP diameters
const PIP_SIZES: Record<PIPSize, number> = {
  small: 200,
  medium: 280,
  large: 360,
};

const PIP_MARGIN = 32;

export interface CompositorOptions {
  nameCardText: string;
  nameCardTitle: string;
  pipPosition: PIPPosition;
  pipSize: PIPSize;
  pipShape: PIPShape;
}

export interface OverlayOptions {
  opacity: number;  // 0-1
  position: OverlayPosition;
  scale: number;  // 0.1-1
}

export class Compositor {
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private webcamVideo: HTMLVideoElement | null = null;
  private screenVideo: HTMLVideoElement | null = null;
  private layout: LayoutMode = 'face_only';
  private options: CompositorOptions = {
    nameCardText: '',
    nameCardTitle: '',
    pipPosition: 'bottom-right',
    pipSize: 'medium',
    pipShape: 'circle',
  };
  private overlayImage: HTMLImageElement | null = null;
  private overlayOptions: OverlayOptions = {
    opacity: 1,
    position: 'center',
    scale: 0.5,
  };

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;
  }

  setWebcamVideo(video: HTMLVideoElement | null) {
    this.webcamVideo = video;
  }

  setScreenVideo(video: HTMLVideoElement | null) {
    this.screenVideo = video;
  }

  setLayout(layout: LayoutMode) {
    this.layout = layout;
  }

  setOptions(options: Partial<CompositorOptions>) {
    this.options = { ...this.options, ...options };
  }

  async setOverlayImage(imageUrl: string | null): Promise<void> {
    if (!imageUrl) {
      this.overlayImage = null;
      return;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.overlayImage = img;
        resolve();
      };
      img.onerror = () => {
        reject(new Error('Failed to load overlay image'));
      };
      img.src = imageUrl;
    });
  }

  clearOverlay(): void {
    this.overlayImage = null;
  }

  setOverlayOptions(options: Partial<OverlayOptions>): void {
    this.overlayOptions = { ...this.overlayOptions, ...options };
  }

  getOverlayImage(): HTMLImageElement | null {
    return this.overlayImage;
  }

  start() {
    if (this.animationId !== null) return;
    this.renderLoop();
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private renderLoop = () => {
    this.renderFrame();
    this.animationId = requestAnimationFrame(this.renderLoop);
  };

  private renderFrame() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    switch (this.layout) {
      case 'face_card':
        this.drawWebcamFullFrame();
        this.drawNameCard();
        break;
      case 'face_only':
        this.drawWebcamFullFrame();
        break;
      case 'screen_pip':
        this.drawScreenFullFrame();
        this.drawWebcamPIP();
        break;
    }

    // Draw overlay on top of everything
    this.drawOverlay();
  }

  private drawVideoFullFrame(video: HTMLVideoElement | null) {
    if (!video || video.readyState < 2) return;

    const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
    const videoAspect = video.videoWidth / video.videoHeight;

    let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

    if (videoAspect > canvasAspect) {
      sw = video.videoHeight * canvasAspect;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / canvasAspect;
      sy = (video.videoHeight - sh) / 2;
    }

    this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private drawWebcamFullFrame() {
    this.drawVideoFullFrame(this.webcamVideo);
  }

  private drawScreenFullFrame() {
    this.drawVideoFullFrame(this.screenVideo);
  }

  private drawWebcamPIP() {
    if (!this.webcamVideo || this.webcamVideo.readyState < 2) return;

    const size = PIP_SIZES[this.options.pipSize];
    const pos = this.getPIPPosition(size);
    const isCircle = this.options.pipShape === 'circle';

    this.ctx.save();
    this.ctx.beginPath();

    if (isCircle) {
      const radius = size / 2;
      this.ctx.arc(pos.x + radius, pos.y + radius, radius, 0, Math.PI * 2);
    } else {
      this.roundRect(pos.x, pos.y, size, size, 16);
    }
    this.ctx.clip();

    // Crop video to square (1:1 aspect ratio) from center
    const videoSize = Math.min(this.webcamVideo.videoWidth, this.webcamVideo.videoHeight);
    const sx = (this.webcamVideo.videoWidth - videoSize) / 2;
    const sy = (this.webcamVideo.videoHeight - videoSize) / 2;

    this.ctx.drawImage(this.webcamVideo, sx, sy, videoSize, videoSize, pos.x, pos.y, size, size);

    this.ctx.restore();

    // Draw border
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    if (isCircle) {
      const radius = size / 2;
      this.ctx.arc(pos.x + radius, pos.y + radius, radius, 0, Math.PI * 2);
    } else {
      this.roundRect(pos.x, pos.y, size, size, 16);
    }
    this.ctx.stroke();
  }

  private getPIPPosition(diameter: number): { x: number; y: number } {
    switch (this.options.pipPosition) {
      case 'top-left':
        return { x: PIP_MARGIN, y: PIP_MARGIN };
      case 'top-right':
        return { x: CANVAS_WIDTH - diameter - PIP_MARGIN, y: PIP_MARGIN };
      case 'bottom-left':
        return { x: PIP_MARGIN, y: CANVAS_HEIGHT - diameter - PIP_MARGIN };
      case 'bottom-right':
      default:
        return { x: CANVAS_WIDTH - diameter - PIP_MARGIN, y: CANVAS_HEIGHT - diameter - PIP_MARGIN };
    }
  }

  private drawNameCard() {
    const { nameCardText, nameCardTitle } = this.options;
    if (!nameCardText && !nameCardTitle) return;

    const padding = 24;
    const nameSize = 42;
    const titleSize = 28;
    const lineSpacing = 8;

    this.ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    const nameWidth = this.ctx.measureText(nameCardText).width;

    this.ctx.font = `${titleSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
    const titleWidth = this.ctx.measureText(nameCardTitle).width;

    const cardWidth = Math.max(nameWidth, titleWidth) + padding * 2;
    let cardHeight = padding * 2;
    if (nameCardText) cardHeight += nameSize;
    if (nameCardText && nameCardTitle) cardHeight += lineSpacing;
    if (nameCardTitle) cardHeight += titleSize;

    const cardX = PIP_MARGIN;
    const cardY = CANVAS_HEIGHT - cardHeight - PIP_MARGIN;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.beginPath();
    this.roundRect(cardX, cardY, cardWidth, cardHeight, 12);
    this.ctx.fill();

    let textY = cardY + padding;

    if (nameCardText) {
      this.ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      this.ctx.fillStyle = '#fff';
      textY += nameSize;
      this.ctx.fillText(nameCardText, cardX + padding, textY - 8);
    }

    if (nameCardTitle) {
      if (nameCardText) textY += lineSpacing;
      this.ctx.font = `${titleSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      textY += titleSize;
      this.ctx.fillText(nameCardTitle, cardX + padding, textY - 8);
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  private drawOverlay(): void {
    if (!this.overlayImage) return;

    const { opacity, position, scale } = this.overlayOptions;
    const imgWidth = this.overlayImage.width * scale;
    const imgHeight = this.overlayImage.height * scale;

    // Calculate position
    let x: number, y: number;
    const margin = 32;

    switch (position) {
      case 'top-left':
        x = margin;
        y = margin;
        break;
      case 'top-right':
        x = CANVAS_WIDTH - imgWidth - margin;
        y = margin;
        break;
      case 'bottom-left':
        x = margin;
        y = CANVAS_HEIGHT - imgHeight - margin;
        break;
      case 'bottom-right':
        x = CANVAS_WIDTH - imgWidth - margin;
        y = CANVAS_HEIGHT - imgHeight - margin;
        break;
      case 'center':
      default:
        x = (CANVAS_WIDTH - imgWidth) / 2;
        y = (CANVAS_HEIGHT - imgHeight) / 2;
        break;
    }

    this.ctx.save();
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(this.overlayImage, x, y, imgWidth, imgHeight);
    this.ctx.restore();
  }
}
