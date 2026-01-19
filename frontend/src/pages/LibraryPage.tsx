import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Download, Trash2, Video, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { recordingsApi, Recording } from '../lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function LibraryPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      loadRecordings();
    }
  }, [token]);

  const loadRecordings = async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const data = await recordingsApi.list(token);
      setRecordings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recordings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (recording: Recording) => {
    if (!token) return;
    const url = recordingsApi.downloadUrl(recording.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recording.title}.webm`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await response.blob();
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDelete = async (recording: Recording) => {
    if (!token) return;
    if (!confirm(`Delete "${recording.title}"?`)) return;

    try {
      await recordingsApi.delete(token, recording.id);
      setRecordings(recordings.filter(r => r.id !== recording.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete recording');
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (bytes === null) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold">HotMike</h1>
        <div className="flex items-center gap-4">
          <Button onClick={() => navigate('/')}>
            <Plus className="w-4 h-4 mr-2" />
            New Recording
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto"
        >
          <h2 className="text-2xl font-semibold mb-6">Your Recordings</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg mb-6"
            >
              {error}
            </motion.div>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : recordings.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Video className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No recordings yet</p>
              <Button onClick={() => navigate('/')}>
                <Plus className="w-4 h-4 mr-2" />
                Create your first recording
              </Button>
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {recordings.map(recording => (
                <motion.div key={recording.id} variants={itemVariants}>
                  <Card className="overflow-hidden hover:border-primary/50 transition-colors">
                    <div className="aspect-video bg-secondary flex items-center justify-center">
                      <Video className="w-16 h-16 text-muted-foreground" />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium truncate">{recording.title}</h3>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span>{formatDuration(recording.duration_seconds)}</span>
                        <span>{formatDate(recording.created_at)}</span>
                        {recording.file_size && (
                          <span>{formatFileSize(recording.file_size)}</span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleDownload(recording)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(recording)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
