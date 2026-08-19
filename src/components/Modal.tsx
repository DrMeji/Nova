import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'settings' | 'search';
  /** Hide the top title/back row (search embeds its own back control) */
  hideHeader?: boolean;
}

const sizeClasses = {
  sm: 'w-full max-w-md max-h-[min(85vh,calc(100vh-1.5rem))]',
  md: 'w-full max-w-lg max-h-[min(85vh,calc(100vh-1.5rem))]',
  lg: 'w-full max-w-2xl max-h-[min(85vh,calc(100vh-1.5rem))]',
  xl: 'w-full max-w-4xl max-h-[min(85vh,calc(100vh-1.5rem))]',
  full: 'w-[min(92vw,90rem)] max-w-[calc(100vw-1.5rem)] max-h-[min(90vh,calc(100vh-1.5rem))]',
  settings: 'w-[min(78vw,56rem)] h-[min(78vh,calc(100vh-1.5rem))] max-w-[calc(100vw-1.5rem)]',
  // Wider panel, same height feel
  search: 'w-[min(58rem,calc(100vw-1.5rem))] h-[min(36rem,calc(100vh-1.5rem))]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  size = 'lg',
  hideHeader = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const root = dialogRef.current;
    const focusable = root?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 animate-fade-in">
      <div
        className="absolute inset-0 bg-ark-navy-950/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        className={`z-10 flex flex-col min-w-0 rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl shadow-black/40 overflow-hidden animate-slide-up ${sizeClasses[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={!hideHeader && title ? 'modal-title' : undefined}
        aria-label={hideHeader ? title ?? 'Dialog' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHeader && (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-border shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-surface-border bg-surface-hover/60 hover:bg-surface-hover flex items-center justify-center text-content-secondary hover:text-content-primary transition-colors"
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {title && (
              <h2 id="modal-title" className="text-base font-semibold text-content-primary">
                {title}
              </h2>
            )}
          </div>
        )}

        <div className="flex-1 overflow-hidden min-h-0">
          {children}
        </div>
      </div>
    </div>
  );
}
