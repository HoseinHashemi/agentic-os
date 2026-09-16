import { useState, useCallback, useEffect, useRef } from 'react';

export type AttachedFileType = 'image' | 'pdf' | 'text';

export interface AttachedImage {
  id: string;
  name: string;
  fileType: AttachedFileType;
  mediaType: string;
  data: string;    // base64 for images/pdf; raw text for text files
  preview: string; // data URL for images, '' for others
  size: number;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const PDF_TYPES   = new Set(['application/pdf']);
const TEXT_TYPES  = new Set(['text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/x-markdown']);

const MAX_DIMENSION = 1568;

function isTextFile(file: File): boolean {
  return TEXT_TYPES.has(file.type) ||
    /\.(txt|md|csv|json|yaml|yml|xml|html|htm|log)$/i.test(file.name);
}

async function processFile(file: File): Promise<AttachedImage | null> {
  // ── Image ──────────────────────────────────────────────────────────────────
  if (IMAGE_TYPES.has(file.type)) {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width >= height) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; }
          else { width = Math.round((width * MAX_DIMENSION) / height); height = MAX_DIMENSION; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(objectUrl);
        const mediaType = file.type === 'image/gif' ? 'image/gif' : 'image/jpeg';
        const preview = canvas.toDataURL(mediaType, 0.88);
        resolve({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name, fileType: 'image', mediaType,
          data: preview.split(',')[1], preview, size: file.size,
        });
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  }

  // ── PDF ────────────────────────────────────────────────────────────────────
  if (PDF_TYPES.has(file.type)) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve({
          id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name, fileType: 'pdf', mediaType: 'application/pdf',
          data: dataUrl.split(',')[1], preview: '', size: file.size,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // ── Text / CSV / Markdown / JSON ───────────────────────────────────────────
  if (isTextFile(file)) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `txt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name, fileType: 'text',
          mediaType: file.type || 'text/plain',
          data: reader.result as string,
          preview: '', size: file.size,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });
  }

  return null;
}

export function useImageAttach(disabled: boolean) {
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCountRef = useRef(0);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    if (disabled) return;
    const arr = Array.from(files).filter(f =>
      IMAGE_TYPES.has(f.type) || PDF_TYPES.has(f.type) || isTextFile(f)
    ).slice(0, 6);
    const results = await Promise.all(arr.map(processFile));
    const valid = results.filter(Boolean) as AttachedImage[];
    if (valid.length) setImages(prev => [...prev, ...valid].slice(0, 6));
  }, [disabled]);

  const removeImage = useCallback((id: string) => {
    setImages(prev => prev.filter(i => i.id !== id));
  }, []);

  const clearImages = useCallback(() => setImages([]), []);

  // Global paste listener
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length) addFiles(files);
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled, addFiles]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setIsDragging(false);
  }, []);

  const onDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setIsDragging(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  }, [disabled, addFiles]);

  return {
    images, isDragging, addFiles, removeImage, clearImages,
    dragHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
