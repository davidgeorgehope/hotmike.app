import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic } from 'lucide-react';
import { useAI } from '../contexts/AIContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TranscriptDisplayProps {
  className?: string;
  maxHeight?: string;
}

export function TranscriptDisplay({ className = '', maxHeight = '200px' }: TranscriptDisplayProps) {
  const { transcript, isAIAvailable } = useAI();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!isAIAvailable) {
    return (
      <Card className={cn('bg-card/50', className)}>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="w-2 h-2 bg-muted-foreground rounded-full" />
            <span>AI transcription unavailable</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="py-2 px-4 border-b border-border bg-card/80">
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-2 h-2 bg-success rounded-full"
          />
          <CardTitle className="text-sm font-medium text-muted-foreground">Live Transcript</CardTitle>
        </div>
      </CardHeader>

      <CardContent
        ref={containerRef}
        className="p-4 overflow-y-auto"
        style={{ maxHeight }}
      >
        <AnimatePresence mode="popLayout">
          {transcript.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-16 text-muted-foreground"
            >
              <div className="flex items-center gap-2">
                <Mic className="w-5 h-5 animate-pulse" />
                <span>Waiting for speech...</span>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {transcript.map((segment, index) => (
                <motion.p
                  key={segment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index === transcript.length - 1 ? 0.1 : 0 }}
                  className="text-base text-foreground leading-relaxed"
                >
                  {segment.text}
                  {segment.confidence !== undefined && segment.confidence < 0.8 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      low confidence
                    </Badge>
                  )}
                </motion.p>
              ))}
            </div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
