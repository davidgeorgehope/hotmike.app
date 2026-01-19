import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { talkTracksApi, TalkTrack } from '../lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TalkTrackInputProps {
  isOpen: boolean;
  onClose: () => void;
  onTalkTrackCreated?: (id: number) => void;
}

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
      '<span class="bg-primary/30 text-primary px-1 rounded">$&</span>'
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
      return <Badge variant="default" className="bg-success">Ready</Badge>;
    }
    if (generating > 0) {
      return <Badge variant="default" className="bg-warning text-warning-foreground">Generating...</Badge>;
    }
    if (pending > 0) {
      return <Badge variant="secondary">Pending</Badge>;
    }
    if (failed > 0) {
      return <Badge variant="destructive">Failed</Badge>;
    }
    return null;
  };

  const handleClose = () => {
    resetForm();
    setMode('list');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>
            {mode === 'list' && 'Talk Tracks'}
            {mode === 'create' && 'New Talk Track'}
            {mode === 'edit' && 'Edit Talk Track'}
          </DialogTitle>
          <DialogDescription>
            Create talk tracks with visual markers to prebake graphics
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-4 py-3 bg-destructive/10 border-b border-destructive text-destructive text-sm"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {mode === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="p-4 border-b border-border">
                <Button onClick={() => { resetForm(); setMode('create'); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Talk Track
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {isLoading ? (
                  <div className="text-center text-muted-foreground py-8">Loading...</div>
                ) : talkTracks.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No talk tracks yet. Create one to prebake visuals from your script.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {talkTracks.map((track, index) => (
                      <motion.div
                        key={track.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-card rounded-lg p-4 border border-border"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium truncate">{track.title}</h3>
                              {getStatusBadge(track.prebaked_status)}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {track.marker_count || 0} visual marker{(track.marker_count || 0) !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="flex gap-2 ml-4">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleEdit(track)}
                            >
                              <Pencil className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(track.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {(mode === 'create' || mode === 'edit') && (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col flex-1 overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Title</label>
                  <Input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="My Talk Track"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-muted-foreground">Script Content</label>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={insertMarker}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Insert [VISUAL:] Marker
                    </Button>
                  </div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste your script here. Use [VISUAL:description] markers where you want AI-generated graphics.

Example:
Today we're going to talk about machine learning.
[VISUAL:neural network diagram]
Let me explain how neural networks work..."
                    className="w-full h-64 px-4 py-3 bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm resize-none"
                  />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {countMarkers(content)} visual marker{countMarkers(content) !== 1 ? 's' : ''} detected
                    </span>
                    <span>{content.length} characters</span>
                  </div>
                </div>

                {content && countMarkers(content) > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-card rounded-lg p-4 border border-border"
                  >
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Preview</h4>
                    <div
                      className="text-sm whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: highlightMarkers(content) }}
                    />
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 p-4 border-t border-border">
                <Button
                  variant="secondary"
                  onClick={() => { resetForm(); setMode('list'); }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleSave}
                  disabled={isSaving || !title.trim() || !content.trim()}
                >
                  {isSaving ? 'Saving...' : mode === 'edit' ? 'Update' : 'Create & Prebake'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4 border-t border-border text-sm text-muted-foreground">
          Use [VISUAL:description] markers in your script to auto-generate graphics.
        </div>
      </DialogContent>
    </Dialog>
  );
}
