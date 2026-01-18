import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { recordingsApi, Recording } from '../lib/api';

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-bold">HotMike</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            New Recording
          </button>
          <button
            onClick={logout}
            className="px-4 py-2 text-gray-400 hover:text-white"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-semibold mb-6">Your Recordings</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded mb-6">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : recordings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-4">No recordings yet</p>
              <button
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Create your first recording
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map(recording => (
                <div
                  key={recording.id}
                  className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700"
                >
                  <div className="aspect-video bg-gray-900 flex items-center justify-center">
                    <svg
                      className="w-16 h-16 text-gray-700"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="p-4">
                    <h3 className="font-medium truncate">{recording.title}</h3>
                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                      <span>{formatDuration(recording.duration_seconds)}</span>
                      <span>{formatDate(recording.created_at)}</span>
                      {recording.file_size && (
                        <span>{formatFileSize(recording.file_size)}</span>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => handleDownload(recording)}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(recording)}
                        className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded text-sm"
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
      </main>
    </div>
  );
}
