import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRecording } from '../contexts/RecordingContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { Compositor, LayoutMode } from '../lib/compositor';
import { recordingsApi } from '../lib/api';

type Mode = 'setup' | 'recording' | 'preview';

export function RecordPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const {
    layout, setLayout,
    nameCardText, setNameCardText,
    nameCardTitle, setNameCardTitle,
    pipPosition, setPipPosition,
    pipSize, setPipSize,
  } = useRecording();

  const { webcamStream, screenStream, requestWebcam, requestScreen, stopAll, error: mediaError } = useMediaDevices();
  const { duration, recordedBlob, startRecording, stopRecording, clearRecording } = useMediaRecorder();

  const [mode, setMode] = useState<Mode>('setup');
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const compositorRef = useRef<Compositor | null>(null);

  useEffect(() => {
    if (canvasRef.current && !compositorRef.current) {
      compositorRef.current = new Compositor(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    if (compositorRef.current) {
      compositorRef.current.setLayout(layout);
    }
  }, [layout]);

  useEffect(() => {
    if (compositorRef.current) {
      compositorRef.current.setOptions({ nameCardText, nameCardTitle, pipPosition, pipSize });
    }
  }, [nameCardText, nameCardTitle, pipPosition, pipSize]);

  useEffect(() => {
    if (webcamVideoRef.current && webcamStream) {
      webcamVideoRef.current.srcObject = webcamStream;
      webcamVideoRef.current.play();
      if (compositorRef.current) {
        compositorRef.current.setWebcamVideo(webcamVideoRef.current);
      }
    }
  }, [webcamStream]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
      screenVideoRef.current.play();
      if (compositorRef.current) {
        compositorRef.current.setScreenVideo(screenVideoRef.current);
      }
    } else if (compositorRef.current) {
      compositorRef.current.setScreenVideo(null);
    }
  }, [screenStream]);

  useEffect(() => {
    if (recordedBlob && previewVideoRef.current) {
      previewVideoRef.current.src = URL.createObjectURL(recordedBlob);
      setMode('preview');
    }
  }, [recordedBlob]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode !== 'recording') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1':
          setLayout('face_card');
          break;
        case '2':
          setLayout('face_only');
          break;
        case '3':
          setLayout('screen_pip');
          break;
        case 'Escape':
          handleStopRecording();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, setLayout]);

  const handleStartRecording = useCallback(() => {
    if (!canvasRef.current) return;
    compositorRef.current?.start();
    startRecording(canvasRef.current, webcamStream, screenStream);
    setMode('recording');
  }, [webcamStream, screenStream, startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    compositorRef.current?.stop();
  }, [stopRecording]);

  const handleSave = async () => {
    if (!token || !recordedBlob) return;
    setIsSaving(true);
    setSaveError('');

    try {
      await recordingsApi.upload(token, recordedBlob, title || 'Untitled Recording', duration);
      clearRecording();
      stopAll();
      navigate('/library');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save recording');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'recording'}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDiscard = () => {
    clearRecording();
    setMode('setup');
    setTitle('');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-bold">HotMike</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/library')}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Library
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="hidden">
        <video ref={webcamVideoRef} muted playsInline />
        <video ref={screenVideoRef} muted playsInline />
      </div>

      <main className="p-6">
        {mode === 'setup' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-semibold">Setup Recording</h2>

            {mediaError && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
                {mediaError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Media Sources</h3>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={requestWebcam}
                    className={`px-4 py-3 rounded-lg border ${
                      webcamStream
                        ? 'bg-green-600 border-green-500'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {webcamStream ? 'Webcam Connected' : 'Connect Webcam'}
                  </button>
                  <button
                    onClick={requestScreen}
                    className={`px-4 py-3 rounded-lg border ${
                      screenStream
                        ? 'bg-green-600 border-green-500'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {screenStream ? 'Screen Connected' : 'Share Screen'}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Name Card</h3>
                <input
                  type="text"
                  value={nameCardText}
                  onChange={(e) => setNameCardText(e.target.value)}
                  placeholder="Your Name"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={nameCardTitle}
                  onChange={(e) => setNameCardTitle(e.target.value)}
                  placeholder="Your Title"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">Layout</h3>
              <div className="flex gap-3">
                {(['face_card', 'face_only', 'screen_pip'] as LayoutMode[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    className={`px-4 py-2 rounded-lg border ${
                      layout === l
                        ? 'bg-blue-600 border-blue-500'
                        : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    {l === 'face_card' && '1: Face + Card'}
                    {l === 'face_only' && '2: Face Only'}
                    {l === 'screen_pip' && '3: Screen + PIP'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">PIP Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Position</label>
                  <select
                    value={pipPosition}
                    onChange={(e) => setPipPosition(e.target.value as typeof pipPosition)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Size</label>
                  <select
                    value={pipSize}
                    onChange={(e) => setPipSize(e.target.value as typeof pipSize)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={handleStartRecording}
                disabled={!webcamStream}
                className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-lg font-medium"
              >
                Start Recording
              </button>
            </div>
          </div>
        )}

        {mode === 'recording' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xl font-mono">{formatDuration(duration)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>Press 1/2/3 to switch layouts</span>
                <span>|</span>
                <span>Esc to stop</span>
              </div>
            </div>

            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="w-full h-full"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {(['face_card', 'face_only', 'screen_pip'] as LayoutMode[]).map((l, i) => (
                  <button
                    key={l}
                    onClick={() => setLayout(l)}
                    className={`px-3 py-1 rounded text-sm ${
                      layout === l
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button
                onClick={handleStopRecording}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium"
              >
                Stop Recording
              </button>
            </div>
          </div>
        )}

        {mode === 'preview' && recordedBlob && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl font-semibold">Recording Complete</h2>

            {saveError && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
                {saveError}
              </div>
            )}

            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={previewVideoRef}
                controls
                className="w-full h-full"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your recording a title"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium"
              >
                {isSaving ? 'Saving...' : 'Save to Library'}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium"
              >
                Download
              </button>
              <button
                onClick={handleDiscard}
                className="px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium text-gray-400"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
