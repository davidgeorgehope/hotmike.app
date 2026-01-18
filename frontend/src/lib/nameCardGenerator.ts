/**
 * Canvas-based name card image generator
 * Creates a name card overlay image as a data URL for immediate use
 */

export interface NameCardOptions {
  name: string;
  title?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
}

const DEFAULT_OPTIONS: Required<Omit<NameCardOptions, 'name' | 'title'>> = {
  width: 400,
  height: 120,
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
  textColor: '#ffffff',
  accentColor: '#3b82f6',
};

export function generateNameCardImage(options: NameCardOptions): string {
  const {
    name,
    title,
    width,
    height,
    backgroundColor,
    textColor,
    accentColor,
  } = { ...DEFAULT_OPTIONS, ...options };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Draw rounded rectangle background
  const radius = 12;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.quadraticCurveTo(width, 0, width, radius);
  ctx.lineTo(width, height - radius);
  ctx.quadraticCurveTo(width, height, width - radius, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = backgroundColor;
  ctx.fill();

  // Draw accent bar on the left
  const accentWidth = 4;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(accentWidth, 0);
  ctx.lineTo(accentWidth, height);
  ctx.lineTo(radius, height);
  ctx.quadraticCurveTo(0, height, 0, height - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fill();

  // Calculate text positioning
  const padding = 24;
  const nameSize = 28;
  const titleSize = 16;
  const lineSpacing = 8;

  ctx.textBaseline = 'top';

  // Draw name
  ctx.fillStyle = textColor;
  ctx.font = `bold ${nameSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

  // Truncate name if too long
  let displayName = name;
  const maxTextWidth = width - padding * 2;
  while (ctx.measureText(displayName).width > maxTextWidth && displayName.length > 3) {
    displayName = displayName.slice(0, -4) + '...';
  }

  // Vertical centering
  const totalTextHeight = title
    ? nameSize + lineSpacing + titleSize
    : nameSize;
  const startY = (height - totalTextHeight) / 2;

  ctx.fillText(displayName, padding, startY);

  // Draw title if provided
  if (title) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = `${titleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

    let displayTitle = title;
    while (ctx.measureText(displayTitle).width > maxTextWidth && displayTitle.length > 3) {
      displayTitle = displayTitle.slice(0, -4) + '...';
    }

    ctx.fillText(displayTitle, padding, startY + nameSize + lineSpacing);
  }

  return canvas.toDataURL('image/png');
}
