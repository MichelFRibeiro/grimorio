import React, { useEffect, useRef, useState } from 'react';
import { Shield, Sparkles, LogIn, Swords, BookOpen, Flame, HelpCircle, Check, ArrowRight } from 'lucide-react';

export function LoginView({ onGoogleLogin, onGuestLogin, onEmailLogin, googleClientId }) {
  const googleBtnRef = useRef(null);
  const [emailInput, setEmailInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // If Google Client ID is configured and Google script is loaded, render official button
    if (googleClientId && window.google && window.google.accounts && googleBtnRef.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            if (response.credential) {
              setLoading(true);
              setErrorMsg('');
              try {
                await onGoogleLogin(response.credential);
              } catch (err) {
                setErrorMsg(err.message || 'Erro no login com o Google.');
              } finally {
                setLoading(false);
              }
            }
          },
          auto_select: false
        });

        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 320
        });
      } catch (err) {
        console.warn('Google GSI render error:', err);
      }
    }
  }, [googleClientId, onGoogleLogin]);

  const handleGuestSubmit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      await onGuestLogin();
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao entrar como convidado.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setLoading(true);
    setErrorMsg('');
    try {
      await onEmailLogin(emailInput.trim(), nameInput.trim() || 'Aventureiro');
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao realizar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background magical glow effects */}
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, rgba(168, 85, 247, 0.05) 50%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0
        }}
      />

      <div
        className="glass-panel"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '36px 32px',
          borderRadius: '24px',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.1)',
          position: 'relative',
          zIndex: 1,
          textAlign: 'center'
        }}
      >
        {/* Emblem / Logo */}
        <div
          style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 20px auto',
            borderRadius: '24px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)',
            border: '2px solid rgba(245, 158, 11, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.5rem',
            boxShadow: '0 0 25px rgba(245, 158, 11, 0.3)'
          }}
        >
          ⚔️
        </div>

        {/* Title */}
        <h1
          className="font-cinzel"
          style={{
            fontSize: '1.75rem',
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: '0.02em',
            marginBottom: '6px'
          }}
        >
          Grimório de Missões
        </h1>
        <p style={{ color: '#fbbf24', fontSize: '0.9rem', fontWeight: 600, marginBottom: '24px' }}>
          Chronicles of Focus & Execution
        </p>

        {errorMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontSize: '0.85rem',
              marginBottom: '20px'
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Google Sign-in Section */}
        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {googleClientId ? (
            <div ref={googleBtnRef} style={{ minHeight: '44px', display: 'flex', justifyContent: 'center' }} />
          ) : (
            <button
              onClick={() => {
                // Prompt user or execute simulated Google login if no client ID set
                const mockEmail = prompt('Digite seu e-mail do Google (ou deixe em branco para o padrão):', 'usuario@gmail.com');
                if (mockEmail !== null) {
                  onEmailLogin(mockEmail.trim() || 'usuario@gmail.com', mockEmail.split('@')[0]);
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#ffffff',
                color: '#1f2937',
                fontWeight: 700,
                fontSize: '0.95rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(255, 255, 255, 0.15)',
                transition: 'transform 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              {/* Google SVG Logo */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
              <span>Entrar com o Google</span>
            </button>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0', color: '#64748b', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
          <span>ou</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
        </div>

        {/* Quick Guest Login Button */}
        <button
          onClick={handleGuestSubmit}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '0.95rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
            marginBottom: '12px',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Sparkles size={18} />
          <span>Entrar no Grimório (Acesso Rápido)</span>
        </button>

        {/* Direct Email Form Toggle */}
        {!showEmailForm ? (
          <button
            onClick={() => setShowEmailForm(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '0.82rem',
              cursor: 'pointer',
              textDecoration: 'underline',
              marginTop: '6px'
            }}
          >
            Entrar com outro e-mail ou nome
          </button>
        ) : (
          <form onSubmit={handleEmailSubmit} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                Nome do Herói:
              </label>
              <input
                type="text"
                placeholder="Ex: Mestre Arcano"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                E-mail:
              </label>
              <input
                type="email"
                required
                placeholder="seu-email@dominio.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '0.88rem'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                marginTop: '4px'
              }}
            >
              Confirmar Login
            </button>
          </form>
        )}

        {/* Footer Info / Production Help */}
        <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={() => setShowHelpModal(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer'
            }}
          >
            <HelpCircle size={14} /> Como ativar o Google Login em Produção?
          </button>
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              borderRadius: '20px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              textAlign: 'left'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', marginBottom: '14px' }}>
              🌐 Configuração para Produção
            </h3>

            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p>
                Para habilitar o botão oficial do Google Sign-In no seu domínio de produção:
              </p>
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>Acesse o <strong>Google Cloud Console</strong> (<span style={{ color: '#38bdf8' }}>console.cloud.google.com</span>).</li>
                <li>Crie um projeto e configure a <strong>Tela de consentimento OAuth</strong>.</li>
                <li>Vá em <strong>Credenciais</strong> &gt; <strong>Criar Credencial</strong> &gt; <strong>ID do cliente OAuth (Aplicativo Web)</strong>.</li>
                <li>Adicione seu domínio (ex: <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>https://seu-site.com</code> e <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px' }}>http://localhost:3000</code>) em <em>Origens JavaScript autorizadas</em>.</li>
                <li>Defina a variável de ambiente no seu servidor / plataforma de hospedagem:
                  <div style={{ background: '#0a0d14', padding: '8px 12px', borderRadius: '8px', marginTop: '6px', fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>
                    GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
                  </div>
                </li>
              </ol>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '4px' }}>
                💡 Enquanto isso, o botão de acesso rápido e login por e-mail continuam 100% funcionais!
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                onClick={() => setShowHelpModal(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#000',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
