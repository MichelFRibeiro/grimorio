import React, { useMemo, useState } from 'react';
import { icons as LucideIcons } from 'lucide-react';
import {
  MIND_MAP_ALL_ICONS,
  MIND_MAP_FEATURED_ICONS,
  MIND_MAP_ICON_CATEGORIES,
  sanitizeMindMapIcon
} from '../utils/mindMapIcons';

const FALLBACK_ICON = LucideIcons.Sparkles;

export function MindMapIcon({ name, size = 16, color = 'currentColor', strokeWidth = 2, style }) {
  const iconName = sanitizeMindMapIcon(name);
  if (!iconName) return null;
  const Icon = LucideIcons[iconName] || FALLBACK_ICON;
  if (!Icon) return null;
  return <Icon size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export function MindMapThumb({ node, size = 28, color }) {
  if (!node) return null;
  if (node.imageUrl) {
    return (
      <img
        src={node.imageUrl}
        alt=""
        className="mindmap-thumb"
        style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  if (node.icon) {
    return (
      <span
        className="mindmap-thumb is-icon"
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color || node.color || '#a855f7'}22`,
          color: color || node.color || '#c084fc',
          flexShrink: 0
        }}
      >
        <MindMapIcon name={node.icon} size={Math.max(12, size - 10)} color={color || node.color || '#c084fc'} />
      </span>
    );
  }
  return null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export function MindMapMediaPicker({
  icon = '',
  imageUrl = '',
  color = '#c084fc',
  onChange
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Destaques');
  const [urlDraft, setUrlDraft] = useState('');
  const [error, setError] = useState('');

  const icons = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool;
    if (q) {
      pool = MIND_MAP_ALL_ICONS.filter(name => name.toLowerCase().includes(q));
    } else if (category === 'Destaques') {
      pool = MIND_MAP_FEATURED_ICONS;
    } else if (category === 'Todos') {
      pool = MIND_MAP_ALL_ICONS;
    } else {
      pool = MIND_MAP_ICON_CATEGORIES[category] || MIND_MAP_FEATURED_ICONS;
    }
    return pool.slice(0, q ? 180 : 240);
  }, [query, category]);

  const applyIcon = (name) => {
    setError('');
    onChange({ icon: name, imageUrl: '' });
  };

  const applyImage = (nextUrl) => {
    setError('');
    onChange({ icon: '', imageUrl: nextUrl });
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Escolha um arquivo de imagem.');
      return;
    }
    if (file.size > 420000) {
      setError('A imagem deve ter no máximo 400 KB.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      applyImage(dataUrl);
    } catch (err) {
      setError(err.message || 'Falha ao carregar a imagem.');
    }
  };

  const categoryNames = ['Destaques', ...Object.keys(MIND_MAP_ICON_CATEGORIES), 'Todos'];

  return (
    <div className="mindmap-media-picker">
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>
        Ícone ou imagem
      </div>
      {(icon || imageUrl) && (
        <div className="mindmap-media-preview">
          <MindMapThumb node={{ icon, imageUrl, color }} size={36} />
          <span style={{ fontSize: '0.78rem', color: '#cbd5e1', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {imageUrl ? 'Imagem no ramo' : icon}
          </span>
          <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => onChange({ icon: '', imageUrl: '' })}>
            Remover
          </button>
        </div>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Buscar entre ${MIND_MAP_ALL_ICONS.length} ícones...`}
        style={pickerInputStyle}
      />
      <div className="mindmap-icon-cats">
        {categoryNames.map((name) => (
          <button
            key={name}
            type="button"
            className={`mindmap-chip ${!query && category === name ? 'is-on' : ''}`}
            onClick={() => { setCategory(name); setQuery(''); }}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mindmap-icon-grid">
        {icons.map((name) => {
          const selected = icon === name && !imageUrl;
          return (
            <button
              key={name}
              type="button"
              title={name}
              className={`mindmap-icon-cell ${selected ? 'is-on' : ''}`}
              onClick={() => applyIcon(name)}
            >
              <MindMapIcon name={name} size={16} color={selected ? '#fbbf24' : '#e2e8f0'} />
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 6 }}>
        {query ? `${icons.length} resultados` : `${MIND_MAP_ALL_ICONS.length} ícones Lucide disponíveis.`}
      </p>
      <label className="mindmap-ghost-btn" style={{ marginTop: 10, justifyContent: 'center', cursor: 'pointer' }}>
        Enviar imagem
        <input type="file" accept="image/*" onChange={onPickFile} style={{ display: 'none' }} />
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://… imagem"
          style={{ ...pickerInputStyle, margin: 0 }}
        />
        <button
          type="button"
          className="mindmap-ghost-btn"
          onClick={() => {
            if (!urlDraft.trim()) return;
            applyImage(urlDraft.trim());
            setUrlDraft('');
          }}
        >
          Usar
        </button>
      </div>
      {error && <p style={{ color: '#f87171', fontSize: '0.75rem', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

const pickerInputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '10px',
  background: '#0c0e14',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f8fafc',
  fontSize: '0.82rem',
  marginTop: 4
};
