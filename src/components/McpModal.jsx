import React, { useState, useEffect } from 'react';
import { Bot, Copy, Check, RefreshCw, X, ShieldCheck, Key, Terminal, Code, Cpu, Sparkles, ExternalLink } from 'lucide-react';

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

# 1. Obter Análises do Oráculo (Somente Leitura)
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

# 2. Criar uma Nova Missão
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

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          maxWidth: '780px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px',
          borderRadius: '20px',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.15)',
          color: '#f8fafc'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8'
              }}
            >
              <Bot size={24} />
            </div>
            <div>
              <h2 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                Conexão MCP & Agentes de IA
              </h2>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Model Context Protocol: integração segura para Claude, Cursor e agentes externos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Badge */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="#10b981" />
            <span style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 600 }}>
              Servidor MCP Ativo & Autenticado por Bearer Token
            </span>
          </div>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '3px 8px',
              borderRadius: '999px',
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              fontWeight: 700
            }}
          >
            47 Ferramentas CRUD + Oráculo
          </span>
        </div>

        {/* Token Section */}
        <div
          style={{
            padding: '16px',
            borderRadius: '14px',
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '22px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Key size={15} color="#fbbf24" /> Seu Bearer Token MCP
            </span>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              style={{
                fontSize: '0.75rem',
                color: '#f87171',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RefreshCw size={12} className={regenerating ? 'animate-spin' : ''} />
              <span>Regenerar Token</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type={showToken ? 'text' : 'password'}
              readOnly
              value={token}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#fbbf24',
                fontFamily: 'monospace',
                fontSize: '0.88rem'
              }}
            />
            <button
              onClick={() => setShowToken(!showToken)}
              style={{
                padding: '0 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontSize: '0.78rem',
                cursor: 'pointer'
              }}
            >
              {showToken ? 'Ocultar' : 'Revelar'}
            </button>
            <button
              onClick={() => copyToClipboard(token, 'token')}
              style={{
                padding: '0 16px',
                borderRadius: '8px',
                background: copiedToken ? '#10b981' : '#38bdf8',
                border: 'none',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {copiedToken ? <Check size={16} /> : <Copy size={16} />}
              <span>{copiedToken ? 'Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        {/* Integration Instructions & Tabs */}
        <div>
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px', marginBottom: '14px' }}>
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
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                    border: `1px solid ${isActive ? 'rgba(56, 189, 248, 0.4)' : 'transparent'}`,
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                {activeTab === 'claude' && 'Cole no arquivo claude_desktop_config.json:'}
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
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copiedConfig ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copiedConfig ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: '14px',
                borderRadius: '10px',
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#38bdf8',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                lineHeight: 1.45,
                overflowX: 'auto',
                maxHeight: '260px'
              }}
            >
              {activeTab === 'claude' && claudeConfig}
              {activeTab === 'cursor' && cursorConfig}
              {activeTab === 'python' && pythonSnippet}
              {activeTab === 'curl' && curlSnippet}
            </pre>
          </div>
        </div>

        {/* Footer Note */}
        <div style={{ marginTop: '22px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            🔮 O MCP dá acesso aos dados em tempo real mantendo total sincronia com o PostgreSQL/Supabase.
          </span>
          <button
            onClick={onClose}
            className="btn-primary"
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
