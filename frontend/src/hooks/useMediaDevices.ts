import { useState, useCallback, useRef, useEffect } from 'react';

interface MediaDevicesState {
  webcamStream: MediaStream | null;
  screenStream: MediaStream | null;
  error: string | null;
  availableDevices: {
    videoInputs: MediaDeviceInfo[];
    audioInputs: MediaDeviceInfo[];
  };
  selectedVideoDeviceId: string | null;
  selectedAudioDeviceId: string | null;
}

export function useMediaDevices() {
  const [state, setState] = useState<MediaDevicesState>({
    webcamStream: null,
    screenStream: null,
    error: null,
    availableDevices: {
      videoInputs: [],
      audioInputs: [],
    },
    selectedVideoDeviceId: null,
    selectedAudioDeviceId: null,
  });

  const webcamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    try {
      // Need to request permission first to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(track => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      setState(prev => ({
        ...prev,
        availableDevices: { videoInputs, audioInputs },
        // Auto-select first device if not already selected
        selectedVideoDeviceId: prev.selectedVideoDeviceId || (videoInputs[0]?.deviceId ?? null),
        selectedAudioDeviceId: prev.selectedAudioDeviceId || (audioInputs[0]?.deviceId ?? null),
      }));
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }, []);

  // Set selected video device
  const setVideoDevice = useCallback((deviceId: string) => {
    setState(prev => ({ ...prev, selectedVideoDeviceId: deviceId }));
  }, []);

  // Set selected audio device
  const setAudioDevice = useCallback((deviceId: string) => {
    setState(prev => ({ ...prev, selectedAudioDeviceId: deviceId }));
  }, []);

  const requestWebcam = useCallback(async (videoDeviceId?: string, audioDeviceId?: string) => {
    try {
      if (webcamRef.current) {
        webcamRef.current.getTracks().forEach(track => track.stop());
      }

      const videoId = videoDeviceId || state.selectedVideoDeviceId;
      const audioId = audioDeviceId || state.selectedAudioDeviceId;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoId ? {
          deviceId: { exact: videoId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } : {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: audioId ? {
          deviceId: { exact: audioId },
        } : true,
      });

      webcamRef.current = stream;
      setState(prev => ({ ...prev, webcamStream: stream, error: null }));
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access webcam';
      setState(prev => ({ ...prev, error: message }));
      throw err;
    }
  }, [state.selectedVideoDeviceId, state.selectedAudioDeviceId]);

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

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

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
    enumerateDevices,
    setVideoDevice,
    setAudioDevice,
  };
}
