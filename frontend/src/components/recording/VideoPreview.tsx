import { forwardRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface VideoPreviewProps {
  children?: ReactNode;
  className?: string;
  showFrameMarkers?: boolean;
}

export const VideoPreview = forwardRef<HTMLDivElement, VideoPreviewProps>(
  ({ children, className, showFrameMarkers = true }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-border',
          className
        )}
      >
        {children}

        {showFrameMarkers && (
          <>
            {/* Corner frame markers - broadcast style */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top-left corner */}
              <div className="absolute top-4 left-4">
                <div className="w-8 h-[2px] bg-white/70" />
                <div className="w-[2px] h-8 bg-white/70" />
              </div>

              {/* Top-right corner */}
              <div className="absolute top-4 right-4">
                <div className="w-8 h-[2px] bg-white/70 ml-auto" />
                <div className="w-[2px] h-8 bg-white/70 ml-auto" />
              </div>

              {/* Bottom-left corner */}
              <div className="absolute bottom-4 left-4">
                <div className="w-[2px] h-8 bg-white/70" />
                <div className="w-8 h-[2px] bg-white/70" />
              </div>

              {/* Bottom-right corner */}
              <div className="absolute bottom-4 right-4 flex flex-col items-end">
                <div className="w-[2px] h-8 bg-white/70 ml-auto" />
                <div className="w-8 h-[2px] bg-white/70" />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }
);

VideoPreview.displayName = 'VideoPreview';
