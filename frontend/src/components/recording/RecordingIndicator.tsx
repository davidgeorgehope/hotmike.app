import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface RecordingIndicatorProps {
  duration: string;
  className?: string;
}

export function RecordingIndicator({ duration, className }: RecordingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'absolute top-4 left-4 z-10 flex items-center gap-2 bg-recording/90 text-recording-foreground px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm',
        className
      )}
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [1, 0.7, 1],
        }}
        transition={{
          duration: 1,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="w-2.5 h-2.5 bg-white rounded-full"
      />
      <span className="font-semibold text-sm tracking-wide">REC</span>
      <span className="font-mono text-sm tabular-nums">{duration}</span>
    </motion.div>
  );
}
