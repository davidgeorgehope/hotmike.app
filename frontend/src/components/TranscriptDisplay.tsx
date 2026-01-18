import { useEffect, useRef } from 'react';
import { useAI } from '../contexts/AIContext';

interface TranscriptDisplayProps {
  className?: string;
  maxHeight?: string;
}

export function TranscriptDisplay({ className = '', maxHeight = '200px' }: TranscriptDisplayProps) {
  const { transcript, isAIAvailable } = useAI();
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new transcript arrives
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!isAIAvailable) {
    return (
      <div className={`bg-gray-800/50 rounded-lg p-3 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <span className="w-2 h-2 bg-gray-500 rounded-full" />
          <span>AI transcription unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800/50 rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm text-gray-400">Live Transcript</span>
      </div>

      <div
        ref={containerRef}
        className="p-3 overflow-y-auto text-sm"
        style={{ maxHeight }}
      >
        {transcript.length === 0 ? (
          <p className="text-gray-500 italic">Waiting for speech...</p>
        ) : (
          <div className="space-y-2">
            {transcript.map((segment) => (
              <p key={segment.id} className="text-gray-300">
                {segment.text}
                {segment.confidence !== undefined && segment.confidence < 0.8 && (
                  <span className="ml-2 text-xs text-gray-500">(low confidence)</span>
                )}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
