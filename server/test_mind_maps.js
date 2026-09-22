import {
  createMindMap,
  addMindMapNode,
  updateMindMapNode,
  updateMindMapMeta,
  deleteMindMapNode,
  addMindMapCrossLink,
  updateMindMapCrossLink,
  deleteMindMapCrossLink,
  layoutMindMap,
  mindMapNodeFontSize,
  sanitizeMindMapNodeFontSize,
  stepMindMapNodeFontSize,
  MIND_MAP_BASE_FONT_SIZE,
  MIND_MAP_MAX_FONT_SIZE,
  MIND_MAP_MIN_FONT_SIZE,
  getStudyQueue,
  applyStudySession,
  computeStudyRewards,
  sanitizeMindMap,
  sanitizeMindMaps,
  sanitizeMindMapCategories,
  createMindMapCategory,
  groupMapsByCategory,
  mindMapCategoryLabel,
  reassignMindMapCategory,
  countBranches,
  getRootNode,
  childrenOf
} from '../src/utils/mindMaps.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log('🧪 Testes de Mapas Mentais...\n');

  const map = createMindMap({
    title: 'Direito Constitucional',
    description: 'Núcleo da CF/88',
    category: 'Estudos'
  });
  assert(map.title === 'Direito Constitucional', 'Cria mapa com título');
  assert(map.lineStyle === 'taper', 'Mapa novo usa galhos que afinam');
  assert(map.scaleFontByDepth === false, 'Mapa novo começa com fonte uniforme');
  assert(Array.isArray(map.crossLinks) && map.crossLinks.length === 0, 'Mapa novo começa sem ligações extras');
  assert(!!getRootNode(map), 'Cria o núcleo do mapa');
  assert(countBranches(map) === 0, 'Mapa novo começa só com o núcleo');

  const withRights = addMindMapNode(map, { parentId: map.rootId, label: 'Direitos Fundamentais' });
  const withOrg = addMindMapNode(withRights, { parentId: map.rootId, label: 'Organização do Estado' });
  const art5 = addMindMapNode(withOrg, {
    parentId: childrenOf(withOrg, withOrg.rootId).find(n => n.label === 'Direitos Fundamentais').id,
    label: 'Art. 5º',
    notes: 'Direitos e deveres individuais e coletivos'
  });
  assert(countBranches(art5) === 3, 'Três ramos após cadastro');
  assert(art5.nodes.some(n => n.label === 'Art. 5º' && n.notes.includes('individuais')), 'Persiste anotação no ramo');

  const renamed = updateMindMapNode(art5, art5.rootId, { label: 'CF/88' });
  assert(getRootNode(renamed).label === 'CF/88', 'Atualiza o núcleo');

  const rightsId = childrenOf(renamed, renamed.rootId).find(n => n.label === 'Direitos Fundamentais').id;
  const art5Id = childrenOf(renamed, rightsId)[0].id;
  const extra = addMindMapNode(renamed, { parentId: art5Id, label: 'Direito de petição' });
  const pruned = deleteMindMapNode(extra, rightsId);
  assert(!pruned.nodes.some(n => n.label === 'Direitos Fundamentais'), 'Exclui o ramo');
  assert(!pruned.nodes.some(n => n.label === 'Art. 5º'), 'Exclui os descendentes');
  assert(pruned.nodes.some(n => n.label === 'Organização do Estado'), 'Mantém ramos irmãos');

  let blocked = false;
  try {
    deleteMindMapNode(pruned, pruned.rootId);
  } catch {
    blocked = true;
  }
  assert(blocked, 'Impede excluir o núcleo');

  const laid = layoutMindMap(art5);
  const laidRoot = getRootNode(laid);
  assert(laidRoot.x === 0 && laidRoot.y === 0, 'Layout centra o núcleo');
  assert(laid.nodes.filter(n => n.parentId).every(n => n.x !== 0 || n.y !== 0), 'Layout posiciona os ramos');

  const queueBranches = getStudyQueue(art5, { today: '2026-04-01', mode: 'branches' });
  assert(queueBranches.length >= 1, 'Fila de estudo por ramos inclui pais com filhos');
  assert(queueBranches.some(q => q.prompt === 'Direitos Fundamentais'), 'Pergunta pelo rótulo do pai');

  const queueCards = getStudyQueue(art5, { today: '2026-04-01', mode: 'cards' });
  assert(queueCards.some(q => q.answer === 'Art. 5º'), 'Modo cartão usa o filho como resposta');

  const rewards = computeStudyRewards({ reviewed: 4, recalled: 4, durationMinutes: 12 });
  assert(rewards.xp >= 32 + 25 + 5, 'Bônus de sessão perfeita e duração');
  assert(rewards.accuracy === 100, 'Taxa de acerto 100%');

  const studied = applyStudySession(art5, [
    { nodeId: rightsId, quality: 3 },
    { nodeId: art5Id, quality: 0 }
  ], { today: '2026-04-01', durationMinutes: 15, mode: 'branches' });
  assert(studied.session.reviewed === 2, 'Sessão conta ramos revisados');
  assert(studied.session.recalled === 1, 'Qualidade 0 não conta como lembrado');
  const easyNode = studied.map.nodes.find(n => n.id === rightsId);
  const forgotNode = studied.map.nodes.find(n => n.id === art5Id);
  assert(easyNode.dueDate > '2026-04-01', 'Acerto fácil adia a próxima revisão');
  assert(forgotNode.dueDate === '2026-04-01', 'Esquecimento mantém o ramo para hoje');
  assert(studied.map.lastStudiedAt === '2026-04-01', 'Atualiza última sessão de estudo');

  const dirty = sanitizeMindMap({
    title: '  Processo Civil  ',
    nodes: [
      { id: 'a', label: 'CPC', x: 0, y: 0 },
      { id: 'b', parentId: 'a', label: 'Petição inicial' },
      { id: 'orphan', parentId: 'missing', label: 'Órfão' }
    ]
  });
  assert(dirty.title === 'Processo Civil', 'Sanitize corta o título');
  assert(dirty.nodes.every(n => n.id !== 'orphan' || !n.parentId || dirty.nodes.some(p => p.id === n.parentId)), 'Remove ou reconecta órfãos');
  assert(sanitizeMindMaps([null, { foo: 1 }, dirty]).length === 1, 'Lista ignora mapas inválidos');

  let untitled = false;
  try {
    createMindMap({ title: '   ' });
  } catch {
    untitled = true;
  }
  assert(untitled, 'Rejeita mapa sem título');

  const withIcon = addMindMapNode(map, { parentId: map.rootId, label: 'Balança', icon: 'Scale' });
  const scaleNode = withIcon.nodes.find(n => n.label === 'Balança');
  assert(scaleNode.icon === 'Scale', 'Persiste ícone Lucide no ramo');
  const withImage = updateMindMapNode(withIcon, scaleNode.id, { imageUrl: 'https://exemplo.test/balanca.png', icon: '' });
  const imaged = withImage.nodes.find(n => n.id === scaleNode.id);
  assert(imaged.imageUrl.includes('exemplo.test'), 'Persiste imagem no ramo');
  assert(imaged.icon === '', 'Imagem substitui o ícone');
  const cleaned = updateMindMapNode(withImage, scaleNode.id, { imageUrl: 'javascript:alert(1)' });
  assert(!cleaned.nodes.find(n => n.id === scaleNode.id).imageUrl, 'Rejeita URL de imagem inválida');
  const sanitized = sanitizeMindMap({
    title: 'Com mídia',
    nodes: [{ id: 'n1', label: 'Núcleo', icon: 'BookOpen', imageUrl: 'https://cdn.test/a.png', x: 0, y: 0 }]
  });
  assert(sanitized.nodes[0].icon === 'BookOpen', 'Sanitize mantém ícone');
  assert(sanitized.nodes[0].imageUrl.startsWith('https://'), 'Sanitize mantém imagem http');

  const cats = [];
  const constitucional = createMindMapCategory({ name: 'Direito Constitucional', color: '#a855f7' }, cats);
  cats.push(constitucional);
  const cf88 = createMindMapCategory({ name: 'CF/88', parentId: constitucional.id }, cats);
  cats.push(cf88);
  assert(cf88.parentId === constitucional.id, 'Subassunto aponta para o assunto');
  let deep = false;
  try {
    createMindMapCategory({ name: 'Art. 5', parentId: cf88.id }, cats);
  } catch {
    deep = true;
  }
  assert(deep, 'Impede terceiro nível de assunto');

  const mapped = createMindMap({ title: 'Princípios fundamentais', categoryId: cf88.id, category: cf88.name });
  assert(mindMapCategoryLabel(cats, mapped.categoryId) === 'Direito Constitucional · CF/88', 'Rótulo composto assunto · subassunto');
  const grouped = groupMapsByCategory([mapped], cats);
  assert(grouped[0].root.name === 'Direito Constitucional', 'Agrupa pelo assunto raiz');
  assert(grouped[0].topics.some(t => t.category.id === cf88.id && t.maps.length === 1), 'Coloca o mapa no subassunto');

  const moved = reassignMindMapCategory([mapped], cf88.id, constitucional);
  assert(moved[0].categoryId === constitucional.id, 'Reatribui mapas ao excluir subassunto');
  const lined = updateMindMapMeta(map, { lineStyle: 'curve' });
  assert(lined.lineStyle === 'curve', 'Alterna para linhas clássicas');
  const scaled = updateMindMapMeta(map, { scaleFontByDepth: true });
  assert(scaled.scaleFontByDepth === true, 'Ativa fonte maior perto do núcleo');
  assert(mindMapNodeFontSize(0, true) > mindMapNodeFontSize(2, true), 'Núcleo fica com fonte maior que ramos distantes');
  assert(mindMapNodeFontSize(0, false) === mindMapNodeFontSize(4, false), 'Fonte uniforme quando desligado');
  assert(mindMapNodeFontSize(0, false, 18) === 18, 'Override de fonte do ramo prevalece sobre a escala');
  assert(sanitizeMindMapNodeFontSize(99) === MIND_MAP_MAX_FONT_SIZE, 'Fonte do ramo é limitada no máximo');
  assert(sanitizeMindMapNodeFontSize(4) === MIND_MAP_MIN_FONT_SIZE, 'Fonte do ramo é limitada no mínimo');
  assert(stepMindMapNodeFontSize(MIND_MAP_BASE_FONT_SIZE, 1) === MIND_MAP_BASE_FONT_SIZE + 1, 'Aumenta a fonte do ramo em 1px');
  const sized = updateMindMapNode(map, map.rootId, { fontSize: 20 });
  assert(getRootNode(sized).fontSize === 20, 'Persiste tamanho de fonte no ramo');
  assert(sanitizeMindMap({ title: 'X', nodes: [{ label: 'X', fontSize: 22 }] }).nodes[0].fontSize === 22, 'Sanitize preserva fonte do ramo');
  assert(sanitizeMindMap({ title: 'X', lineStyle: 'taper', nodes: [{ label: 'X' }] }).lineStyle === 'taper', 'Sanitize preserva galhos');
  assert(sanitizeMindMap({ title: 'X', scaleFontByDepth: true, nodes: [{ label: 'X' }] }).scaleFontByDepth === true, 'Sanitize preserva escala de fonte');

  const left = childrenOf(withOrg, withOrg.rootId).find(n => n.label === 'Organização do Estado');
  const rights = childrenOf(withOrg, withOrg.rootId).find(n => n.label === 'Direitos Fundamentais');
  const linked = addMindMapCrossLink(withOrg, {
    fromId: left.id,
    toId: rights.id,
    label: 'tensão',
    icon: 'Scale'
  });
  assert(linked.crossLinks.length === 1, 'Cria ligação extra entre ramos');
  assert(linked.crossLinks[0].label === 'tensão', 'Persiste rótulo da ligação');
  assert(linked.crossLinks[0].icon === 'Scale', 'Persiste ícone da ligação');
  const relabeled = updateMindMapCrossLink(linked, linked.crossLinks[0].id, { label: 'vs.' });
  assert(relabeled.crossLinks[0].label === 'vs.', 'Atualiza rótulo da ligação');
  let treeLinkBlocked = false;
  try {
    addMindMapCrossLink(withOrg, { fromId: withOrg.rootId, toId: left.id });
  } catch {
    treeLinkBlocked = true;
  }
  assert(treeLinkBlocked, 'Recusa ligação extra no galho pai-filho');
  const unlinked = deleteMindMapCrossLink(relabeled, relabeled.crossLinks[0].id);
  assert(unlinked.crossLinks.length === 0, 'Remove ligação extra');
  const prunedLinks = deleteMindMapNode(
    addMindMapCrossLink(withOrg, { fromId: left.id, toId: rights.id, label: 'x' }),
    rights.id
  );
  assert(prunedLinks.crossLinks.length === 0, 'Excluir ramo remove ligações incidentes');
  const sanitizedLinks = sanitizeMindMap({
    title: 'Com ligações',
    nodes: [
      { id: 'a', label: 'Núcleo', x: 0, y: 0 },
      { id: 'b', parentId: 'a', label: 'Filho 1' },
      { id: 'c', parentId: 'a', label: 'Filho 2' }
    ],
    crossLinks: [
      { fromId: 'b', toId: 'c', label: 'relação', icon: 'Link' },
      { fromId: 'missing', toId: 'c', label: 'órfã' },
      { fromId: 'a', toId: 'b', label: 'árvore' }
    ]
  });
  assert(sanitizedLinks.crossLinks.length === 1, 'Sanitize mantém só ligações válidas');
  assert(sanitizedLinks.crossLinks[0].label === 'relação', 'Sanitize preserva rótulo válido');
  assert(sanitizeMindMapCategories().length > 0, 'Categorias padrão preenchem lista ausente');
  assert(sanitizeMindMapCategories([]).length === 0, 'Lista vazia permanece vazia');

  console.log('\n🎉 Mapas mentais validados com sucesso!');
}

runTests();
