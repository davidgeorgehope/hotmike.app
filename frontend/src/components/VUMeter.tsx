import { useEffect, useRef, useState } from 'react';

interface VUMeterProps {
  stream: MediaStream | null;
  className?: string;
}

const SEGMENT_COUNT = 10;
const GREEN_SEGMENTS = 6;
const YELLOW_SEGMENTS = 3;
// Red segment is the remaining 1

const MIN_DB = -60;
const MAX_DB = 0;

export function VUMeter({ stream, className = '' }: VUMeterProps) {
  const [level, setLevel] = useState(0);
  const [dbLevel, setDbLevel] = useState(MIN_DB);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      setDbLevel(MIN_DB);
      return;
    }

    // Create audio context
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // Create analyzer
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    analyzer.smoothingTimeConstant = 0.3;
    analyzerRef.current = analyzer;

    // Create source from stream
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyzer);
    sourceRef.current = source;

    // Data array for analyzer
    const dataArray = new Uint8Array(analyzer.frequencyBinCount);

    // Animation loop
    const updateLevel = () => {
      analyzer.getByteFrequencyData(dataArray);

      // Calculate RMS value
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // Convert to dB
      const db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
      const clampedDb = Math.max(MIN_DB, Math.min(MAX_DB, db));

      // Normalize to 0-1 range
      const normalizedLevel = (clampedDb - MIN_DB) / (MAX_DB - MIN_DB);

      setLevel(normalizedLevel);
      setDbLevel(clampedDb);

      animationRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stream]);

  // Calculate active segments
  const activeSegments = Math.round(level * SEGMENT_COUNT);

  const getSegmentColor = (index: number) => {
    if (index >= activeSegments) {
      return 'bg-gray-700';
    }
    if (index < GREEN_SEGMENTS) {
      return 'bg-green-500';
    }
    if (index < GREEN_SEGMENTS + YELLOW_SEGMENTS) {
      return 'bg-yellow-500';
    }
    return 'bg-red-500';
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex gap-1">
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <div
            key={i}
            className={`w-2 h-6 rounded-sm transition-colors duration-75 ${getSegmentColor(i)}`}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-gray-400 w-12 text-right">
        {dbLevel > MIN_DB ? `${Math.round(dbLevel)} dB` : '-∞ dB'}
      </span>
    </div>
  );
}
