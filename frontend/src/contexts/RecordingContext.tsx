import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { preferencesApi, Preferences } from '../lib/api';
import { LayoutMode, PIPPosition, PIPSize } from '../lib/compositor';

interface RecordingContextType {
  layout: LayoutMode;
  setLayout: (layout: LayoutMode) => void;
  nameCardText: string;
  setNameCardText: (text: string) => void;
  nameCardTitle: string;
  setNameCardTitle: (title: string) => void;
  pipPosition: PIPPosition;
  setPipPosition: (pos: PIPPosition) => void;
  pipSize: PIPSize;
  setPipSize: (size: PIPSize) => void;
  isPreferencesLoaded: boolean;
}

const RecordingContext = createContext<RecordingContextType | null>(null);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [layout, setLayout] = useState<LayoutMode>('face_only');
  const [nameCardText, setNameCardTextState] = useState('');
  const [nameCardTitle, setNameCardTitleState] = useState('');
  const [pipPosition, setPipPositionState] = useState<PIPPosition>('bottom-right');
  const [pipSize, setPipSizeState] = useState<PIPSize>('medium');
  const [isPreferencesLoaded, setIsPreferencesLoaded] = useState(false);

  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (token) {
      preferencesApi.get(token)
        .then((prefs: Preferences) => {
          setNameCardTextState(prefs.name_card_text);
          setNameCardTitleState(prefs.name_card_title);
          setPipPositionState(prefs.pip_position as PIPPosition);
          setPipSizeState(prefs.pip_size as PIPSize);
          setIsPreferencesLoaded(true);
        })
        .catch(() => {
          setIsPreferencesLoaded(true);
        });
    }
  }, [token]);

  const savePreferences = useCallback((prefs: Partial<Preferences>) => {
    if (!token) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      preferencesApi.update(token, prefs).catch(console.error);
    }, 500);
  }, [token]);

  const setNameCardText = useCallback((text: string) => {
    setNameCardTextState(text);
    savePreferences({ name_card_text: text });
  }, [savePreferences]);

  const setNameCardTitle = useCallback((title: string) => {
    setNameCardTitleState(title);
    savePreferences({ name_card_title: title });
  }, [savePreferences]);

  const setPipPosition = useCallback((pos: PIPPosition) => {
    setPipPositionState(pos);
    savePreferences({ pip_position: pos });
  }, [savePreferences]);

  const setPipSize = useCallback((size: PIPSize) => {
    setPipSizeState(size);
    savePreferences({ pip_size: size });
  }, [savePreferences]);

  return (
    <RecordingContext.Provider value={{
      layout,
      setLayout,
      nameCardText,
      setNameCardText,
      nameCardTitle,
      setNameCardTitle,
      pipPosition,
      setPipPosition,
      pipSize,
      setPipSize,
      isPreferencesLoaded,
    }}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}
