import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Copy, Check, RefreshCw, X, ShieldCheck, Key, Terminal, Code, Cpu, Sparkles, Database, CheckCircle2 } from 'lucide-react';

export function McpModal({ isOpen, onClose }) {
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('claude'); // 'claude' | 'cursor' | 'python' | 'curl'

  useEffect(() => {
    if (isOpen) {
      fetchTokenInfo();
    }
  }, [isOpen]);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const fetchTokenInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/mcp/token');
      const data = await res.json();
      if (data.success) {
        setTokenInfo(data);
      }
    } catch (err) {
      console.error('Erro ao buscar token MCP:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!window.confirm('Tem certeza que deseja regenerar o Bearer Token do MCP? Agentes que estiverem usando o token antigo precisarão ser atualizados.')) {
      return;
    }

    try {
      setRegenerating(true);
      const res = await fetch('/api/mcp/token/regenerate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTokenInfo(data);
      }
    } catch (err) {
      console.error('Erro ao regenerar token MCP:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const copyToClipboard = (text, type = 'token') => {
    navigator.clipboard.writeText(text);
    if (type === 'token') {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } else {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    }
  };

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sseEndpoint = `${currentOrigin}/mcp/sse`;
  const jsonRpcEndpoint = `${currentOrigin}/api/mcp`;
  const token = tokenInfo?.token || 'Carregando...';

  // Configuration Snippets
  const claudeConfig = JSON.stringify({
    mcpServers: {
      "grimorio-missoes": {
        "command": "node",
        "args": [
          "c:/Coder/Projetos/Memory/server/mcpCli.js"
        ],
        "env": {
          "MCP_BEARER_TOKEN": token
        }
      }
    }
  }, null, 2);

  const cursorConfig = JSON.stringify({
    "mcpServers": {
      "grimorio": {
        "url": `${sseEndpoint}?token=${token}`,
        "headers": {
          "Authorization": `Bearer ${token}`
        }
      }
    }
  }, null, 2);

  const pythonSnippet = `import requests

API_URL = "${jsonRpcEndpoint}"
BEARER_TOKEN = "${token}"

headers = {
    "Authorization": f"Bearer {BEARER_TOKEN}",
    "Content-Type": "application/json"
}

# 1. Consultar Análises do Oráculo (Somente Leitura)
response = requests.post(API_URL, headers=headers, json={
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
        "name": "get_oracle_analytics",
        "arguments": {}
    }
})
print("Oráculo:", response.json())

# 2. Criar Nova Missão no Grimório
nova_missao = requests.post(API_URL, headers=headers, json={
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "create_quest",
        "arguments": {
            "title": "Missão Criada por Agente de IA",
            "priority": "alta",
            "category": "Trabalho"
        }
    }
})
print("Missão Criada:", nova_missao.json())`;

  const curlSnippet = `curl -X POST ${jsonRpcEndpoint} \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "get_oracle_analytics",
      "arguments": {}
    }
  }'`;

  const modalContent = (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 7, 13, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel modal-sheet"
        style={{
          maxWidth: '820px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '24px',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          background: '#0c101d',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.95), 0 0 40px rgba(56, 189, 248, 0.15)',
          color: '#f8fafc',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, rgba(56, 189, 248, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
                boxShadow: '0 0 15px rgba(56, 189, 248, 0.2)'
              }}
            >
              <Bot size={26} />
            </div>
            <div>
              <h2 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', margin: 0 }}>
                Conexão MCP & Agentes de IA
              </h2>
              <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                Model Context Protocol: integração segura para Claude Desktop, Cursor e agentes externos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#f8fafc'}
            onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div
          style={{
            padding: '24px 28px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Status Badge */}
          <div
            style={{
              padding: '14px 18px',
              borderRadius: '14px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={20} color="#10b981" />
              <div>
                <span style={{ fontSize: '0.88rem', color: '#34d399', fontWeight: 700, display: 'block' }}>
                  Servidor MCP Ativo & Autenticado por Bearer Token
                </span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Acesso seguro em tempo real conectado com a base de dados
                </span>
              </div>
            </div>
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 12px',
                borderRadius: '999px',
                background: 'rgba(56, 189, 248, 0.18)',
                color: '#38bdf8',
                fontWeight: 700,
                border: '1px solid rgba(56, 189, 248, 0.35)'
              }}
            >
              47 Ferramentas CRUD + Oráculo
            </span>
          </div>

          {/* Token Management Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'rgba(0, 0, 0, 0.45)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.86rem', color: '#e2e8f0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Key size={16} color="#fbbf24" /> Seu Bearer Token MCP
              </span>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                style={{
                  fontSize: '0.78rem',
                  color: '#f87171',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '6px'
                }}
                title="Gerar novo Bearer Token"
              >
                <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} />
                <span>Regenerar Token</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type={showToken ? 'text' : 'password'}
                readOnly
                value={token}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: '#070a13',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fbbf24',
                  fontFamily: 'monospace',
                  fontSize: '0.92rem',
                  letterSpacing: showToken ? 'normal' : '0.15em'
                }}
              />
              <button
                onClick={() => setShowToken(!showToken)}
                style={{
                  padding: '0 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#94a3b8',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
              >
                {showToken ? 'Ocultar' : 'Revelar'}
              </button>
              <button
                onClick={() => copyToClipboard(token, 'token')}
                style={{
                  padding: '0 20px',
                  borderRadius: '10px',
                  background: copiedToken ? '#10b981' : '#38bdf8',
                  border: 'none',
                  color: '#070a13',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: copiedToken ? '0 0 15px rgba(16, 185, 129, 0.3)' : '0 0 15px rgba(56, 189, 248, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {copiedToken ? <Check size={16} /> : <Copy size={16} />}
                <span>{copiedToken ? 'Copiado!' : 'Copiar Token'}</span>
              </button>
            </div>
          </div>

          {/* Configuration Snippets Tabs */}
          <div>
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
              {[
                { id: 'claude', label: 'Claude Desktop', icon: Cpu },
                { id: 'cursor', label: 'Cursor AI', icon: Terminal },
                { id: 'python', label: 'Script Python', icon: Code },
                { id: 'curl', label: 'cURL HTTP', icon: Terminal }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '10px',
                      background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(56, 189, 248, 0.4)' : 'transparent'}`,
                      color: isActive ? '#38bdf8' : '#94a3b8',
                      fontSize: '0.84rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={16} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Code View Header & Copy Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                {activeTab === 'claude' && 'Adicione ao arquivo claude_desktop_config.json:'}
                {activeTab === 'cursor' && 'Configuração para Cursor AI (Features > MCP Servers):'}
                {activeTab === 'python' && 'Exemplo de script para agentes em Python:'}
                {activeTab === 'curl' && 'Chamada JSON-RPC direta via cURL:'}
              </span>
              <button
                onClick={() => {
                  let textToCopy = '';
                  if (activeTab === 'claude') textToCopy = claudeConfig;
                  else if (activeTab === 'cursor') textToCopy = cursorConfig;
                  else if (activeTab === 'python') textToCopy = pythonSnippet;
                  else if (activeTab === 'curl') textToCopy = curlSnippet;
                  copyToClipboard(textToCopy, 'config');
                }}
                style={{
                  fontSize: '0.78rem',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 600
                }}
              >
                {copiedConfig ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                <span>{copiedConfig ? 'Copiado!' : 'Copiar Configuração'}</span>
              </button>
            </div>

            {/* Code Box */}
            <pre
              style={{
                margin: 0,
                padding: '16px',
                borderRadius: '12px',
                background: '#060911',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#38bdf8',
                fontFamily: 'monospace',
                fontSize: '0.84rem',
                lineHeight: 1.5,
                overflowX: 'auto',
                maxHeight: '280px'
              }}
            >
              {activeTab === 'claude' && claudeConfig}
              {activeTab === 'cursor' && cursorConfig}
              {activeTab === 'python' && pythonSnippet}
              {activeTab === 'curl' && curlSnippet}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.25)'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            🔮 O MCP dá acesso aos dados em tempo real mantendo total sincronia com o PostgreSQL/Supabase.
          </span>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              fontSize: '0.88rem',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
