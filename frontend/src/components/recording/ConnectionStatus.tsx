import { motion } from 'framer-motion';
import { Wifi, WifiOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  isAIAvailable: boolean;
  className?: string;
}

export function ConnectionStatus({ isConnected, isAIAvailable, className }: ConnectionStatusProps) {
  if (!isAIAvailable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="secondary" className={cn('gap-1.5', className)}>
              <WifiOff className="w-3 h-3" />
              AI Unavailable
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>AI features are not available in this session</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Badge
              variant="secondary"
              className={cn(
                'gap-1.5',
                isConnected ? 'bg-success/20 text-success border-success/30' : 'bg-warning/20 text-warning border-warning/30',
                className
              )}
            >
              <motion.div
                animate={!isConnected ? { opacity: [1, 0.4, 1] } : {}}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Wifi className="w-3 h-3" />
              </motion.div>
              {isConnected ? 'AI Connected' : 'Connecting...'}
            </Badge>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {isConnected
              ? 'Real-time transcription and AI suggestions are active'
              : 'Establishing connection to AI services...'}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
