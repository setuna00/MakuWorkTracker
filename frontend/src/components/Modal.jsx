import { X } from 'lucide-react'
import { useT } from '../lib/i18n'

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm"
         onClick={onClose}>
      <div className={`bg-white rounded-xl w-full ${sizes[size]} max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-paper-200`}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-paper-200">
          <h3 className="font-medium text-base">{title}</h3>
          <button onClick={onClose}
                  className="text-ink-500 hover:text-ink-900 hover:bg-paper-100 p-1 rounded-md transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 min-h-0">{children}</div>
        {footer && (
          <div className="flex-shrink-0 border-t border-paper-200 px-5 py-3 bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Button({ children, variant = 'default', className = '', ...props }) {
  const variants = {
    default: 'bg-white hover:bg-brand-50 hover:border-brand-600 hover:text-brand-700 border border-paper-300 text-ink-900',
    primary: 'bg-brand-600 hover:bg-brand-700 text-white border border-brand-600 disabled:bg-paper-200 disabled:border-paper-200 disabled:text-ink-400',
    ghost: 'hover:bg-paper-100 text-ink-700 border border-transparent',
    danger: 'bg-white hover:bg-red-50 text-red-700 border border-red-300',
  }
  return (
    <button
      className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText, danger = false }) {
  const t = useT()
  if (!open) return null
  return (
    <Modal
      open={true}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText ?? t('common.confirm')}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-ink-700 leading-relaxed">{message}</div>
    </Modal>
  )
}