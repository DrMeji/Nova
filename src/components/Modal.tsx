import { useEffect, type ReactNode } from 'react';
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
  sm: 'w-full max-w-md max-h-[85vh]',
  md: 'w-full max-w-lg max-h-[85vh]',
  lg: 'w-full max-w-2xl max-h-[85vh]',
  xl: 'w-full max-w-4xl max-h-[85vh]',
  full: 'w-[min(92vw,90rem)] max-h-[90vh]',
  settings: 'w-[78vw] h-[78vh]',
  // Wider panel, same height feel
  search: 'w-[min(58rem,62vw)] h-[min(36rem,60vh)]',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-ark-navy-950/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`z-10 flex flex-col rounded-2xl border border-surface-border bg-ark-navy-900 shadow-2xl shadow-black/40 overflow-hidden animate-slide-up ${sizeClasses[size]} ${className}`}
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
