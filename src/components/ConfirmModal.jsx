import React from 'react';
import { AlertTriangle, Trash2, RotateCcw, LogOut, Info, Check, X } from 'lucide-react';

export function ConfirmModal({
  isOpen,
  title = 'Confirmação',
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmVariant = 'warning', // 'danger' | 'warning' | 'primary' | 'info'
  icon: CustomIcon,
  onConfirm,
  onCancel
}) {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return {
          btnBg: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          btnColor: '#ffffff',
          iconColor: '#f87171',
          iconBg: 'rgba(239, 68, 68, 0.15)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
          defaultIcon: Trash2
        };
      case 'primary':
        return {
          btnBg: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
          btnColor: '#000000',
          iconColor: '#38bdf8',
          iconBg: 'rgba(56, 189, 248, 0.15)',
          borderColor: 'rgba(56, 189, 248, 0.4)',
          defaultIcon: Check
        };
      case 'info':
        return {
          btnBg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          btnColor: '#ffffff',
          iconColor: '#34d399',
          iconBg: 'rgba(16, 185, 129, 0.15)',
          borderColor: 'rgba(16, 185, 129, 0.4)',
          defaultIcon: Info
        };
      case 'warning':
      default:
        return {
          btnBg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          btnColor: '#000000',
          iconColor: '#fbbf24',
          iconBg: 'rgba(245, 158, 11, 0.15)',
          borderColor: 'rgba(245, 158, 11, 0.4)',
          defaultIcon: AlertTriangle
        };
    }
  };

  const variant = getVariantStyles();
  const IconComponent = CustomIcon || variant.defaultIcon;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={onCancel}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '28px',
          borderRadius: '20px',
          border: `1px solid ${variant.borderColor}`,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 0, 0, 0.5)',
          textAlign: 'left',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Icon + Title */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
          <div
            style={{
              padding: '10px',
              borderRadius: '12px',
              background: variant.iconBg,
              color: variant.iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <IconComponent size={24} />
          </div>

          <div style={{ flex: 1 }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '4px', lineHeight: 1.3 }}>
              {title}
            </h3>
            {message && (
              <div style={{ color: '#cbd5e1', fontSize: '0.88rem', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
          {cancelText && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '9px 18px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              {cancelText}
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '9px 20px',
              borderRadius: '10px',
              background: variant.btnBg,
              color: variant.btnColor,
              border: 'none',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
              transition: 'transform 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
