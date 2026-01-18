import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRecording } from '../contexts/RecordingContext';
import { useAI } from '../contexts/AIContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useTranscriptionWebSocket } from '../hooks/useTranscriptionWebSocket';
import { Compositor, LayoutMode, PIPShape } from '../lib/compositor';
import { recordingsApi } from '../lib/api';
import { generateNameCardImage } from '../lib/nameCardGenerator';
import { VUMeter } from '../components/VUMeter';
import { ManualOverlayManager } from '../components/ManualOverlayManager';
import { TranscriptDisplay } from '../components/TranscriptDisplay';
import { SuggestionTray } from '../components/SuggestionTray';
import { TalkTrackInput } from '../components/TalkTrackInput';

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
    pipShape, setPipShape,
  } = useRecording();

  const { webcamStream, screenStream, requestWebcam, requestScreen, stopAll, error: mediaError } = useMediaDevices();
  const {
    isAIAvailable,
    suggestions,
    getCurrentSuggestion,
    addSuggestion,
    acceptSuggestion,
    dismissSuggestion,
    nextSuggestion,
    startSession,
    endSession,
    sessionId,
  } = useAI();

  const [mode, setMode] = useState<Mode>('setup');

  // WebSocket for real-time transcription
  const { sendAudioChunk, isConnected: wsConnected } = useTranscriptionWebSocket({
    enabled: mode === 'recording' && isAIAvailable,
    sessionId,
  });

  const { duration, recordedBlob, startRecording, stopRecording, clearRecording } = useMediaRecorder({
    onDataAvailable: sendAudioChunk,
  });
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showOverlayManager, setShowOverlayManager] = useState(false);
  const [showTalkTrackInput, setShowTalkTrackInput] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(false);
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
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
      compositorRef.current.setOptions({ nameCardText, nameCardTitle, pipPosition, pipSize, pipShape });
    }
  }, [nameCardText, nameCardTitle, pipPosition, pipSize, pipShape]);

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

  // Switch to preview mode when recording finishes
  useEffect(() => {
    if (recordedBlob) {
      setMode('preview');
    }
  }, [recordedBlob]);

  // Set up preview video after switching to preview mode
  useEffect(() => {
    if (mode === 'preview' && recordedBlob && previewVideoRef.current) {
      previewVideoRef.current.src = URL.createObjectURL(recordedBlob);
    }
  }, [mode, recordedBlob]);

  // Handle inserting current suggestion
  const handleInsertSuggestion = useCallback(async () => {
    const suggestion = getCurrentSuggestion();
    if (!suggestion || !compositorRef.current || isGeneratingImage) return;

    // Apply positioning if available on the suggestion
    if (suggestion.overlayPosition || suggestion.overlayScale) {
      compositorRef.current.setOverlayOptions({
        position: suggestion.overlayPosition || 'bottom-right',
        scale: suggestion.overlayScale || 0.4,
        opacity: 1,
      });
    }

    if (suggestion.imageUrl) {
      // Image exists - insert immediately
      try {
        await compositorRef.current.setOverlayImage(suggestion.imageUrl);
        setHasOverlay(true);
        acceptSuggestion(suggestion.id);
      } catch (err) {
        console.error('Failed to load overlay:', err);
      }
    } else if (suggestion.searchQuery) {
      // No image yet - generate one first
      setIsGeneratingImage(true);
      try {
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: suggestion.searchQuery }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.image_url && compositorRef.current) {
            // Apply returned positioning from API
            compositorRef.current.setOverlayOptions({
              position: data.position || 'bottom-right',
              scale: data.scale || 0.4,
              opacity: 1,
            });
            await compositorRef.current.setOverlayImage(data.image_url);
            setHasOverlay(true);
            acceptSuggestion(suggestion.id);
          }
        }
      } catch (err) {
        console.error('Failed to generate image:', err);
      } finally {
        setIsGeneratingImage(false);
      }
    }
  }, [getCurrentSuggestion, acceptSuggestion, isGeneratingImage]);

  // Handle clearing overlay
  const handleClearOverlay = useCallback(() => {
    if (compositorRef.current) {
      compositorRef.current.clearOverlay();
      setHasOverlay(false);
    }
  }, []);

  // Handle dismissing current suggestion
  const handleDismissSuggestion = useCallback(() => {
    const suggestion = getCurrentSuggestion();
    if (suggestion) {
      dismissSuggestion(suggestion.id);
    }
  }, [getCurrentSuggestion, dismissSuggestion]);

  // Voice commands integration
  useVoiceCommands(mode === 'recording' && voiceCommandsEnabled && isAIAvailable, {
    onShow: handleInsertSuggestion,
    onNext: nextSuggestion,
    onClear: handleClearOverlay,
    onDismiss: handleDismissSuggestion,
  });

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
        case '4':
          handleInsertSuggestion();
          break;
        case '5':
          handleClearOverlay();
          break;
        case 'Tab':
          e.preventDefault();
          nextSuggestion();
          break;
        case '`':
          const suggestion = getCurrentSuggestion();
          if (suggestion) {
            dismissSuggestion(suggestion.id);
          }
          break;
        case 'Escape':
          handleStopRecording();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, setLayout, handleInsertSuggestion, handleClearOverlay, nextSuggestion, dismissSuggestion, getCurrentSuggestion]);

  const handleStartRecording = useCallback(async () => {
    if (!canvasRef.current || isStartingRecording) return;

    setIsStartingRecording(true);

    // Pre-generate name card if name is set (before recording starts)
    let nameCardImageUrl: string | null = null;
    if (nameCardText) {
      if (isAIAvailable) {
        try {
          const response = await fetch('/api/generate-name-card', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: nameCardText,
              title: nameCardTitle || undefined,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.image_url) {
              nameCardImageUrl = data.image_url;
            }
          }
        } catch (err) {
          // Fallback to canvas generator if AI fails
          nameCardImageUrl = generateNameCardImage({
            name: nameCardText,
            title: nameCardTitle || undefined,
          });
        }
      }
      // Fallback if AI unavailable or didn't produce image
      if (!nameCardImageUrl) {
        nameCardImageUrl = generateNameCardImage({
          name: nameCardText,
          title: nameCardTitle || undefined,
        });
      }
    }

    // NOW start recording
    compositorRef.current?.start();
    startRecording(canvasRef.current, webcamStream, screenStream);
    startSession();

    // Add name card suggestion with pre-generated image
    if (nameCardText && nameCardImageUrl) {
      addSuggestion({
        text: `Name card: ${nameCardText}`,
        imageUrl: nameCardImageUrl,
        source: 'prebaked',
      });
    }

    setMode('recording');
    setIsStartingRecording(false);
  }, [webcamStream, screenStream, startRecording, startSession, nameCardText, nameCardTitle, addSuggestion, isAIAvailable, isStartingRecording]);

  // Set up display video when recording starts
  useEffect(() => {
    if (mode === 'recording' && displayVideoRef.current && canvasRef.current) {
      const canvasStream = canvasRef.current.captureStream(30);
      displayVideoRef.current.srcObject = canvasStream;
      displayVideoRef.current.play();
    }
  }, [mode]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
    compositorRef.current?.stop();
    compositorRef.current?.clearOverlay();
    setHasOverlay(false);
    endSession();
  }, [stopRecording, endSession]);

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

  const handleSelectOverlay = (overlayUrl: string) => {
    // Add the selected overlay to suggestions
    addSuggestion({
      text: 'Manual overlay',
      imageUrl: overlayUrl,
      source: 'manual',
    });
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
        <canvas ref={canvasRef} width={1920} height={1080} />
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
              <div className="grid grid-cols-3 gap-4">
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
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Shape</label>
                  <select
                    value={pipShape}
                    onChange={(e) => setPipShape(e.target.value as PIPShape)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="circle">Circle</option>
                    <option value="square">Square</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Overlays</h3>
                <button
                  onClick={() => setShowOverlayManager(true)}
                  className="w-full px-4 py-3 rounded-lg border bg-gray-800 border-gray-700 hover:border-gray-600"
                >
                  Manage Overlay Images
                </button>
                {suggestions.length > 0 && (
                  <p className="text-sm text-gray-400">
                    {suggestions.length} overlay{suggestions.length > 1 ? 's' : ''} ready
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-medium">Talk Tracks</h3>
                <button
                  onClick={() => setShowTalkTrackInput(true)}
                  className="w-full px-4 py-3 rounded-lg border bg-gray-800 border-gray-700 hover:border-gray-600"
                >
                  Manage Talk Tracks
                </button>
                {isAIAvailable && (
                  <p className="text-sm text-gray-400">
                    Prebake visuals from your script
                  </p>
                )}
              </div>
            </div>

            {isAIAvailable && (
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="voice-commands"
                  checked={voiceCommandsEnabled}
                  onChange={(e) => setVoiceCommandsEnabled(e.target.checked)}
                  className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                />
                <label htmlFor="voice-commands" className="text-sm text-gray-400">
                  Enable voice commands ("Hey Mike, show that")
                </label>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={handleStartRecording}
                disabled={!webcamStream || isStartingRecording}
                className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg text-lg font-medium"
              >
                {isStartingRecording ? 'Generating name card...' : 'Start Recording'}
              </button>
            </div>
          </div>
        )}

        {mode === 'recording' && (
          <div className="max-w-5xl mx-auto space-y-4 pb-36">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xl font-mono">{formatDuration(duration)}</span>
                </div>
                <VUMeter stream={webcamStream} />
                {isAIAvailable && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
                    <span className="text-gray-400">{wsConnected ? 'AI connected' : 'Connecting...'}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>1/2/3 layouts</span>
                <span>|</span>
                <span>4 insert | 5 clear</span>
                <span>|</span>
                <span>Esc stop</span>
              </div>
            </div>

            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video
                ref={displayVideoRef}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            {isAIAvailable && (
              <TranscriptDisplay className="mt-4 border border-gray-700" maxHeight="200px" />
            )}

            <div className="grid grid-cols-3 gap-4 mt-4">
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
              <div className="flex justify-center">
                <button
                  onClick={() => setShowOverlayManager(true)}
                  className="px-3 py-1 rounded text-sm bg-gray-800 hover:bg-gray-700"
                >
                  + Overlay
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleStopRecording}
                  className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium"
                >
                  Stop Recording
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'recording' && (
          <SuggestionTray
            onInsert={handleInsertSuggestion}
            onClear={handleClearOverlay}
            hasOverlay={hasOverlay}
            isGenerating={isGeneratingImage}
          />
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

      <ManualOverlayManager
        isOpen={showOverlayManager}
        onClose={() => setShowOverlayManager(false)}
        onSelectOverlay={handleSelectOverlay}
      />

      <TalkTrackInput
        isOpen={showTalkTrackInput}
        onClose={() => setShowTalkTrackInput(false)}
      />
    </div>
  );
}
