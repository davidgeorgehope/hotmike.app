export type WebSocketMessageType =
  | 'connected'
  | 'pong'
  | 'transcription'
  | 'suggestion'
  | 'no_suggestion'
  | 'visual_moments'
  | 'rate_limited'
  | 'rate_limits'
  | 'error';

export interface WebSocketMessage {
  type: WebSocketMessageType;
  [key: string]: unknown;
}

export interface TranscriptionMessage extends WebSocketMessage {
  type: 'transcription';
  text: string;
  chunk_id?: string;
}

export interface SuggestionMessage extends WebSocketMessage {
  type: 'suggestion';
  suggestion: {
    suggestion_text: string;
    search_query: string;
    reasoning: string;
  };
}

export interface RateLimitedMessage extends WebSocketMessage {
  type: 'rate_limited';
  reason: string;
  message: string;
  retry_after_seconds: number | null;
}

export interface RateLimitsMessage extends WebSocketMessage {
  type: 'rate_limits';
  minute_remaining: number;
  minute_limit: number;
  session_remaining: number | null;
  session_limit: number | null;
}

export interface VisualMoment {
  text_snippet: string;
  suggestion: string;
  search_query: string;
  importance: 'high' | 'medium' | 'low';
}

export interface VisualMomentsMessage extends WebSocketMessage {
  type: 'visual_moments';
  moments: VisualMoment[];
}

type MessageHandler = (message: WebSocketMessage) => void;

export class TranscriptionWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private sessionId: string;
  private handlers: Map<WebSocketMessageType, Set<MessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: number | null = null;
  private isConnecting = false;

  constructor(token: string, sessionId: string) {
    this.token = token;
    this.sessionId = sessionId;

    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = `${protocol}//${host}/ws/transcription?token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId)}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          console.error('WebSocket error:', error);
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          this.stopPing();

          if (event.code !== 1000 && event.code !== 4001) {
            // Try to reconnect on unexpected close
            this.attemptReconnect();
          }
        };
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
    });
  }

  private handleMessage(message: WebSocketMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }

    // Also trigger 'all' handlers
    const allHandlers = this.handlers.get('error'); // Use a common type for all
    // Actually, let's add a generic handler approach
  }

  on(type: WebSocketMessageType, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  off(type: WebSocketMessageType, handler: MessageHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private startPing(): void {
    this.pingInterval = window.setInterval(() => {
      this.send({ type: 'ping', timestamp: Date.now() });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => {
      console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.connect().catch(() => {
        // Will retry via onclose
      });
    }, delay);
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  sendAudioChunk(audioBase64: string, mimeType: string = 'audio/webm', chunkId?: string): void {
    this.send({
      type: 'audio_chunk',
      audio: audioBase64,
      mime_type: mimeType,
      chunk_id: chunkId,
    });
  }

  requestSuggestion(transcript: string, context?: string): void {
    this.send({
      type: 'request_suggestion',
      transcript,
      context,
    });
  }

  getRateLimits(): void {
    this.send({ type: 'get_rate_limits' });
  }

  detectMoments(transcriptWindow: string): void {
    this.send({
      type: 'detect_moments',
      transcript_window: transcriptWindow,
    });
  }

  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
    }
    this.handlers.clear();
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
