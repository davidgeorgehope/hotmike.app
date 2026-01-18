import { useEffect, useRef, useCallback, useState } from 'react';
import { useAI } from '../contexts/AIContext';

interface UseTranscriptionWebSocketOptions {
  enabled: boolean;
  sessionId: string | null;
}

interface Suggestion {
  suggestion_text?: string;
  search_query?: string;
  image_prompt?: string;
  reasoning?: string;
}

interface WebSocketMessage {
  type: 'transcription' | 'suggestion' | 'no_suggestion' | 'error' | 'connected' | 'pong' | 'rate_limited' | 'visual_moments' | 'rate_limits';
  text?: string;
  suggestion?: Suggestion;
  image_url?: string;
  chunk_id?: string;
  session_id?: string;
  ai_available?: boolean;
  message?: string;
  moments?: Array<{
    text_snippet: string;
    suggestion: string;
    search_query: string;
    image_prompt?: string;
    importance: string;
  }>;
}

export function useTranscriptionWebSocket({ enabled, sessionId }: UseTranscriptionWebSocketOptions) {
  const { addTranscriptSegment, addSuggestion } = useAI();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!sessionId || !enabled) return;

    // Get auth token from localStorage
    const token = localStorage.getItem('hotmike_token');
    if (!token) {
      console.error('[WebSocket] No auth token found');
      return;
    }

    // Build WebSocket URL - use correct backend endpoint
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/transcription?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected to transcription service');
        setIsConnected(true);

        // Start ping interval to keep connection alive
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data: WebSocketMessage = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              console.log('[WebSocket] Session confirmed, AI available:', data.ai_available);
              break;

            case 'pong':
              // Pong received, connection is alive
              break;

            case 'transcription':
              if (data.text) {
                addTranscriptSegment({
                  text: data.text,
                });
              }
              break;

            case 'suggestion':
              if (data.suggestion) {
                addSuggestion({
                  text: data.suggestion.suggestion_text || 'AI Suggestion',
                  imageUrl: data.image_url,
                  searchQuery: data.suggestion.search_query,
                  source: 'ai',
                });
              }
              break;

            case 'visual_moments':
              // Handle detected visual moments - add each as a suggestion
              if (data.moments && data.moments.length > 0) {
                for (const moment of data.moments) {
                  addSuggestion({
                    text: moment.suggestion,
                    searchQuery: moment.search_query,
                    source: 'ai',
                  });
                }
              }
              break;

            case 'no_suggestion':
              // No visual suggestion needed for this content
              break;

            case 'rate_limited':
              console.warn('[WebSocket] Rate limited:', data.message);
              break;

            case 'error':
              console.error('[WebSocket] Server error:', data.message);
              break;

            case 'rate_limits':
              // Rate limit info received
              break;

            default:
              console.warn('[WebSocket] Unknown message type:', data);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
      };

      ws.onclose = (event) => {
        console.log('[WebSocket] Disconnected:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Attempt reconnect if still enabled and session active
        if (enabled && sessionId && event.code !== 1000 && event.code !== 4001) {
          reconnectTimeoutRef.current = window.setTimeout(() => {
            console.log('[WebSocket] Attempting reconnect...');
            connect();
          }, 2000);
        }
      };
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
    }
  }, [enabled, sessionId, addTranscriptSegment, addSuggestion]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Recording stopped');
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const sendAudioChunk = useCallback((chunk: Blob) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convert blob to base64 and send as JSON message
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      // Extract base64 part after the data URL prefix
      const base64 = base64data.split(',')[1];

      wsRef.current?.send(JSON.stringify({
        type: 'audio_chunk',
        audio: base64,
        mime_type: chunk.type || 'audio/webm',
        chunk_id: crypto.randomUUID(),
      }));
    };
    reader.readAsDataURL(chunk);
  }, []);

  const requestSuggestion = useCallback((transcript: string, context?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'request_suggestion',
      transcript,
      context,
    }));
  }, []);

  const detectMoments = useCallback((transcriptWindow: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'detect_moments',
      transcript_window: transcriptWindow,
    }));
  }, []);

  // Connect when enabled and sessionId available
  useEffect(() => {
    if (enabled && sessionId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, sessionId, connect, disconnect]);

  return {
    isConnected,
    sendAudioChunk,
    requestSuggestion,
    detectMoments,
  };
}
