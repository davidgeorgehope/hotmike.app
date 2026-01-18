import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AIStatus, aiApi } from '../lib/api';

export interface Suggestion {
  id: string;
  text: string;
  imageUrl?: string;
  searchQuery?: string;
  source: 'ai' | 'manual' | 'prebaked';
  timestamp: number;
}

export interface TranscriptSegment {
  id: string;
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  timestamp: number;
}

interface AIContextType {
  aiStatus: AIStatus | null;
  isAIAvailable: boolean;
  isLoading: boolean;
  error: string | null;

  // Suggestions
  suggestions: Suggestion[];
  currentSuggestionIndex: number;
  addSuggestion: (suggestion: Omit<Suggestion, 'id' | 'timestamp'>) => void;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
  nextSuggestion: () => void;
  prevSuggestion: () => void;
  clearSuggestions: () => void;
  getCurrentSuggestion: () => Suggestion | null;

  // Transcript
  transcript: TranscriptSegment[];
  addTranscriptSegment: (segment: Omit<TranscriptSegment, 'id' | 'timestamp'>) => void;
  clearTranscript: () => void;
  getRecentTranscript: (windowMs?: number) => string;

  // Session
  sessionId: string | null;
  startSession: () => void;
  endSession: () => void;
}

const AIContext = createContext<AIContextType | null>(null);

let suggestionIdCounter = 0;
let transcriptIdCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++suggestionIdCounter}`;
}

function generateTranscriptId(): string {
  return `transcript-${Date.now()}-${++transcriptIdCounter}`;
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function AIProvider({ children }: { children: ReactNode }) {
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);

  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Fetch AI status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await aiApi.getStatus();
        setAIStatus(status);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch AI status');
        setAIStatus({
          available: false,
          enabled: false,
          configured: false,
          rate_limits: { calls_per_minute: 0, calls_per_session: 0 },
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const isAIAvailable = aiStatus?.available ?? false;

  // Suggestion management
  const addSuggestion = useCallback((suggestion: Omit<Suggestion, 'id' | 'timestamp'>) => {
    const newSuggestion: Suggestion = {
      ...suggestion,
      id: generateId('suggestion'),
      timestamp: Date.now(),
    };
    setSuggestions((prev) => [...prev, newSuggestion]);
  }, []);

  const acceptSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setCurrentSuggestionIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    setCurrentSuggestionIndex((prev) => {
      const newLength = suggestions.length - 1;
      if (newLength === 0) return 0;
      return Math.min(prev, newLength - 1);
    });
  }, [suggestions.length]);

  const nextSuggestion = useCallback(() => {
    setCurrentSuggestionIndex((prev) =>
      suggestions.length > 0 ? (prev + 1) % suggestions.length : 0
    );
  }, [suggestions.length]);

  const prevSuggestion = useCallback(() => {
    setCurrentSuggestionIndex((prev) =>
      suggestions.length > 0 ? (prev - 1 + suggestions.length) % suggestions.length : 0
    );
  }, [suggestions.length]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setCurrentSuggestionIndex(0);
  }, []);

  const getCurrentSuggestion = useCallback((): Suggestion | null => {
    if (suggestions.length === 0) return null;
    return suggestions[currentSuggestionIndex] || null;
  }, [suggestions, currentSuggestionIndex]);

  // Transcript management
  const addTranscriptSegment = useCallback((segment: Omit<TranscriptSegment, 'id' | 'timestamp'>) => {
    const newSegment: TranscriptSegment = {
      ...segment,
      id: generateTranscriptId(),
      timestamp: Date.now(),
    };
    setTranscript((prev) => [...prev, newSegment]);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  const getRecentTranscript = useCallback((windowMs: number = 60000): string => {
    const cutoff = Date.now() - windowMs;
    return transcript
      .filter((s) => s.timestamp >= cutoff)
      .map((s) => s.text)
      .join(' ');
  }, [transcript]);

  // Session management
  const startSession = useCallback(() => {
    setSessionId(generateSessionId());
    clearSuggestions();
    clearTranscript();
  }, [clearSuggestions, clearTranscript]);

  const endSession = useCallback(() => {
    setSessionId(null);
  }, []);

  return (
    <AIContext.Provider
      value={{
        aiStatus,
        isAIAvailable,
        isLoading,
        error,
        suggestions,
        currentSuggestionIndex,
        addSuggestion,
        acceptSuggestion,
        dismissSuggestion,
        nextSuggestion,
        prevSuggestion,
        clearSuggestions,
        getCurrentSuggestion,
        transcript,
        addTranscriptSegment,
        clearTranscript,
        getRecentTranscript,
        sessionId,
        startSession,
        endSession,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
}
