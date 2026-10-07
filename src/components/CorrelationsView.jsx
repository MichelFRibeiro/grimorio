import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Brain,
  FlaskConical,
  GitCompare,
  Moon,
  Pill,
  ShieldAlert,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp
} from 'lucide-react';

const RELATIONS = [
  { id: 'all', label: 'Todas' },
  { id: 'andam-juntas', label: 'Andam juntas' },
  { id: 'uma-exclui-a-outra', label: 'Uma exclui a outra' },
  { id: 'dia-seguinte', label: 'No dia seguinte' },
  { id: 'efeito-no-dia', label: 'Efeito no dia' },
  { id: 'efeito-no-dia-seguinte', label: 'Efeito no dia seguinte' }
];

const VERDICTS = [
  { id: 'all', label: 'Tudo' },
  { id: 'ajuda', label: 'O que ajuda' },
  { id: 'atrapalha', label: 'O que atrapalha' }
];

function formatP(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value < 0.0001) return '< 0,0001';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function formatEffect(finding) {
  if (finding.family === 'regression') {
    const beta = finding.betaStd ?? finding.effect;
    if (beta == null) return '—';
    return `β ${beta > 0 ? '+' : ''}${beta.toFixed(2)}`;
  }
  const phi = finding.phi ?? finding.effect;
  if (phi == null) return '—';
  return `φ ${phi > 0 ? '+' : ''}${phi.toFixed(2)}`;
}

function confidenceLabel(value) {
  if (value === 'alta') return 'confiança alta';
  if (value === 'média') return 'confiança média';
  return 'confiança baixa';
}

function FindingCard({ finding }) {
  const harmful = finding.verdict === 'atrapalha';
  const Icon = harmful ? TrendingDown : TrendingUp;
  return (
    <article className={`correlation-card${harmful ? ' is-harmful' : ' is-helpful'}`}>
      <header>
        <span className={`correlation-verdict${harmful ? ' is-harmful' : ''}`}>
          <Icon size={14} />
          {harmful ? 'Atrapalha' : 'Ajuda'}
        </span>
        <span className="correlation-method">{finding.method}</span>
      </header>
      <p>{finding.text}</p>
      <div className="correlation-pair">
        <strong>{finding.source.label}</strong>
        <ArrowRight size={14} />
        <strong>{finding.target.label}</strong>
        {finding.lag ? <em>dia seguinte</em> : null}
      </div>
      <footer>
        <span>{formatEffect(finding)}</span>
        <span>p {formatP(finding.pValue)}</span>
        <span>{finding.support} dia{finding.support === 1 ? '' : 's'} com o gatilho</span>
        <span>{confidenceLabel(finding.confidence)}</span>
        {finding.lift != null && finding.family !== 'regression' ? <span>lift {finding.lift}</span> : null}
        {finding.delta != null ? (
          <span>
            {finding.delta > 0 ? '+' : ''}
            {finding.delta}
            {finding.unit === '%' ? ' p.p.' : finding.unit === 'min' ? ' min' : ''}
          </span>
        ) : null}
      </footer>
    </article>
  );
}

function EmptyState({ report }) {
  const coverage = report?.coverage || [];
  return (
    <div className="glass-panel correlation-empty">
      <Brain size={28} />
      <h3 className="font-cinzel">{report?.summary?.headline || 'Sem padrão ainda.'}</h3>
      <p>{report?.summary?.detail}</p>
      {coverage.length > 0 && (
        <ul>
          {coverage.slice(0, 8).map((group) => (
            <li key={group.group}>
              <strong>{group.group}</strong>
              <span>{group.usable} de {group.variables} com amostra mínima</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CorrelationsView({ report }) {
  const [relation, setRelation] = useState('all');
  const [verdict, setVerdict] = useState('all');
  const findings = report?.findings || [];

  const visible = useMemo(() => findings.filter((finding) => {
    if (relation !== 'all' && finding.relation !== relation) return false;
    if (verdict !== 'all' && finding.verdict !== verdict) return false;
    return true;
  }), [findings, relation, verdict]);

  if (!report) {
    return (
      <section className="correlations-view">
        <div className="glass-panel correlation-empty">
          <Brain size={28} />
          <h3 className="font-cinzel">Correlações indisponíveis</h3>
          <p>O relatório ainda não chegou do servidor. Atualize a página.</p>
        </div>
      </section>
    );
  }

  const phone = report.highlights?.phone || [];
  const supplements = report.highlights?.supplements || [];

  return (
    <section className="correlations-view">
      <header className="correlations-header">
        <div>
          <p className="correlations-kicker"><GitCompare size={14} /> Padrões entre os seus dias</p>
          <h2 className="font-cinzel">Correlações</h2>
          <p>
            O Grimório cruza o que você fez, tomou e registrou. Um padrão só aparece
            se sobreviver ao teste estatístico e à correção para os vários pares examinados.
            Correlação não é causa.
          </p>
        </div>
      </header>

      <div className="correlations-kpis">
        <div className="glass-panel">
          <Sparkles size={16} />
          <strong>{findings.length}</strong>
          <span>padrões confiáveis</span>
        </div>
        <div className="glass-panel">
          <FlaskConical size={16} />
          <strong>{report.tested?.pairs + report.tested?.regressions || 0}</strong>
          <span>cruzamentos examinados</span>
        </div>
        <div className="glass-panel">
          <Moon size={16} />
          <strong>{report.observedDays}</strong>
          <span>dias na janela</span>
        </div>
        <div className="glass-panel">
          <Smartphone size={16} />
          <strong>{report.phoneLoggedDays}</strong>
          <span>dias com celular</span>
        </div>
      </div>

      <div className="glass-panel correlation-lead">
        <h3 className="font-cinzel">{report.summary?.headline}</h3>
        <p>{report.summary?.detail}</p>
      </div>

      {(phone.length > 0 || supplements.length > 0) && (
        <div className="correlations-highlights">
          {phone.length > 0 && (
            <div className="glass-panel">
              <h3><Smartphone size={16} /> Celular</h3>
              {phone.map((finding) => <p key={finding.id}>{finding.text}</p>)}
            </div>
          )}
          {supplements.length > 0 && (
            <div className="glass-panel">
              <h3><Pill size={16} /> Suplementos</h3>
              {supplements.map((finding) => <p key={finding.id}>{finding.text}</p>)}
            </div>
          )}
        </div>
      )}

      {findings.length === 0 ? (
        <EmptyState report={report} />
      ) : (
        <>
          <div className="correlations-filters">
            {RELATIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={relation === item.id ? 'is-active' : ''}
                onClick={() => setRelation(item.id)}
              >
                {item.label}
              </button>
            ))}
            <span className="correlations-filter-gap" />
            {VERDICTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={verdict === item.id ? 'is-active' : ''}
                onClick={() => setVerdict(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <div className="glass-panel correlation-empty">
              <ShieldAlert size={22} />
              <p>Nenhum padrão neste recorte. Troque o filtro.</p>
            </div>
          ) : (
            <div className="correlations-list">
              {visible.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
            </div>
          )}
        </>
      )}

      <p className="correlations-footnote">
        Janela de {report.windowDays} dias. Cada descoberta passou em suporte mínimo,
        tamanho de efeito e p-valor corrigido
        {report.thresholds?.adjustedAlpha != null ? ` (α ${formatP(report.thresholds.adjustedAlpha)})` : ''}.
        Um padrão novo pode desaparecer quando a amostra crescer — é o teste funcionando.
      </p>
    </section>
  );
}
