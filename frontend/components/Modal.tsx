import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'warning' | 'error' | 'info' | 'success';
  isDangerous?: boolean;
}

export function Modal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'info',
  isDangerous = false
}: ModalProps) {
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'auto';
      };
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const headerClass = {
    warning: 'bg-amber-50 text-amber-900',
    error: 'bg-rose-50 text-rose-900',
    info: 'bg-blue-50 text-blue-900',
    success: 'bg-emerald-50 text-emerald-900'
  };

  const confirmButtonClass = isDangerous
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-ink hover:bg-slate-800 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-[calc(100%-32px)] animate-in zoom-in-95">
        <div className={`px-6 py-4 border-b ${headerClass[type]}`}>
          <h2 id="modal-title" className="text-lg font-semibold">
            {title}
          </h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm leading-6 text-slate-700">{message}</p>
        </div>

        <div className="px-6 py-4 border-t bg-slate-50 rounded-b-2xl flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
