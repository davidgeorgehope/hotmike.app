import { useState, useCallback, useRef } from 'react';

interface RecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  recordedBlob: Blob | null;
}

interface UseMediaRecorderOptions {
  onStop?: (blob: Blob, duration: number) => void;
}

export function useMediaRecorder(options: UseMediaRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    recordedBlob: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const createCombinedStream = useCallback((
    canvas: HTMLCanvasElement,
    webcamStream: MediaStream | null,
    screenStream: MediaStream | null
  ): MediaStream => {
    const canvasStream = canvas.captureStream(30);
    const videoTracks = canvasStream.getVideoTracks();

    audioContextRef.current = new AudioContext();
    const dest = audioContextRef.current.createMediaStreamDestination();

    if (webcamStream) {
      const webcamAudioTracks = webcamStream.getAudioTracks();
      if (webcamAudioTracks.length > 0) {
        const webcamAudioStream = new MediaStream(webcamAudioTracks);
        const webcamSource = audioContextRef.current.createMediaStreamSource(webcamAudioStream);
        webcamSource.connect(dest);
      }
    }

    if (screenStream) {
      const screenAudioTracks = screenStream.getAudioTracks();
      if (screenAudioTracks.length > 0) {
        const screenAudioStream = new MediaStream(screenAudioTracks);
        const screenSource = audioContextRef.current.createMediaStreamSource(screenAudioStream);
        screenSource.connect(dest);
      }
    }

    return new MediaStream([
      ...videoTracks,
      ...dest.stream.getAudioTracks(),
    ]);
  }, []);

  const startRecording = useCallback((
    canvas: HTMLCanvasElement,
    webcamStream: MediaStream | null,
    screenStream: MediaStream | null
  ) => {
    chunksRef.current = [];

    const combinedStream = createCombinedStream(canvas, webcamStream, screenStream);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 5000000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const finalDuration = (Date.now() - startTimeRef.current) / 1000;

      setState(prev => ({
        ...prev,
        isRecording: false,
        isPaused: false,
        recordedBlob: blob,
      }));

      if (options.onStop) {
        options.onStop(blob, finalDuration);
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };

    recorderRef.current = recorder;
    recorder.start(1000);

    startTimeRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      setState(prev => ({
        ...prev,
        duration: (Date.now() - startTimeRef.current) / 1000,
      }));
    }, 100);

    setState(prev => ({
      ...prev,
      isRecording: true,
      isPaused: false,
      duration: 0,
      recordedBlob: null,
    }));
  }, [createCombinedStream, options]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.pause();
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'paused') {
      recorderRef.current.resume();
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, []);

  const clearRecording = useCallback(() => {
    setState(prev => ({ ...prev, recordedBlob: null, duration: 0 }));
    chunksRef.current = [];
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  };
}
