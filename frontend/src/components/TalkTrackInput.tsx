import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { talkTracksApi, TalkTrack } from '../lib/api';

interface TalkTrackInputProps {
  isOpen: boolean;
  onClose: () => void;
  onTalkTrackCreated?: (id: number) => void;
}

// Pattern for highlighting [VISUAL:] markers
const VISUAL_MARKER_PATTERN = /\[VISUAL:\s*([^\]]+)\]/gi;

export function TalkTrackInput({ isOpen, onClose, onTalkTrackCreated }: TalkTrackInputProps) {
  const { token } = useAuth();
  const [talkTracks, setTalkTracks] = useState<TalkTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && token) {
      loadTalkTracks();
    }
  }, [isOpen, token]);

  const loadTalkTracks = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await talkTracksApi.list(token);
      setTalkTracks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load talk tracks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!token || !title.trim() || !content.trim()) return;
    setIsSaving(true);
    setError('');

    try {
      if (mode === 'edit' && editingId) {
        await talkTracksApi.update(token, editingId, { title, content });
      } else {
        const result = await talkTracksApi.create(token, title, content);
        onTalkTrackCreated?.(result.id);
      }
      await loadTalkTracks();
      resetForm();
      setMode('list');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save talk track');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      await talkTracksApi.delete(token, id);
      setTalkTracks((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete talk track');
    }
  };

  const handleEdit = (track: TalkTrack) => {
    setTitle(track.title);
    setContent(track.content);
    setEditingId(track.id);
    setMode('edit');
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setEditingId(null);
  };

  const insertMarker = () => {
    const marker = '[VISUAL:description]';
    setContent((prev) => prev + (prev ? '\n' : '') + marker);
  };

  const countMarkers = (text: string) => {
    const matches = text.match(VISUAL_MARKER_PATTERN);
    return matches ? matches.length : 0;
  };

  const highlightMarkers = (text: string) => {
    return text.replace(
      VISUAL_MARKER_PATTERN,
      '<span class="bg-blue-500/30 text-blue-300 px-1 rounded">$&</span>'
    );
  };

  const getStatusBadge = (status: Record<string, number> | undefined) => {
    if (!status) return null;
    const completed = status['completed'] || 0;
    const pending = status['pending'] || 0;
    const generating = status['generating'] || 0;
    const failed = status['failed'] || 0;
    const total = completed + pending + generating + failed;

    if (total === 0) return null;

    if (completed === total) {
      return <span className="text-xs bg-green-600 px-2 py-0.5 rounded">Ready</span>;
    }
    if (generating > 0) {
      return <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">Generating...</span>;
    }
    if (pending > 0) {
      return <span className="text-xs bg-gray-600 px-2 py-0.5 rounded">Pending</span>;
    }
    if (failed > 0) {
      return <span className="text-xs bg-red-600 px-2 py-0.5 rounded">Failed</span>;
    }
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold">
            {mode === 'list' && 'Talk Tracks'}
            {mode === 'create' && 'New Talk Track'}
            {mode === 'edit' && 'Edit Talk Track'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500 text-red-500 text-sm">
            {error}
          </div>
        )}

        {mode === 'list' && (
          <>
            <div className="p-4 border-b border-gray-800">
              <button
                onClick={() => {
                  resetForm();
                  setMode('create');
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                New Talk Track
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {isLoading ? (
                <div className="text-center text-gray-400 py-8">Loading...</div>
              ) : talkTracks.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No talk tracks yet. Create one to prebake visuals from your script.
                </div>
              ) : (
                <div className="space-y-3">
                  {talkTracks.map((track) => (
                    <div
                      key={track.id}
                      className="bg-gray-800 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{track.title}</h3>
                            {getStatusBadge(track.prebaked_status)}
                          </div>
                          <p className="text-sm text-gray-400 mt-1">
                            {track.marker_count || 0} visual marker{(track.marker_count || 0) !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleEdit(track)}
                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(track.id)}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {(mode === 'create' || mode === 'edit') && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Talk Track"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Script Content</label>
                  <button
                    onClick={insertMarker}
                    className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                  >
                    + Insert [VISUAL:] Marker
                  </button>
                </div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Paste your script here. Use [VISUAL:description] markers where you want AI-generated graphics.

Example:
Today we're going to talk about machine learning.
[VISUAL:neural network diagram]
Let me explain how neural networks work..."
                  className="w-full h-64 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                />
                <div className="flex items-center justify-between mt-2 text-sm text-gray-400">
                  <span>
                    {countMarkers(content)} visual marker{countMarkers(content) !== 1 ? 's' : ''} detected
                  </span>
                  <span>{content.length} characters</span>
                </div>
              </div>

              {content && countMarkers(content) > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">Preview</h4>
                  <div
                    className="text-sm whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: highlightMarkers(content) }}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 border-t border-gray-800">
              <button
                onClick={() => {
                  resetForm();
                  setMode('list');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim() || !content.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg"
              >
                {isSaving ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create & Prebake'}
              </button>
            </div>
          </>
        )}

        <div className="p-4 border-t border-gray-800 text-sm text-gray-400">
          Use [VISUAL:description] markers in your script to auto-generate graphics.
        </div>
      </div>
    </div>
  );
}
