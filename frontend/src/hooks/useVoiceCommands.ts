import { useEffect, useCallback, useRef } from 'react';
import { useAI } from '../contexts/AIContext';

export type VoiceCommand = 'show' | 'next' | 'clear' | 'dismiss';

interface VoiceCommandCallbacks {
  onShow?: () => void;
  onNext?: () => void;
  onClear?: () => void;
  onDismiss?: () => void;
}

// Wake word patterns
const WAKE_WORD_PATTERNS: Record<VoiceCommand, RegExp[]> = {
  show: [
    /hey\s*mike[,.]?\s*(show\s*that|insert|add)/i,
    /hey\s*mike[,.]?\s*show/i,
    /mike[,.]?\s*show\s*that/i,
  ],
  next: [
    /hey\s*mike[,.]?\s*next/i,
    /mike[,.]?\s*next\s*(one|suggestion)?/i,
  ],
  clear: [
    /hey\s*mike[,.]?\s*clear/i,
    /mike[,.]?\s*clear\s*(that|it|overlay)?/i,
    /hey\s*mike[,.]?\s*remove/i,
  ],
  dismiss: [
    /hey\s*mike[,.]?\s*dismiss/i,
    /mike[,.]?\s*dismiss/i,
    /hey\s*mike[,.]?\s*skip/i,
    /mike[,.]?\s*skip\s*(that|it)?/i,
  ],
};

export function useVoiceCommands(
  enabled: boolean,
  callbacks: VoiceCommandCallbacks
) {
  const { transcript, getRecentTranscript } = useAI();
  const lastProcessedIndex = useRef(0);
  const cooldownRef = useRef(false);

  const detectCommand = useCallback((text: string): VoiceCommand | null => {
    for (const [command, patterns] of Object.entries(WAKE_WORD_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          return command as VoiceCommand;
        }
      }
    }
    return null;
  }, []);

  const executeCommand = useCallback((command: VoiceCommand) => {
    // Prevent rapid fire commands
    if (cooldownRef.current) return;
    cooldownRef.current = true;
    setTimeout(() => {
      cooldownRef.current = false;
    }, 2000); // 2 second cooldown between commands

    switch (command) {
      case 'show':
        callbacks.onShow?.();
        break;
      case 'next':
        callbacks.onNext?.();
        break;
      case 'clear':
        callbacks.onClear?.();
        break;
      case 'dismiss':
        callbacks.onDismiss?.();
        break;
    }
  }, [callbacks]);

  useEffect(() => {
    if (!enabled) {
      lastProcessedIndex.current = transcript.length;
      return;
    }

    // Check new transcript segments
    if (transcript.length > lastProcessedIndex.current) {
      const newSegments = transcript.slice(lastProcessedIndex.current);
      lastProcessedIndex.current = transcript.length;

      // Check recent transcript window for commands
      const recentText = newSegments.map(s => s.text).join(' ');
      const command = detectCommand(recentText);

      if (command) {
        executeCommand(command);
      }
    }
  }, [enabled, transcript, detectCommand, executeCommand]);

  // Also check the rolling window periodically
  useEffect(() => {
    if (!enabled) return;

    const checkWindow = () => {
      const recentText = getRecentTranscript(5000); // Last 5 seconds
      const command = detectCommand(recentText);
      if (command) {
        executeCommand(command);
      }
    };

    // Don't check immediately to avoid double-triggering
    const interval = setInterval(checkWindow, 3000);
    return () => clearInterval(interval);
  }, [enabled, getRecentTranscript, detectCommand, executeCommand]);

  return {
    isEnabled: enabled,
  };
}
