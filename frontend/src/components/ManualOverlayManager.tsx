import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { overlaysApi, Overlay } from '../lib/api';

interface ManualOverlayManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectOverlay: (overlayUrl: string) => void;
}

export function ManualOverlayManager({ isOpen, onClose, onSelectOverlay }: ManualOverlayManagerProps) {
  const { token } = useAuth();
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && token) {
      loadOverlays();
    }
  }, [isOpen, token]);

  const loadOverlays = async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await overlaysApi.list(token);
      setOverlays(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overlays');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    setIsUploading(true);
    setError('');
    try {
      const newOverlay = await overlaysApi.upload(token, file);
      setOverlays((prev) => [newOverlay, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (overlayId: number) => {
    if (!token) return;
    try {
      await overlaysApi.delete(token, overlayId);
      setOverlays((prev) => prev.filter((o) => o.id !== overlayId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleSelect = (overlay: Overlay) => {
    const url = overlaysApi.getImageUrl(overlay.id);
    onSelectOverlay(url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold">Overlay Images</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 border-b border-gray-800">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleUpload}
            className="hidden"
            id="overlay-upload"
          />
          <label
            htmlFor="overlay-upload"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer ${
              isUploading
                ? 'bg-gray-700 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isUploading ? 'Uploading...' : 'Upload Image'}
          </label>
          <span className="ml-3 text-sm text-gray-400">
            PNG, JPEG, WebP, GIF (max 5MB)
          </span>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500 text-red-500 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : overlays.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No overlays uploaded yet. Upload an image to get started.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {overlays.map((overlay) => (
                <div
                  key={overlay.id}
                  className="relative group bg-gray-800 rounded-lg overflow-hidden aspect-video"
                >
                  <img
                    src={overlaysApi.getImageUrl(overlay.id)}
                    alt={overlay.original_name}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => handleSelect(overlay)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                    >
                      Use
                    </button>
                    <button
                      onClick={() => handleDelete(overlay.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs truncate">
                    {overlay.original_name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-800 text-sm text-gray-400">
          Click an image to add it as a suggestion. Press [4] during recording to insert.
        </div>
      </div>
    </div>
  );
}
