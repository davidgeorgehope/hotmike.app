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
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-700 bg-gray-800/80">
        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-gray-300">Live Transcript</span>
      </div>

      <div
        ref={containerRef}
        className="p-4 overflow-y-auto"
        style={{ maxHeight }}
      >
        {transcript.length === 0 ? (
          <div className="flex items-center justify-center h-16 text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span>Waiting for speech...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {transcript.map((segment) => (
              <p key={segment.id} className="text-base text-gray-200 leading-relaxed">
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
