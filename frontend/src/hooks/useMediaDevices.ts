import { useState, useCallback, useRef, useEffect } from 'react';

interface MediaDevicesState {
  webcamStream: MediaStream | null;
  screenStream: MediaStream | null;
  error: string | null;
}

export function useMediaDevices() {
  const [state, setState] = useState<MediaDevicesState>({
    webcamStream: null,
    screenStream: null,
    error: null,
  });

  const webcamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  const requestWebcam = useCallback(async () => {
    try {
      if (webcamRef.current) {
        webcamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      webcamRef.current = stream;
      setState(prev => ({ ...prev, webcamStream: stream, error: null }));
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access webcam';
      setState(prev => ({ ...prev, error: message }));
      throw err;
    }
  }, []);

  const requestScreen = useCallback(async () => {
    try {
      if (screenRef.current) {
        screenRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        screenRef.current = null;
        setState(prev => ({ ...prev, screenStream: null }));
      });

      screenRef.current = stream;
      setState(prev => ({ ...prev, screenStream: stream, error: null }));
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share screen';
      setState(prev => ({ ...prev, error: message }));
      throw err;
    }
  }, []);

  const stopWebcam = useCallback(() => {
    if (webcamRef.current) {
      webcamRef.current.getTracks().forEach(track => track.stop());
      webcamRef.current = null;
      setState(prev => ({ ...prev, webcamStream: null }));
    }
  }, []);

  const stopScreen = useCallback(() => {
    if (screenRef.current) {
      screenRef.current.getTracks().forEach(track => track.stop());
      screenRef.current = null;
      setState(prev => ({ ...prev, screenStream: null }));
    }
  }, []);

  const stopAll = useCallback(() => {
    stopWebcam();
    stopScreen();
  }, [stopWebcam, stopScreen]);

  useEffect(() => {
    return () => {
      webcamRef.current?.getTracks().forEach(track => track.stop());
      screenRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  return {
    ...state,
    requestWebcam,
    requestScreen,
    stopWebcam,
    stopScreen,
    stopAll,
  };
}
