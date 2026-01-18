import { useAI } from '../contexts/AIContext';

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
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Suggestion display */}
          <div className="flex-1 min-w-0">
            {currentSuggestion ? (
              <div className="flex items-center gap-3">
                {currentSuggestion.imageUrl ? (
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 border border-gray-600">
                    <img
                      src={currentSuggestion.imageUrl}
                      alt="Suggestion preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : currentSuggestion.searchQuery ? (
                  <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 text-xs border border-gray-600 flex-shrink-0 text-center p-1">
                    {isGenerating ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-[10px]">Generating</span>
                      </div>
                    ) : (
                      <span className="text-[10px] leading-tight">Press 4 to generate</span>
                    )}
                  </div>
                ) : null}
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
              disabled={!currentSuggestion || isGenerating}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                currentSuggestion && !isGenerating
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <kbd className="px-1.5 py-0.5 bg-black/30 rounded text-xs">4</kbd>
                  Insert
                </>
              )}
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
