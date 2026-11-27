import React, { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';

interface QuickScanFabProps {
  onQuickScan: (file: File | null) => void;
  size?: 'sm' | 'md';
  floating?: boolean;
}

export const QuickScanFab: React.FC<QuickScanFabProps> = ({
  onQuickScan,
  size = 'md',
  floating = true,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleCaptureCamera = () => {
    setMenuOpen(false);
    const isMobileDevice =
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (isMobileDevice || !navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    onQuickScan(null);
  };

  const handlePickGallery = () => {
    setMenuOpen(false);
    galleryInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onQuickScan(file);
    }
    e.target.value = '';
  };

  const buttonSizeClass = size === 'sm' ? 'w-13 h-13 shadow-xl' : 'w-14 h-14 shadow-2xl';
  const iconSizeClass = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <>
      {/* Hidden Native Camera Input (direct capture) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Hidden Gallery / Photo Library Input (no capture attribute) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Backdrop to dismiss menu when tapping outside */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 backdrop-blur-[1px]"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={floating ? 'fixed right-4 z-40' : 'relative z-40'}
        style={
          floating
            ? { bottom: 'calc(5.25rem + env(safe-area-inset-bottom, 12px))' }
            : undefined
        }
      >
        {/* Speed-dial Action Menu */}
        {menuOpen && (
          <div
            role="menu"
            aria-label="Chọn nguồn quét văn bản"
            className="absolute right-0 bottom-full mb-3 z-50 flex flex-col gap-2 items-end"
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleCaptureCamera}
              className="flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-xl border border-amber-300/60 active:scale-95 transition whitespace-nowrap"
            >
              <span className="text-xs font-bold tracking-tight">Chụp ảnh văn bản</span>
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Camera className="w-4 h-4" strokeWidth={2.3} />
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={handlePickGallery}
              className="flex items-center gap-2.5 pl-3.5 pr-2.5 py-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xl border border-blue-400/50 active:scale-95 transition whitespace-nowrap"
            >
              <span className="text-xs font-bold tracking-tight">Chọn từ thư viện</span>
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <ImageIcon className="w-4 h-4" strokeWidth={2.3} />
              </span>
            </button>
          </div>
        )}

        {/* Main Camera FAB */}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`relative z-50 ${buttonSizeClass} rounded-full bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:from-amber-700 active:to-orange-700 text-white flex items-center justify-center active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ring-4 ring-white/90`}
          aria-label={menuOpen ? 'Đóng menu quét văn bản' : 'Quét văn bản (Chụp ảnh hoặc chọn thư viện)'}
          title="Quét văn bản (Chụp ảnh / Chọn từ thư viện)"
        >
          {menuOpen ? (
            <X className={iconSizeClass} strokeWidth={2.5} />
          ) : (
            <Camera className={iconSizeClass} strokeWidth={2.3} />
          )}
        </button>
      </div>
    </>
  );
};
