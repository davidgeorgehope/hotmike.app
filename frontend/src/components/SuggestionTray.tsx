import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAI } from '../contexts/AIContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface SuggestionTrayProps {
  onInsert: () => void;
  onClear: () => void;
  hasOverlay: boolean;
  isGenerating?: boolean;
}

export function SuggestionTray({ onInsert, onClear, hasOverlay, isGenerating = false }: SuggestionTrayProps) {
  const {
    suggestions,
    currentSuggestionIndex,
    getCurrentSuggestion,
    nextSuggestion,
    dismissSuggestion,
  } = useAI();

  const currentSuggestion = getCurrentSuggestion();

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 bg-card/95 border-t border-border backdrop-blur-sm z-40"
    >
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Suggestion display */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {currentSuggestion ? (
                <motion.div
                  key={currentSuggestion.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-3"
                >
                  {currentSuggestion.imageUrl ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.div
                            whileHover={{ scale: 1.1 }}
                            className="w-16 h-16 rounded-lg overflow-hidden bg-secondary flex-shrink-0 border border-border cursor-pointer"
                          >
                            <img
                              src={currentSuggestion.imageUrl}
                              alt="Suggestion preview"
                              className="w-full h-full object-cover"
                            />
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="p-0 border-0">
                          <img
                            src={currentSuggestion.imageUrl}
                            alt="Suggestion preview"
                            className="max-w-[300px] max-h-[200px] rounded-lg object-contain"
                          />
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : currentSuggestion.searchQuery ? (
                    <div className="w-16 h-16 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-xs border border-border flex-shrink-0 text-center p-1">
                      {isGenerating ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-[10px]">Generating</span>
                        </div>
                      ) : (
                        <span className="text-[10px] leading-tight">Press 4 to generate</span>
                      )}
                    </div>
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-foreground font-medium line-clamp-2" title={currentSuggestion.text}>
                      {currentSuggestion.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {currentSuggestion.source === 'ai' && 'AI Suggestion'}
                        {currentSuggestion.source === 'manual' && 'Manual Overlay'}
                        {currentSuggestion.source === 'prebaked' && 'From Talk Track'}
                      </Badge>
                      {suggestions.length > 1 && (
                        <span className="text-sm text-muted-foreground">
                          ({currentSuggestionIndex + 1}/{suggestions.length})
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-muted-foreground"
                >
                  {hasOverlay ? 'Overlay active - press [5] to clear' : 'No suggestions available'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Hotkey buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={onInsert}
              disabled={!currentSuggestion || isGenerating}
              className={cn(
                'gap-2',
                currentSuggestion && !isGenerating ? '' : 'opacity-50'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono">4</kbd>
                  Insert
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              onClick={nextSuggestion}
              disabled={suggestions.length <= 1}
              className="gap-2"
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono">Tab</kbd>
              Next
            </Button>

            <Button
              variant="secondary"
              onClick={() => currentSuggestion && dismissSuggestion(currentSuggestion.id)}
              disabled={!currentSuggestion}
              className="gap-2"
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono">`</kbd>
              Dismiss
            </Button>

            <Button
              variant="destructive"
              onClick={onClear}
              disabled={!hasOverlay}
              className="gap-2"
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono">5</kbd>
              Clear
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
