import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchWithRetry, isTransientHttpStatus } from '../utils/httpClient.js';

const AuthContext = createContext(null);

const TOKEN_STORAGE_KEY = 'grimorio_auth_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [googleClientId, setGoogleClientId] = useState('');

  // Fetch server configuration (e.g. Google Client ID)
  useEffect(() => {
    fetch('/api/auth/config')
      .then(res => res.json())
      .then(data => {
        if (data.googleClientId) {
          setGoogleClientId(data.googleClientId);
        }
      })
      .catch(err => console.warn('Could not fetch auth config:', err));
  }, []);

  // Validate existing token on load
  const checkSession = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!storedToken) {
      setLoadingAuth(false);
      return;
    }

    try {
      const res = await fetchWithRetry('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${storedToken}`
        }
      }, { retries: 5 });
      if (!res.ok) {
        if (isTransientHttpStatus(res.status)) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        }
        const data = await res.json().catch(() => ({}));
        if (!data.authenticated) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setUser(null);
        }
        return;
      }
      const data = await res.json();
      if (data.authenticated && data.user) {
        setToken(storedToken);
        setUser(data.user);
        if (data.userProfile) setUserProfile(data.userProfile);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
        setUser(null);
      }
    } catch (err) {
      console.error('Error validating auth session:', err);
      // Cold start / 502: não desloga. Mantém a sessão local até o servidor responder.
      setToken(storedToken);
      setUser((prev) => prev || {
        id: 'pending-session',
        name: 'Aventureiro',
        email: ''
      });
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const loginWithGoogle = async (credential) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar com o Google');
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.userProfile) setUserProfile(data.userProfile);
    return data;
  };

  const loginWithEmail = async (email, name) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao realizar login');
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.userProfile) setUserProfile(data.userProfile);
    return data;
  };

  const loginAsGuest = async () => {
    const res = await fetch('/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao entrar como convidado');
    }

    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    if (data.userProfile) setUserProfile(data.userProfile);
    return data;
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Logout notification failed:', e);
      }
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
    setUserProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        userProfile,
        isAuthenticated: !!token && !!user,
        loadingAuth,
        googleClientId,
        loginWithGoogle,
        loginWithEmail,
        loginAsGuest,
        logout,
        refreshSession: checkSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
