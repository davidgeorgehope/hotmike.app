import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { DndContext, DragEndEvent, useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface Position {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

interface DraggableOverlayProps {
  imageUrl: string | null;
  position: Position;
  onPositionChange: (position: Position) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  scale?: number;
  className?: string;
}

function DraggableItem({
  imageUrl,
  position,
  containerRef,
  scale = 0.4,
}: {
  imageUrl: string;
  position: Position;
  containerRef: React.RefObject<HTMLDivElement>;
  scale: number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: 'overlay',
  });

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      const containerWidth = containerRef.current?.clientWidth || 1920;
      const containerHeight = containerRef.current?.clientHeight || 1080;
      const maxWidth = containerWidth * scale;
      const maxHeight = containerHeight * scale;

      let width = img.width;
      let height = img.height;

      // Scale down if needed
      if (width > maxWidth) {
        height = height * (maxWidth / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = width * (maxHeight / height);
        height = maxHeight;
      }

      setDimensions({ width, height });
    };
  }, [imageUrl, containerRef, scale]);

  const containerWidth = containerRef.current?.clientWidth || 1;
  const containerHeight = containerRef.current?.clientHeight || 1;

  const left = (position.x / 100) * (containerWidth - dimensions.width);
  const top = (position.y / 100) * (containerHeight - dimensions.height);

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 100 : 10,
    touchAction: 'none',
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: isDragging ? 1.05 : 1,
      }}
      transition={{ duration: 0.2 }}
      className={cn(
        'select-none rounded-lg overflow-hidden',
        isDragging && 'ring-2 ring-primary shadow-lg'
      )}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Overlay"
        style={{ width: dimensions.width, height: dimensions.height }}
        className="pointer-events-none"
        draggable={false}
      />
      {!isDragging && (
        <div className="absolute inset-0 bg-transparent hover:bg-white/10 transition-colors" />
      )}
    </motion.div>
  );
}

export function DraggableOverlay({
  imageUrl,
  position,
  onPositionChange,
  containerRef,
  scale = 0.4,
  className,
}: DraggableOverlayProps) {
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { delta } = event;
      if (!containerRef.current) return;

      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // Calculate the image dimensions (similar to DraggableItem)
      const img = new Image();
      img.src = imageUrl || '';

      const maxWidth = containerWidth * scale;
      const maxHeight = containerHeight * scale;

      let imgWidth = img.width || maxWidth;
      let imgHeight = img.height || maxHeight;

      if (imgWidth > maxWidth) {
        imgHeight = imgHeight * (maxWidth / imgWidth);
        imgWidth = maxWidth;
      }
      if (imgHeight > maxHeight) {
        imgWidth = imgWidth * (maxHeight / imgHeight);
        imgHeight = maxHeight;
      }

      // Convert delta to percentage
      const deltaXPercent = (delta.x / (containerWidth - imgWidth)) * 100;
      const deltaYPercent = (delta.y / (containerHeight - imgHeight)) * 100;

      // Calculate new position, clamped to 0-100
      const newX = Math.max(0, Math.min(100, position.x + deltaXPercent));
      const newY = Math.max(0, Math.min(100, position.y + deltaYPercent));

      onPositionChange({ x: newX, y: newY });
    },
    [containerRef, imageUrl, position, onPositionChange, scale]
  );

  if (!imageUrl) return null;

  return (
    <div className={cn('absolute inset-0 pointer-events-none', className)}>
      <DndContext onDragEnd={handleDragEnd}>
        <div className="pointer-events-auto">
          <DraggableItem
            imageUrl={imageUrl}
            position={position}
            containerRef={containerRef}
            scale={scale}
          />
        </div>
      </DndContext>
    </div>
  );
}
