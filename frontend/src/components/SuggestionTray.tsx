import { useAI } from '../contexts/AIContext';

interface SuggestionTrayProps {
  onInsert: () => void;
  onClear: () => void;
  hasOverlay: boolean;
}

export function SuggestionTray({ onInsert, onClear, hasOverlay }: SuggestionTrayProps) {
  const {
    suggestions,
    currentSuggestionIndex,
    getCurrentSuggestion,
    nextSuggestion,
    dismissSuggestion,
  } = useAI();

  const currentSuggestion = getCurrentSuggestion();

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Suggestion display */}
          <div className="flex-1 min-w-0">
            {currentSuggestion ? (
              <div className="flex items-center gap-3">
                {currentSuggestion.imageUrl && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                    <img
                      src={currentSuggestion.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">
                    {currentSuggestion.text}
                  </p>
                  <p className="text-sm text-gray-400">
                    {currentSuggestion.source === 'ai' && 'AI Suggestion'}
                    {currentSuggestion.source === 'manual' && 'Manual Overlay'}
                    {currentSuggestion.source === 'prebaked' && 'From Talk Track'}
                    {suggestions.length > 1 && (
                      <span className="ml-2">
                        ({currentSuggestionIndex + 1}/{suggestions.length})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">
                {hasOverlay ? 'Overlay active - press [5] to clear' : 'No suggestions available'}
              </p>
            )}
          </div>

          {/* Hotkey buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onInsert}
              disabled={!currentSuggestion}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                currentSuggestion
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs">4</kbd>
              Insert
            </button>

            <button
              onClick={nextSuggestion}
              disabled={suggestions.length <= 1}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                suggestions.length > 1
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs">Tab</kbd>
              Next
            </button>

            <button
              onClick={() => currentSuggestion && dismissSuggestion(currentSuggestion.id)}
              disabled={!currentSuggestion}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                currentSuggestion
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs">`</kbd>
              Dismiss
            </button>

            <button
              onClick={onClear}
              disabled={!hasOverlay}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                hasOverlay
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs">5</kbd>
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
