import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { overlaysApi, Overlay } from '../lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>Overlay Images</DialogTitle>
          <DialogDescription>
            Upload and manage your overlay images
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 border-b border-border flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleUpload}
            className="hidden"
            id="overlay-upload"
          />
          <Button
            asChild
            disabled={isUploading}
          >
            <label htmlFor="overlay-upload" className="cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              {isUploading ? 'Uploading...' : 'Upload Image'}
            </label>
          </Button>
          <span className="text-sm text-muted-foreground">
            PNG, JPEG, WebP, GIF (max 5MB)
          </span>
        </div>

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

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading...</div>
          ) : overlays.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No overlays uploaded yet. Upload an image to get started.
            </div>
          ) : (
            <TooltipProvider delayDuration={300}>
              <div className="grid grid-cols-3 gap-4">
                <AnimatePresence>
                  {overlays.map((overlay, index) => (
                    <Tooltip key={overlay.id}>
                      <TooltipTrigger asChild>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={{ scale: 1.02 }}
                          className="relative group bg-card rounded-lg overflow-hidden aspect-video border border-border cursor-pointer"
                        >
                          <img
                            src={overlaysApi.getImageUrl(overlay.id)}
                            alt={overlay.original_name}
                            className="w-full h-full object-contain"
                          />
                          <motion.div
                            initial={{ opacity: 0 }}
                            whileHover={{ opacity: 1 }}
                            className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2"
                          >
                            <Button
                              size="sm"
                              onClick={() => handleSelect(overlay)}
                            >
                              Use
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(overlay.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </motion.div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-xs truncate">
                            {overlay.original_name}
                          </div>
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="p-0 border-0 bg-transparent">
                        <motion.img
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          src={overlaysApi.getImageUrl(overlay.id)}
                          alt={overlay.original_name}
                          className="max-w-[400px] max-h-[300px] rounded-lg shadow-xl object-contain"
                        />
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </AnimatePresence>
              </div>
            </TooltipProvider>
          )}
        </div>

        <div className="p-4 border-t border-border text-sm text-muted-foreground">
          Click an image to add it as a suggestion. Press [4] during recording to insert.
        </div>
      </DialogContent>
    </Dialog>
  );
}
