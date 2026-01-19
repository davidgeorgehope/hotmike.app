import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CountdownOverlayProps {
  isActive: boolean;
  onComplete: () => void;
  startFrom?: number;
}

export function CountdownOverlay({ isActive, onComplete, startFrom = 3 }: CountdownOverlayProps) {
  const [count, setCount] = useState(startFrom);

  useEffect(() => {
    if (!isActive) {
      setCount(startFrom);
      return;
    }

    if (count <= 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCount((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isActive, count, startFrom, onComplete]);

  if (!isActive || count <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 2, opacity: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.34, 1.56, 0.64, 1] // Spring-like easing
          }}
          className="flex flex-col items-center"
        >
          <span className="text-[200px] font-bold text-white leading-none tabular-nums">
            {count}
          </span>
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl text-white/60 mt-4"
          >
            {count === 1 ? 'Get ready...' : 'Starting soon...'}
          </motion.span>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
