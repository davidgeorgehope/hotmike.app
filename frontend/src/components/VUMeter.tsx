import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface VUMeterProps {
  stream: MediaStream | null;
  className?: string;
}

const SEGMENT_COUNT = 10;
const GREEN_SEGMENTS = 6;
const YELLOW_SEGMENTS = 3;

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

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    analyzer.smoothingTimeConstant = 0.3;
    analyzerRef.current = analyzer;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyzer);
    sourceRef.current = source;

    const dataArray = new Uint8Array(analyzer.frequencyBinCount);

    const updateLevel = () => {
      analyzer.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
      const clampedDb = Math.max(MIN_DB, Math.min(MAX_DB, db));

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

  const activeSegments = Math.round(level * SEGMENT_COUNT);

  const getSegmentColor = (index: number) => {
    if (index >= activeSegments) {
      return 'bg-muted';
    }
    if (index < GREEN_SEGMENTS) {
      return 'bg-success';
    }
    if (index < GREEN_SEGMENTS + YELLOW_SEGMENTS) {
      return 'bg-warning';
    }
    return 'bg-recording';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex gap-1">
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-2 h-6 rounded-sm transition-colors duration-75',
              getSegmentColor(i)
            )}
          />
        ))}
      </div>
      <span className="text-xs font-mono text-muted-foreground w-12 text-right">
        {dbLevel > MIN_DB ? `${Math.round(dbLevel)} dB` : '-\u221E dB'}
      </span>
    </div>
  );
}
