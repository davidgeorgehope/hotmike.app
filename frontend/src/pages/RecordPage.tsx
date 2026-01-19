import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, LogOut, Plus, Square, Video, Image, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRecording } from '../contexts/RecordingContext';
import { useAI } from '../contexts/AIContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { useVoiceCommands } from '../hooks/useVoiceCommands';
import { useTranscriptionWebSocket } from '../hooks/useTranscriptionWebSocket';
import { Compositor, LayoutMode, PIPShape } from '../lib/compositor';
import { recordingsApi } from '../lib/api';
import { VUMeter } from '../components/VUMeter';
import { ManualOverlayManager } from '../components/ManualOverlayManager';
import { TranscriptDisplay } from '../components/TranscriptDisplay';
import { SuggestionTray } from '../components/SuggestionTray';
import { TalkTrackInput } from '../components/TalkTrackInput';
import {
  VideoPreview,
  CountdownOverlay,
  RecordingIndicator,
  ConnectionStatus,
  DraggableOverlay,
} from '../components/recording';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Mode = 'setup' | 'countdown' | 'recording' | 'preview';

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

  const {
    webcamStream,
    screenStream,
    requestWebcam,
    requestScreen,
    stopAll,
    error: mediaError,
    availableDevices,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    setVideoDevice,
    setAudioDevice,
  } = useMediaDevices();
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
    getRecentTranscript,
  } = useAI();

  const [mode, setMode] = useState<Mode>('setup');

  const { sendAudioChunk, isConnected: wsConnected, detectMoments } = useTranscriptionWebSocket({
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
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(null);
  const [overlayPosition, setOverlayPosition] = useState({ x: 75, y: 75 }); // Start at bottom-right
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (recordedBlob) {
      setMode('preview');
    }
  }, [recordedBlob]);

  useEffect(() => {
    if (mode !== 'recording' || !wsConnected || !isAIAvailable) return;

    const intervalId = setInterval(() => {
      const recentTranscript = getRecentTranscript(30000);
      if (recentTranscript.trim().length > 20) {
        detectMoments(recentTranscript);
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [mode, wsConnected, isAIAvailable, getRecentTranscript, detectMoments]);

  useEffect(() => {
    if (mode === 'preview' && recordedBlob && previewVideoRef.current) {
      previewVideoRef.current.src = URL.createObjectURL(recordedBlob);
    }
  }, [mode, recordedBlob]);

  const handleInsertSuggestion = useCallback(async () => {
    const suggestion = getCurrentSuggestion();
    if (!suggestion || !compositorRef.current || isGeneratingImage) return;

    // Reset position to default
    const defaultPosition = { x: 75, y: 75 };
    setOverlayPosition(defaultPosition);

    if (suggestion.overlayPosition || suggestion.overlayScale) {
      compositorRef.current.setOverlayOptions({
        position: defaultPosition,
        scale: suggestion.overlayScale || 0.4,
        opacity: 1,
      });
    }

    if (suggestion.imageUrl) {
      try {
        await compositorRef.current.setOverlayImage(suggestion.imageUrl);
        setOverlayImageUrl(suggestion.imageUrl);
        setHasOverlay(true);
        acceptSuggestion(suggestion.id);
      } catch (err) {
        console.error('Failed to load overlay:', err);
      }
    } else if (suggestion.searchQuery) {
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
            compositorRef.current.setOverlayOptions({
              position: defaultPosition,
              scale: data.scale || 0.4,
              opacity: 1,
            });
            await compositorRef.current.setOverlayImage(data.image_url);
            setOverlayImageUrl(data.image_url);
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

  const handleOverlayPositionChange = useCallback((position: { x: number; y: number }) => {
    setOverlayPosition(position);
    if (compositorRef.current) {
      compositorRef.current.setOverlayOptions({ position });
    }
  }, []);

  const handleClearOverlay = useCallback(() => {
    if (compositorRef.current) {
      compositorRef.current.clearOverlay();
      setHasOverlay(false);
      setOverlayImageUrl(null);
    }
  }, []);

  const handleDismissSuggestion = useCallback(() => {
    const suggestion = getCurrentSuggestion();
    if (suggestion) {
      dismissSuggestion(suggestion.id);
    }
  }, [getCurrentSuggestion, dismissSuggestion]);

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

  const handleInitiateRecording = useCallback(async () => {
    if (!canvasRef.current || isStartingRecording) return;
    setIsStartingRecording(true);

    let nameCardImageUrl: string | null = null;
    if (nameCardText && isAIAvailable) {
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
        console.error('Failed to generate name card:', err);
      }
    }

    // Store the name card URL for later use
    (window as unknown as { __nameCardImageUrl?: string | null }).__nameCardImageUrl = nameCardImageUrl;

    setIsStartingRecording(false);
    setMode('countdown');
  }, [nameCardText, nameCardTitle, isAIAvailable, isStartingRecording]);

  const handleCountdownComplete = useCallback(() => {
    if (!canvasRef.current) return;

    compositorRef.current?.start();
    startRecording(canvasRef.current, webcamStream, screenStream);
    startSession();

    const nameCardImageUrl = (window as unknown as { __nameCardImageUrl?: string | null }).__nameCardImageUrl;
    if (nameCardText && nameCardImageUrl) {
      addSuggestion({
        text: `Name card: ${nameCardText}`,
        imageUrl: nameCardImageUrl,
        source: 'prebaked',
      });
    }

    setMode('recording');
  }, [webcamStream, screenStream, startRecording, startSession, nameCardText, addSuggestion]);

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
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold">HotMike</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate('/library')}>
            <FolderOpen className="w-4 h-4 mr-2" />
            Library
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <div className="hidden">
        <video ref={webcamVideoRef} muted playsInline />
        <video ref={screenVideoRef} muted playsInline />
        <canvas ref={canvasRef} width={1920} height={1080} />
      </div>

      <main className="p-6">
        <AnimatePresence mode="wait">
          {mode === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <h2 className="text-2xl font-semibold">Setup Recording</h2>

              {mediaError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg"
                >
                  {mediaError}
                </motion.div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Video className="w-5 h-5" />
                      Media Sources
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {availableDevices.videoInputs.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Camera</label>
                        <Select
                          value={selectedVideoDeviceId || ''}
                          onValueChange={setVideoDevice}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select camera" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDevices.videoInputs.map((device) => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {availableDevices.audioInputs.length > 0 && (
                      <div className="space-y-2">
                        <label className="text-sm text-muted-foreground">Microphone</label>
                        <Select
                          value={selectedAudioDeviceId || ''}
                          onValueChange={setAudioDevice}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select microphone" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDevices.audioInputs.map((device) => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 pt-2">
                      <Button
                        variant={webcamStream ? 'default' : 'secondary'}
                        className={cn(webcamStream && 'bg-success hover:bg-success/90')}
                        onClick={() => requestWebcam()}
                      >
                        {webcamStream ? 'Webcam Connected' : 'Connect Webcam'}
                      </Button>
                      <Button
                        variant={screenStream ? 'default' : 'secondary'}
                        className={cn(screenStream && 'bg-success hover:bg-success/90')}
                        onClick={requestScreen}
                      >
                        {screenStream ? 'Screen Connected' : 'Share Screen'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Name Card</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Your Name</label>
                      <Input
                        value={nameCardText}
                        onChange={(e) => setNameCardText(e.target.value)}
                        placeholder="Your Name"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Your Title</label>
                      <Input
                        value={nameCardTitle}
                        onChange={(e) => setNameCardTitle(e.target.value)}
                        placeholder="Your Title"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Layout</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-3">
                    {(['face_card', 'face_only', 'screen_pip'] as LayoutMode[]).map((l) => (
                      <Button
                        key={l}
                        variant={layout === l ? 'default' : 'secondary'}
                        onClick={() => setLayout(l)}
                      >
                        {l === 'face_card' && '1: Face + Card'}
                        {l === 'face_only' && '2: Face Only'}
                        {l === 'screen_pip' && '3: Screen + PIP'}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>PIP Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Position</label>
                      <Select
                        value={pipPosition}
                        onValueChange={(v) => setPipPosition(v as typeof pipPosition)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top-left">Top Left</SelectItem>
                          <SelectItem value="top-right">Top Right</SelectItem>
                          <SelectItem value="bottom-left">Bottom Left</SelectItem>
                          <SelectItem value="bottom-right">Bottom Right</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Size</label>
                      <Select
                        value={pipSize}
                        onValueChange={(v) => setPipSize(v as typeof pipSize)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="large">Large</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm text-muted-foreground">Shape</label>
                      <Select
                        value={pipShape}
                        onValueChange={(v) => setPipShape(v as PIPShape)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="circle">Circle</SelectItem>
                          <SelectItem value="square">Square</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Image className="w-5 h-5" />
                      Overlays
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setShowOverlayManager(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Manage Overlay Images
                    </Button>
                    {suggestions.length > 0 && (
                      <Badge variant="secondary">
                        {suggestions.length} overlay{suggestions.length > 1 ? 's' : ''} ready
                      </Badge>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Talk Tracks
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setShowTalkTrackInput(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Manage Talk Tracks
                    </Button>
                    {isAIAvailable && (
                      <p className="text-sm text-muted-foreground">
                        Prebake visuals from your script
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {isAIAvailable && (
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="voice-commands"
                    checked={voiceCommandsEnabled}
                    onChange={(e) => setVoiceCommandsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded bg-secondary border-border"
                  />
                  <label htmlFor="voice-commands" className="text-sm text-muted-foreground">
                    Enable voice commands ("Hey Mike, show that")
                  </label>
                </div>
              )}

              <div className="pt-4">
                <Button
                  size="lg"
                  className="w-full bg-recording hover:bg-recording/90 text-recording-foreground"
                  onClick={handleInitiateRecording}
                  disabled={!webcamStream || isStartingRecording}
                >
                  {isStartingRecording ? 'Preparing...' : 'Start Recording'}
                </Button>
              </div>
            </motion.div>
          )}

          {mode === 'recording' && (
            <motion.div
              key="recording"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-5xl mx-auto space-y-4 pb-36"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <VUMeter stream={webcamStream} />
                  {isAIAvailable && (
                    <ConnectionStatus isConnected={wsConnected} isAIAvailable={isAIAvailable} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <kbd className="px-2 py-1 bg-secondary rounded text-xs">1/2/3</kbd> layouts
                  <span className="text-border">|</span>
                  <kbd className="px-2 py-1 bg-secondary rounded text-xs">4</kbd> insert
                  <kbd className="px-2 py-1 bg-secondary rounded text-xs">5</kbd> clear
                  <span className="text-border">|</span>
                  <kbd className="px-2 py-1 bg-secondary rounded text-xs">Esc</kbd> stop
                </div>
              </div>

              <VideoPreview ref={previewContainerRef} showFrameMarkers>
                <video
                  ref={displayVideoRef}
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
                <RecordingIndicator duration={formatDuration(duration)} />
                {hasOverlay && overlayImageUrl && (
                  <DraggableOverlay
                    imageUrl={overlayImageUrl}
                    position={overlayPosition}
                    onPositionChange={handleOverlayPositionChange}
                    containerRef={previewContainerRef}
                    scale={0.25}
                  />
                )}
              </VideoPreview>

              {isAIAvailable && (
                <TranscriptDisplay className="mt-4" maxHeight="200px" />
              )}

              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="flex gap-2">
                  {(['face_card', 'face_only', 'screen_pip'] as LayoutMode[]).map((l, i) => (
                    <Button
                      key={l}
                      size="sm"
                      variant={layout === l ? 'default' : 'secondary'}
                      onClick={() => setLayout(l)}
                    >
                      {i + 1}
                    </Button>
                  ))}
                </div>
                <div className="flex justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowOverlayManager(true)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Overlay
                  </Button>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="destructive"
                    onClick={handleStopRecording}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Recording
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {mode === 'preview' && recordedBlob && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl mx-auto space-y-6"
            >
              <h2 className="text-2xl font-semibold">Recording Complete</h2>

              {saveError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg"
                >
                  {saveError}
                </motion.div>
              )}

              <VideoPreview showFrameMarkers={false}>
                <video
                  ref={previewVideoRef}
                  controls
                  className="w-full h-full"
                />
              </VideoPreview>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your recording a title"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save to Library'}
                </Button>
                <Button variant="secondary" onClick={handleDownload}>
                  Download
                </Button>
                <Button variant="ghost" onClick={handleDiscard}>
                  Discard
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {mode === 'recording' && (
          <SuggestionTray
            onInsert={handleInsertSuggestion}
            onClear={handleClearOverlay}
            hasOverlay={hasOverlay}
            isGenerating={isGeneratingImage}
          />
        )}
      </main>

      <CountdownOverlay
        isActive={mode === 'countdown'}
        onComplete={handleCountdownComplete}
      />

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
