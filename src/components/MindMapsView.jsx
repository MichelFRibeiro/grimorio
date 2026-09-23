import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Minus,
  Network,
  Search,
  Trash2,
  Pencil,
  Sparkles,
  Brain,
  Play,
  Pause,
  RotateCcw,
  Clock,
  ArrowLeft,
  GitBranch,
  Eye,
  EyeOff,
  Layout,
  X,
  Check,
  AlertCircle,
  Bookmark,
  GraduationCap,
  Layers,
  Maximize2,
  Minimize2,
  Tag,
  FolderTree,
  Link2,
  Unlink,
  PenLine
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { MindMapIcon, MindMapMediaPicker, MindMapThumb } from './MindMapMedia';
import { useStopwatch, formatTimer } from '../hooks/useStopwatch';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  MIND_MAP_NODE_COLORS,
  childrenOf,
  computeMapStats,
  getRootNode,
  getStudyQueue,
  pickFillBlankNodeIds,
  sanitizeFillHideableNodeIds,
  sanitizeFillMapDifficulty,
  groupMapsByCategory,
  mindMapCategoryLabel,
  mindMapNodeFontSize,
  MIND_MAP_MAX_FONT_SIZE,
  MIND_MAP_MIN_FONT_SIZE,
  nodeDepth,
  stepMindMapNodeFontSize,
  nodePath,
  sanitizeMindMapCategories,
  sanitizeMindMapLineStyle,
  visibleNodeIds
} from '../utils/mindMaps';

const QUALITY_OPTIONS = [
  { value: 0, label: 'Esqueci', hint: 'Reaparece hoje', color: '#f43f5e' },
  { value: 1, label: 'Difícil', hint: 'Amanhã', color: '#f59e0b' },
  { value: 2, label: 'Bom', hint: 'Espaça a revisão', color: '#38bdf8' },
  { value: 3, label: 'Fácil', hint: 'Mais intervalo', color: '#10b981' }
];

const FILL_LEVELS = [
  { id: 'easy', label: 'Fácil', hint: '30% ocultos' },
  { id: 'medium', label: 'Médio', hint: '60% ocultos' },
  { id: 'hard', label: 'Difícil', hint: 'só o núcleo visível' }
];

function nodeSize(node = {}, fontSize = 14, fillState = null) {
  const fs = Number(fontSize) || 14;
  const scale = fs / 14;
  const blank = !!fillState?.blank;
  const review = fillState?.phase === 'review' || fillState?.phase === 'done';
  const hasMedia = !blank && !!(node.imageUrl || node.icon);
  const extra = node.imageUrl && !blank ? 36 * scale : (node.icon && !blank ? 28 * scale : 0);
  const label = String(node.label || (blank ? '_______________' : ''));
  const charW = fs * 0.62;
  const padding = 28;
  const minW = (hasMedia ? 148 : 120) * Math.max(1, scale * 0.9);
  const maxW = 460;
  const singleLineW = padding + Math.max(label.length, blank ? 12 : 0) * charW + extra + (blank ? 18 : 0);
  const w = Math.max(minW, Math.min(maxW, singleLineW));
  const innerW = Math.max(48, w - padding - extra);
  const charsPerLine = Math.max(8, Math.floor(innerW / Math.max(charW, 1)));
  const lines = Math.max(1, Math.ceil(label.length / charsPerLine));
  const minH = (!blank && node.imageUrl ? 72 : 44) * Math.max(1, scale * 0.92);
  const extraH = blank ? (review ? fs * 2.4 : fs * 0.35) : 0;
  const h = Math.max(minH, 18 + lines * fs * 1.35 + extraH);
  return { w, h };
}

function nodeRect(node, fontSize, fillState = null) {
  const { w, h } = nodeSize(node, fontSize, fillState);
  return {
    w,
    h,
    left: (node?.x || 0) - w / 2,
    right: (node?.x || 0) + w / 2,
    top: (node?.y || 0) - h / 2,
    bottom: (node?.y || 0) + h / 2
  };
}

function clamp01(value, fallback = 0.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function pointOnNodeSide(rect, side, t) {
  const u = clamp01(t);
  if (side === 'left') return { x: rect.left, y: rect.top + u * rect.h };
  if (side === 'right') return { x: rect.right, y: rect.top + u * rect.h };
  if (side === 'top') return { x: rect.left + u * rect.w, y: rect.top };
  return { x: rect.left + u * rect.w, y: rect.bottom };
}

function closestAnchorOnNode(node, fontSize, world, fillState = null) {
  const rect = nodeRect(node, fontSize, fillState);
  const px = world?.x || 0;
  const py = world?.y || 0;
  const inside = px > rect.left && px < rect.right && py > rect.top && py < rect.bottom;
  const sides = [
    { side: 'left', x: rect.left, y: Math.max(rect.top, Math.min(rect.bottom, py)), t: (Math.max(rect.top, Math.min(rect.bottom, py)) - rect.top) / Math.max(rect.h, 1) },
    { side: 'right', x: rect.right, y: Math.max(rect.top, Math.min(rect.bottom, py)), t: (Math.max(rect.top, Math.min(rect.bottom, py)) - rect.top) / Math.max(rect.h, 1) },
    { side: 'top', x: Math.max(rect.left, Math.min(rect.right, px)), y: rect.top, t: (Math.max(rect.left, Math.min(rect.right, px)) - rect.left) / Math.max(rect.w, 1) },
    { side: 'bottom', x: Math.max(rect.left, Math.min(rect.right, px)), y: rect.bottom, t: (Math.max(rect.left, Math.min(rect.right, px)) - rect.left) / Math.max(rect.w, 1) }
  ];
  let best = sides[0];
  let bestD = Infinity;
  sides.forEach((item) => {
    const d = inside
      ? Math.abs(item.side === 'left' || item.side === 'right' ? px - item.x : py - item.y)
      : Math.hypot(px - item.x, py - item.y);
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  });
  return { side: best.side, t: Math.round(clamp01(best.t) * 1000) / 1000 };
}

function nodeAnchor(node, toward, fontSize, custom, fillState = null) {
  const rect = nodeRect(node, fontSize, fillState);
  if (custom?.side) return pointOnNodeSide(rect, custom.side, custom.t);
  const dx = (toward?.x || 0) - (node?.x || 0);
  const dy = (toward?.y || 0) - (node?.y || 0);
  if (!dx && !dy) return { x: node.x, y: node.y };
  const t = Math.min(
    (rect.w / 2) / Math.max(Math.abs(dx), 0.0001),
    (rect.h / 2) / Math.max(Math.abs(dy), 0.0001)
  );
  return { x: node.x + dx * t, y: node.y + dy * t };
}

function hashStr(value) {
  const s = String(value || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t
  };
}

function quadraticPoint(start, control, end, t = 0.5) {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y
  };
}

function defaultBulgeControl(start, end, linkId) {
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const sign = hashStr(linkId || '') % 2 === 0 ? 1 : -1;
  const bulge = Math.min(56, Math.max(16, len * 0.2)) * sign;
  return {
    x: mid.x + (-dy / len) * bulge,
    y: mid.y + (dx / len) * bulge
  };
}

function defaultRouteOffsets(start, end, control) {
  return [0.25, 0.5, 0.75].map((t) => {
    const along = quadraticPoint(start, control, end, t);
    const chord = lerpPoint(start, end, t);
    return { x: Math.round(along.x - chord.x), y: Math.round(along.y - chord.y) };
  });
}

function resolvedRouteOffsets(start, end, curve, control) {
  const defaults = defaultRouteOffsets(start, end, control);
  const stored = Array.isArray(curve?.points) ? curve.points.filter(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) : [];
  if (stored.length >= 3) return stored.slice(0, 3).map(p => ({ x: Number(p.x), y: Number(p.y) }));
  if (stored.length === 1) return [defaults[0], { x: Number(stored[0].x), y: Number(stored[0].y) }, defaults[2]];
  if (stored.length === 2) return [stored[0], stored[1], defaults[2]].map(p => ({ x: Number(p.x), y: Number(p.y) }));
  return defaults;
}

function routeWorldPoints(start, end, offsets) {
  return [0.25, 0.5, 0.75].map((t, i) => {
    const chord = lerpPoint(start, end, t);
    const off = offsets[i] || { x: 0, y: 0 };
    return { x: chord.x + off.x, y: chord.y + off.y, t, index: i };
  });
}

function cubicPoint(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
  };
}

function cubicTangent(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return {
    x: 3 * u * u * (c1.x - p0.x) + 6 * u * t * (c2.x - c1.x) + 3 * t * t * (p1.x - c2.x),
    y: 3 * u * u * (c1.y - p0.y) + 6 * u * t * (c2.y - c1.y) + 3 * t * t * (p1.y - c2.y)
  };
}

function inferAnchorSide(node, fontSize, point, custom) {
  if (custom?.side) return custom.side;
  const rect = nodeRect(node, fontSize);
  const scores = [
    { side: 'left', d: Math.abs(point.x - rect.left) },
    { side: 'right', d: Math.abs(point.x - rect.right) },
    { side: 'top', d: Math.abs(point.y - rect.top) },
    { side: 'bottom', d: Math.abs(point.y - rect.bottom) }
  ];
  return scores.sort((a, b) => a.d - b.d)[0].side;
}

function sideOutward(side, dist = 42) {
  if (side === 'left') return { x: -dist, y: 0 };
  if (side === 'right') return { x: dist, y: 0 };
  if (side === 'top') return { x: 0, y: -dist };
  if (side === 'bottom') return { x: 0, y: dist };
  return { x: 0, y: 0 };
}

function phantomPoint(point, node, fontSize, custom) {
  const out = sideOutward(inferAnchorSide(node, fontSize, point, custom), 48);
  return { x: point.x + out.x, y: point.y + out.y };
}

function catmullRomSegments(points, phantomStart, phantomEnd) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = i === 0 ? (phantomStart || points[i]) : points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i === points.length - 2 ? (phantomEnd || p2) : (points[i + 2] || p2);
    segs.push({
      p0: p1,
      c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p1: p2
    });
  }
  return segs;
}

function sampleSegments(segments, stepsPer = 16) {
  const samples = [];
  segments.forEach((seg, s) => {
    for (let i = s === 0 ? 0 : 1; i <= stepsPer; i += 1) {
      const t = i / stepsPer;
      const p = cubicPoint(seg.p0, seg.c1, seg.c2, seg.p1, t);
      const tan = cubicTangent(seg.p0, seg.c1, seg.c2, seg.p1, t);
      samples.push({ x: p.x, y: p.y, tx: tan.x, ty: tan.y });
    }
  });
  return samples;
}

function pathFromSegments(segments) {
  if (!segments.length) return '';
  const start = segments[0].p0;
  const rest = segments.map(seg => `C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.p1.x} ${seg.p1.y}`);
  return `M ${start.x} ${start.y} ${rest.join(' ')}`;
}

function taperFromSamples(samples, startW, endW) {
  const left = [];
  const right = [];
  const last = Math.max(samples.length - 1, 1);
  samples.forEach((s, i) => {
    const t = i / last;
    const tl = Math.hypot(s.tx, s.ty) || 1;
    const ox = -s.ty / tl;
    const oy = s.tx / tl;
    const w = startW * (1 - t) + endW * t;
    left.push(`${s.x + ox * (w / 2)} ${s.y + oy * (w / 2)}`);
    right.push(`${s.x - ox * (w / 2)} ${s.y - oy * (w / 2)}`);
  });
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

function branchGeometry(fromNode, toNode, fromFont, toFont, curve, linkId) {
  const start = nodeAnchor(fromNode, toNode, fromFont, curve?.from);
  const end = nodeAnchor(toNode, fromNode, toFont, curve?.to);
  const control = defaultBulgeControl(start, end, linkId);
  const offsets = resolvedRouteOffsets(start, end, curve, control);
  const route = routeWorldPoints(start, end, offsets);
  const knots = [start, ...route, end];
  const segments = catmullRomSegments(
    knots,
    phantomPoint(start, fromNode, fromFont, curve?.from),
    phantomPoint(end, toNode, toFont, curve?.to)
  );
  return {
    start,
    end,
    control,
    offsets,
    route,
    knots,
    segments,
    samples: sampleSegments(segments, 20),
    centerline: pathFromSegments(segments)
  };
}

function patchBranchCurve(fromNode, toNode, fromFont, toFont, curve, handle, world, linkId) {
  const geo = branchGeometry(fromNode, toNode, fromFont, toFont, curve, linkId);
  const next = {
    ...(curve && typeof curve === 'object' ? curve : {}),
    points: geo.offsets.map(p => ({ ...p }))
  };
  if (handle === 'from') {
    next.from = closestAnchorOnNode(fromNode, fromFont, world);
  } else if (handle === 'to') {
    next.to = closestAnchorOnNode(toNode, toFont, world);
  } else if (handle === 0 || handle === 1 || handle === 2) {
    const t = (Number(handle) + 1) / 4;
    const chord = lerpPoint(geo.start, geo.end, t);
    next.points[handle] = {
      x: Math.round((world?.x || 0) - chord.x),
      y: Math.round((world?.y || 0) - chord.y)
    };
  }
  return next;
}

function nearestRouteHandle(route, world) {
  let best = 1;
  let bestD = Infinity;
  (route || []).forEach((p, i) => {
    const d = Math.hypot((world?.x || 0) - p.x, (world?.y || 0) - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function taperBranchPath(fromNode, toNode, depth, linkId, fromFont, toFont, curve) {
  const geo = branchGeometry(fromNode, toNode, fromFont, toFont, curve, linkId);
  const startW = Math.max(3.2, 16.5 - Math.max(0, depth - 1) * 3.15);
  const endW = Math.max(1.2, startW * 0.28);
  return taperFromSamples(geo.samples, startW, endW);
}

function branchCenterline(fromNode, toNode, fromFont, toFont, curve, linkId) {
  const geo = branchGeometry(fromNode, toNode, fromFont, toFont, curve, linkId);
  return {
    d: geo.centerline,
    mid: geo.route[1] || lerpPoint(geo.start, geo.end, 0.5),
    control: geo.control,
    start: geo.start,
    end: geo.end,
    route: geo.route
  };
}

function crossLinkCurve(fromNode, toNode, fromFont, toFont) {
  const start = nodeAnchor(fromNode, toNode, fromFont);
  const end = nodeAnchor(toNode, fromNode, toFont);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(48, Math.max(18, len * 0.16));
  const control = {
    x: (start.x + end.x) / 2 - (dy / len) * bulge,
    y: (start.y + end.y) / 2 + (dx / len) * bulge
  };
  return {
    d: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    mid: quadraticPoint(start, control, end, 0.5)
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function MindMapCanvas({
  map,
  selectedId,
  selectedIds = [],
  selectedLinkId,
  selectedBranchId = null,
  onSelect,
  onSelectLink,
  onSelectBranch,
  onMoveNode,
  onCommitMoves,
  onBendBranch,
  onAddChild,
  linkingFromId = null,
  onLinkTarget,
  readOnly = false,
  fullscreen = false,
  onToggleFullscreen,
  fillMode = null,
  hideablePicker = null
}) {
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 420, y: 280 });
  const [marquee, setMarquee] = useState(null);
  const dragRef = useRef(null);
  const selectedIdSet = useMemo(() => new Set(selectedIds.filter(Boolean)), [selectedIds]);

  const lineStyle = sanitizeMindMapLineStyle(map?.lineStyle);
  const scaleFont = !!map?.scaleFontByDepth;
  const fontFor = (node) => mindMapNodeFontSize(nodeDepth(map, node?.id), scaleFont, node?.fontSize);
  const fillStateFor = (node) => (
    fillMode?.blankIds?.has(node?.id)
      ? {
          blank: true,
          phase: fillMode.phase || 'fill',
          value: fillMode.answers?.[node.id] || '',
          verdict: fillMode.verdicts?.[node.id]
        }
      : null
  );
  const sizeFor = (node) => nodeSize(node, fontFor(node), fillStateFor(node));
  const visible = useMemo(() => visibleNodeIds(map), [map]);
  const visibleIds = useMemo(() => new Set(visible.map(n => n.id)), [visible]);
  const links = useMemo(() => (
    visible
      .filter(n => n.parentId && visibleIds.has(n.parentId))
      .map(n => ({
        id: `${n.parentId}-${n.id}`,
        from: visible.find(p => p.id === n.parentId),
        to: n,
        depth: nodeDepth(map, n.id)
      }))
      .filter(l => l.from && l.to)
  ), [visible, visibleIds, map]);
  const crossLinks = useMemo(() => (
    (map?.crossLinks || [])
      .map((link) => ({
        ...link,
        from: visible.find(n => n.id === link.fromId),
        to: visible.find(n => n.id === link.toId)
      }))
      .filter(l => l.from && l.to)
  ), [map?.crossLinks, visible]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom(z => Math.max(0.4, Math.min(2.2, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    };
  };

  const onPointerDownBg = (e) => {
    if (e.target !== e.currentTarget && e.target.dataset.role !== 'canvas') return;
    if (!readOnly && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      const start = toWorld(e.clientX, e.clientY);
      dragRef.current = {
        kind: 'marquee',
        additive: !!(e.ctrlKey || e.metaKey),
        start,
        current: start
      };
      setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y });
      return;
    }
    dragRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
    if (onSelect) onSelect(null);
    if (onSelectLink) onSelectLink(null);
    if (onSelectBranch) onSelectBranch(null);
  };

  const onPointerDownNode = (e, node) => {
    e.stopPropagation();
    if (fillMode) return;
    if (hideablePicker) {
      hideablePicker.onToggle?.(node.id);
      return;
    }
    if (linkingFromId && onLinkTarget) {
      onLinkTarget(node.id);
      return;
    }
    const additive = !!(e.ctrlKey || e.metaKey);
    const range = !!e.shiftKey;
    const keepGroup = !additive && !range && selectedIdSet.has(node.id) && selectedIdSet.size > 1;
    if (onSelect && !keepGroup) onSelect(node.id, { additive, range });
    if (onSelectLink) onSelectLink(null);
    if (onSelectBranch) onSelectBranch(null);
    if (readOnly || additive || range) return;
    const movingIds = keepGroup ? [...selectedIdSet] : [node.id];
    const origins = {};
    movingIds.forEach((id) => {
      const n = (map?.nodes || []).find(item => item.id === id);
      if (n) origins[id] = { x: n.x, y: n.y };
    });
    dragRef.current = {
      kind: 'node',
      id: node.id,
      ids: movingIds,
      origins,
      originX: node.x,
      originY: node.y,
      start: toWorld(e.clientX, e.clientY),
      lastDelta: { x: 0, y: 0 },
      lastPos: { x: node.x, y: node.y },
      moved: false,
      collapseOnClick: keepGroup
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'pan') {
        setPan({
          x: drag.panX + (e.clientX - drag.startX),
          y: drag.panY + (e.clientY - drag.startY)
        });
      } else if (drag.kind === 'marquee') {
        const world = toWorld(e.clientX, e.clientY);
        drag.current = world;
        setMarquee({ x1: drag.start.x, y1: drag.start.y, x2: world.x, y2: world.y });
      } else if (drag.kind === 'branch' && onBendBranch) {
        const world = toWorld(e.clientX, e.clientY);
        const curve = patchBranchCurve(
          drag.from,
          drag.to,
          drag.fromFont,
          drag.toFont,
          drag.baseCurve,
          drag.handle,
          world,
          drag.linkId
        );
        drag.moved = true;
        drag.lastCurve = curve;
        onBendBranch(drag.nodeId, curve, false);
      } else if (drag.kind === 'node' && onMoveNode) {
        const world = toWorld(e.clientX, e.clientY);
        const dx = Math.round(world.x - drag.start.x);
        const dy = Math.round(world.y - drag.start.y);
        if (dx !== drag.lastDelta.x || dy !== drag.lastDelta.y) drag.moved = true;
        drag.lastDelta = { x: dx, y: dy };
        drag.lastPos = {
          x: Math.round(drag.originX + dx),
          y: Math.round(drag.originY + dy)
        };
        (drag.ids || [drag.id]).forEach((id) => {
          const origin = drag.origins?.[id];
          if (!origin) return;
          onMoveNode(id, { x: origin.x + dx, y: origin.y + dy }, false);
        });
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag?.kind === 'node' && drag.moved) {
        const moves = (drag.ids || [drag.id]).map((id) => {
          const origin = drag.origins?.[id];
          if (!origin) return null;
          return { id, x: origin.x + drag.lastDelta.x, y: origin.y + drag.lastDelta.y };
        }).filter(Boolean);
        if (onCommitMoves && moves.length) onCommitMoves(moves);
        else if (onMoveNode) {
          moves.forEach((move) => onMoveNode(move.id, { x: move.x, y: move.y }, true));
        }
      } else if (drag?.kind === 'branch' && drag.moved && onBendBranch) {
        onBendBranch(drag.nodeId, drag.lastCurve, true);
      } else if (drag?.kind === 'node' && drag.collapseOnClick && onSelect) {
        onSelect(drag.id);
      } else if (drag?.kind === 'marquee' && onSelect) {
        const x1 = Math.min(drag.start.x, drag.current.x);
        const y1 = Math.min(drag.start.y, drag.current.y);
        const x2 = Math.max(drag.start.x, drag.current.x);
        const y2 = Math.max(drag.start.y, drag.current.y);
        const box = { left: x1, top: y1, right: x2, bottom: y2 };
        const tooSmall = (x2 - x1) < 6 && (y2 - y1) < 6;
        if (!tooSmall) {
          const hits = visible.filter((node) => {
            const { w, h } = sizeFor(node);
            return rectsOverlap(box, {
              left: node.x - w / 2,
              top: node.y - h / 2,
              right: node.x + w / 2,
              bottom: node.y + h / 2
            });
          }).map(n => n.id);
          onSelect(hits, { additive: drag.additive, marquee: true });
        }
      }
      setMarquee(null);
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [map, onMoveNode, onBendBranch, onSelect, pan.x, pan.y, zoom, visible]);

  return (
    <div
      ref={wrapRef}
      className="mindmap-canvas"
      onPointerDown={onPointerDownBg}
      data-role="canvas"
    >
      <svg width="100%" height="100%" data-role="canvas">
        <defs>
          <pattern id="mm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mm-grid)" data-role="canvas" />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {links.map((link) => {
            const fromFont = fontFor(link.from);
            const toFont = fontFor(link.to);
            const selected = selectedBranchId === link.to.id;
            const color = link.to.color || '#64748b';
            const visiblePath = lineStyle === 'taper'
              ? taperBranchPath(link.from, link.to, link.depth, link.id, fromFont, toFont, link.to.curve)
              : branchCenterline(link.from, link.to, fromFont, toFont, link.to.curve, link.id).d;
            const hitPath = branchCenterline(link.from, link.to, fromFont, toFont, link.to.curve, link.id);
            return (
              <g key={link.id}>
                {lineStyle === 'taper' ? (
                  <path
                    d={visiblePath}
                    fill={color}
                    opacity={selected ? 0.95 : 0.82}
                    stroke={selected ? '#fbbf24' : color}
                    strokeWidth={selected ? 1.2 : 0.4}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d={visiblePath}
                    fill="none"
                    stroke={selected ? '#fbbf24' : color}
                    strokeWidth={selected ? Math.max(2.6, 5.1 - (link.depth - 1) * 0.7) : Math.max(1.4, 4.2 - (link.depth - 1) * 0.7)}
                    opacity={selected ? 0.95 : 0.7}
                  />
                )}
                <path
                  d={hitPath.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="18"
                  style={{ cursor: readOnly ? 'default' : 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (onSelectBranch) onSelectBranch(link.to.id);
                    if (onSelect) onSelect(null);
                    if (onSelectLink) onSelectLink(null);
                    if (readOnly || hideablePicker || !onBendBranch) return;
                    const world = toWorld(e.clientX, e.clientY);
                    dragRef.current = {
                      kind: 'branch',
                      nodeId: link.to.id,
                      linkId: link.id,
                      from: link.from,
                      to: link.to,
                      fromFont,
                      toFont,
                      handle: nearestRouteHandle(hitPath.route, world),
                      baseCurve: link.to.curve || {},
                      lastCurve: link.to.curve || {},
                      moved: false
                    };
                  }}
                />
              </g>
            );
          })}
          {crossLinks.map((link) => {
            const curve = crossLinkCurve(link.from, link.to, fontFor(link.from), fontFor(link.to));
            const selected = selectedLinkId === link.id;
            const color = link.color || '#38bdf8';
            return (
              <g key={link.id}>
                <path
                  d={curve.d}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? 3.4 : 2.2}
                  strokeDasharray="7 6"
                  opacity={selected ? 0.95 : 0.78}
                  strokeLinecap="round"
                />
                <path
                  d={curve.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  style={{ cursor: readOnly ? 'default' : 'pointer' }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (onSelectLink) onSelectLink(link.id);
                    if (onSelect) onSelect(null);
                    if (onSelectBranch) onSelectBranch(null);
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mindmap-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {crossLinks.map((link) => {
          if (!link.label && !link.icon) return null;
          const curve = crossLinkCurve(link.from, link.to, fontFor(link.from), fontFor(link.to));
          const selected = selectedLinkId === link.id;
          return (
            <button
              key={`${link.id}-label`}
              type="button"
              className={`mindmap-cross-label ${selected ? 'is-selected' : ''}`}
              style={{
                left: curve.mid.x,
                top: curve.mid.y,
                borderColor: selected ? '#fbbf24' : (link.color || '#38bdf8'),
                color: link.color || '#7dd3fc'
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (onSelectLink) onSelectLink(link.id);
                if (onSelect) onSelect(null);
                if (onSelectBranch) onSelectBranch(null);
              }}
            >
              {link.icon ? <MindMapIcon name={link.icon} size={12} color={link.color || '#7dd3fc'} /> : null}
              {link.label ? <span>{link.label}</span> : null}
            </button>
          );
        })}
        {links.map((link) => {
          if (selectedBranchId !== link.to.id) return null;
          const fromFont = fontFor(link.from);
          const toFont = fontFor(link.to);
          const geo = branchCenterline(link.from, link.to, fromFont, toFont, link.to.curve, link.id);
          const startHandle = (kind, point, title, extraClass = '') => (
            <button
              key={`${link.id}-${kind}`}
              type="button"
              className={`mindmap-curve-handle ${extraClass}`}
              style={{ left: point.x, top: point.y }}
              title={title}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (onSelectBranch) onSelectBranch(link.to.id);
                if (onSelect) onSelect(null);
                if (onSelectLink) onSelectLink(null);
                if (readOnly || hideablePicker || !onBendBranch) return;
                dragRef.current = {
                  kind: 'branch',
                  nodeId: link.to.id,
                  linkId: link.id,
                  from: link.from,
                  to: link.to,
                  fromFont,
                  toFont,
                  handle: kind,
                  baseCurve: link.to.curve || {},
                  lastCurve: link.to.curve || {},
                  moved: false
                };
              }}
            />
          );
          return (
            <React.Fragment key={`${link.id}-handles`}>
              {startHandle('from', geo.start, 'Ponto de saída no ramo de origem', 'is-anchor')}
              {geo.route.map((point, i) => startHandle(i, point, `Ponto de rota ${i + 1}`))}
              {startHandle('to', geo.end, 'Ponto de chegada no ramo de destino', 'is-anchor')}
            </React.Fragment>
          );
        })}
        {visible.map((node) => {
          const fillState = fillStateFor(node);
          const fontSize = fontFor(node);
          const { w, h } = sizeFor(node);
          const selected = selectedIdSet.has(node.id) || selectedId === node.id;
          const primary = selectedId === node.id;
          const linkingFrom = linkingFromId === node.id;
          const kids = childrenOf(map, node.id).length;
          const fillReview = fillState?.phase === 'review';
          const fillDone = fillState?.phase === 'done';
          const verdict = fillState?.verdict;
          const fillClass = fillState
            ? ` is-fill-blank${fillReview || fillDone ? ' is-fill-review' : ''}${verdict === 'hit' ? ' is-fill-hit' : ''}${verdict === 'miss' ? ' is-fill-miss' : ''}`
            : '';
          const hideableOn = !!hideablePicker?.ids?.has(node.id);
          const hideableClass = hideablePicker
            ? ` is-hideable-pick${hideableOn ? ' is-hideable-on' : ''}`
            : '';
          return (
            <div
              key={node.id}
              className={`mindmap-node ${selected ? 'is-selected' : ''} ${selected && !primary ? 'is-multi' : ''} ${linkingFrom ? 'is-linking' : ''}${fillClass}${hideableClass}`}
              style={{
                width: w,
                minHeight: h,
                left: node.x - w / 2,
                top: node.y - h / 2,
                fontSize,
                cursor: hideablePicker ? 'pointer' : undefined,
                borderColor: linkingFrom
                  ? '#38bdf8'
                  : (hideableOn
                    ? '#38bdf8'
                    : (verdict === 'hit'
                      ? '#10b981'
                      : (verdict === 'miss'
                        ? '#f43f5e'
                        : (fillState ? '#c084fc' : (selected ? '#fbbf24' : (node.color || '#64748b')))))),
                boxShadow: linkingFrom
                  ? '0 0 14px rgba(56,189,248,0.45)'
                  : (hideableOn
                    ? '0 0 12px rgba(56,189,248,0.4)'
                    : (verdict === 'hit'
                      ? '0 0 12px rgba(16,185,129,0.35)'
                      : (verdict === 'miss'
                        ? '0 0 12px rgba(244,63,94,0.35)'
                        : (selected ? '0 0 12px rgba(251,191,36,0.35)' : 'none'))))
              }}
              onPointerDown={(e) => onPointerDownNode(e, node)}
            >
              {node.imageUrl && !fillState ? (
                <img src={node.imageUrl} alt="" className="mindmap-node-photo" draggable={false} />
              ) : node.icon && !fillState ? (
                <span className="mindmap-node-icon" style={{ color: node.color || '#c084fc' }}>
                  <MindMapIcon name={node.icon} size={Math.max(14, Math.round(fontSize + 3))} color={node.color || '#c084fc'} />
                </span>
              ) : null}
              {fillState && !fillReview && !fillDone ? (
                <input
                  className="mindmap-fill-input"
                  value={fillState.value}
                  placeholder="Preencha…"
                  aria-label={`Preencher ramo oculto`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onChange={(e) => fillMode.onChange?.(node.id, e.target.value)}
                />
              ) : fillState && (fillReview || fillDone) ? (
                <div className="mindmap-fill-review">
                  <span className="mindmap-fill-guess">{fillState.value?.trim() ? fillState.value : '—'}</span>
                  <span className="mindmap-fill-answer">{node.label}</span>
                  {fillReview && (
                    <div className="mindmap-fill-verdict">
                      <button
                        type="button"
                        className={`mindmap-fill-hit ${verdict === 'hit' ? 'is-on' : ''}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => fillMode.onVerdict?.(node.id, 'hit')}
                      >
                        Acertei
                      </button>
                      <button
                        type="button"
                        className={`mindmap-fill-miss ${verdict === 'miss' ? 'is-on' : ''}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => fillMode.onVerdict?.(node.id, 'miss')}
                      >
                        Errei
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <span className="mindmap-node-label">{node.label}</span>
              )}
              {kids > 0 && !fillState && (
                <span className="mindmap-node-badge" style={{ background: node.color || '#64748b' }}>
                  {node.collapsed ? '+' : kids}
                </span>
              )}
              {!readOnly && primary && (
                <button
                  type="button"
                  className="mindmap-node-add"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (onAddChild) onAddChild(node.id);
                  }}
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>
      {marquee && (
        <div
          className="mindmap-marquee"
          style={{
            left: pan.x + Math.min(marquee.x1, marquee.x2) * zoom,
            top: pan.y + Math.min(marquee.y1, marquee.y2) * zoom,
            width: Math.abs(marquee.x2 - marquee.x1) * zoom,
            height: Math.abs(marquee.y2 - marquee.y1) * zoom
          }}
        />
      )}
      {linkingFromId && (
        <div className="mindmap-link-hint">
          Clique no outro ramo para ligar · Esc cancela
        </div>
      )}
      {hideablePicker && (
        <div className="mindmap-link-hint">
          Clique nos nós que podem ser ocultados no Preencher Mapa · Esc sai
        </div>
      )}
      {!readOnly && !linkingFromId && !hideablePicker && (
        <div className="mindmap-select-hint">
          Ctrl/Cmd+clique para vários · arraste o galho, as âncoras ou os 3 pontos de rota
        </div>
      )}
      <div className="mindmap-zoom">
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
        <button type="button" onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(2.2, z + 0.1))}>+</button>
      </div>
    </div>
  );
}

export function MindMapsView({
  mindMaps = [],
  mindMapSessions = [],
  mindMapCategories = [],
  onAddMap,
  onUpdateMap,
  onAddNode,
  onUpdateNode,
  onUpdateNodes,
  onDeleteNode,
  onAddCrossLink,
  onUpdateCrossLink,
  onDeleteCrossLink,
  onLayoutMap,
  onStudyMap,
  onDeleteMap,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory
}) {
  const todayStr = getSaoPauloDateStr();
  const categories = sanitizeMindMapCategories(mindMapCategories);
  const rootCategories = categories.filter(c => !c.parentId);
  const defaultCategoryId = rootCategories[0]?.id || categories[0]?.id || '';

  const [view, setView] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategoryId, setNewCategoryId] = useState(defaultCategoryId);
  const [newColor, setNewColor] = useState(MIND_MAP_NODE_COLORS[0]);
  const [formError, setFormError] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(MIND_MAP_NODE_COLORS[1]);
  const [catParentId, setCatParentId] = useState('');
  const [catError, setCatError] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const [activeMapId, setActiveMapId] = useState(null);
  const [pendingMap, setPendingMap] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedLinkId, setSelectedLinkId] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [linkingFromId, setLinkingFromId] = useState(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftLinkLabel, setDraftLinkLabel] = useState('');
  const [linkError, setLinkError] = useState('');
  const [localNodes, setLocalNodes] = useState(null);
  const draftOwnerIdRef = useRef(null);
  const draftLabelRef = useRef('');
  const draftNotesRef = useRef('');
  const lastSavedDraftRef = useRef({ id: null, label: '', notes: '' });
  const draftLinkOwnerIdRef = useRef(null);
  const draftLinkLabelRef = useRef('');

  const [studyMode, setStudyMode] = useState('branches');
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [studyReviews, setStudyReviews] = useState([]);
  const [fillDifficulty, setFillDifficulty] = useState('medium');
  const [fillBlankIds, setFillBlankIds] = useState([]);
  const [fillAnswers, setFillAnswers] = useState({});
  const [fillVerdicts, setFillVerdicts] = useState({});
  const [fillPhase, setFillPhase] = useState('fill');
  const [fillMasteredIds, setFillMasteredIds] = useState([]);
  const [pickingHideable, setPickingHideable] = useState(false);
  const [draftHideableIds, setDraftHideableIds] = useState([]);
  const stopwatch = useStopwatch();

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    confirmVariant: 'warning',
    icon: null,
    onConfirm: null
  });

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const maps = mindMaps || [];
  const liveMap = maps.find(m => m.id === activeMapId) || (pendingMap?.id === activeMapId ? pendingMap : null);

  useEffect(() => {
    if (pendingMap && maps.some(m => m.id === pendingMap.id)) setPendingMap(null);
  }, [maps, pendingMap]);

  useEffect(() => {
    if (!newCategoryId && defaultCategoryId) setNewCategoryId(defaultCategoryId);
  }, [defaultCategoryId, newCategoryId]);
  const editorMap = liveMap
    ? { ...liveMap, nodes: localNodes || liveMap.nodes }
    : null;
  const selectedId = selectedIds[selectedIds.length - 1] || null;
  const selectedNodes = editorMap
    ? selectedIds.map(id => (editorMap.nodes || []).find(n => n.id === id)).filter(Boolean)
    : [];
  const selectedNode = selectedNodes[selectedNodes.length - 1] || null;
  const multiSelected = selectedNodes.length > 1;
  const selectedLink = editorMap && selectedLinkId
    ? (editorMap.crossLinks || []).find(l => l.id === selectedLinkId)
    : null;
  const selectedBranch = editorMap && selectedBranchId
    ? (editorMap.nodes || []).find(n => n.id === selectedBranchId)
    : null;
  const selectedBranchParent = selectedBranch?.parentId
    ? (editorMap.nodes || []).find(n => n.id === selectedBranch.parentId)
    : null;
  const selectedNodeFont = selectedNode
    ? mindMapNodeFontSize(nodeDepth(editorMap, selectedNode.id), !!editorMap.scaleFontByDepth, selectedNode.fontSize)
    : 14;
  const sharedColor = selectedNodes.length && selectedNodes.every(n => n.color === selectedNodes[0].color)
    ? selectedNodes[0].color
    : null;
  const sharedIcon = selectedNodes.length && selectedNodes.every(n => (n.icon || '') === (selectedNodes[0].icon || ''))
    ? (selectedNodes[0].icon || '')
    : '';
  const sharedImage = selectedNodes.length && selectedNodes.every(n => (n.imageUrl || '') === (selectedNodes[0].imageUrl || ''))
    ? (selectedNodes[0].imageUrl || '')
    : '';
  const mixedMedia = selectedNodes.length > 1 && selectedNodes.some(n => (n.icon || '') !== sharedIcon || (n.imageUrl || '') !== sharedImage);
  const minSelectedFont = selectedNodes.length
    ? Math.min(...selectedNodes.map(n => mindMapNodeFontSize(nodeDepth(editorMap, n.id), !!editorMap.scaleFontByDepth, n.fontSize)))
    : 14;
  const maxSelectedFont = selectedNodes.length
    ? Math.max(...selectedNodes.map(n => mindMapNodeFontSize(nodeDepth(editorMap, n.id), !!editorMap.scaleFontByDepth, n.fontSize)))
    : 14;

  useEffect(() => {
    setLocalNodes(null);
  }, [liveMap?.updatedAt, liveMap?.nodes?.length, liveMap?.crossLinks?.length]);

  const persistNodeDraft = (nodeId) => {
    if (!editorMap || !nodeId) return;
    const node = (editorMap.nodes || []).find(n => n.id === nodeId);
    if (!node) return;
    const label = (draftLabelRef.current || '').trim() || node.label;
    const notes = draftNotesRef.current || '';
    const last = lastSavedDraftRef.current;
    if (last.id === nodeId && last.label === label && last.notes === notes) return;
    lastSavedDraftRef.current = { id: nodeId, label, notes };
    if (label === (node.label || '') && notes === (node.notes || '')) return;
    onUpdateNode(editorMap.id, nodeId, { label, notes });
    if (nodeId === editorMap.rootId && onUpdateMap && label !== editorMap.title) {
      onUpdateMap(editorMap.id, { title: label, rootLabel: label });
    }
  };

  const persistLinkDraft = (linkId) => {
    if (!editorMap || !linkId || !onUpdateCrossLink) return;
    const link = (editorMap.crossLinks || []).find(l => l.id === linkId);
    if (!link) return;
    const label = draftLinkLabelRef.current || '';
    if ((link.label || '') === label) return;
    onUpdateCrossLink(editorMap.id, linkId, { label });
  };

  useEffect(() => {
    const prevId = draftOwnerIdRef.current;
    if (prevId && prevId !== selectedNode?.id) persistNodeDraft(prevId);
    if (selectedNode) {
      const label = selectedNode.label || '';
      const notes = selectedNode.notes || '';
      setDraftLabel(label);
      setDraftNotes(notes);
      draftOwnerIdRef.current = selectedNode.id;
      draftLabelRef.current = label;
      draftNotesRef.current = notes;
      lastSavedDraftRef.current = { id: selectedNode.id, label, notes };
    } else {
      draftOwnerIdRef.current = null;
    }
  }, [selectedNode?.id]);

  useEffect(() => {
    const prevId = draftLinkOwnerIdRef.current;
    if (prevId && prevId !== selectedLink?.id) persistLinkDraft(prevId);
    const label = selectedLink?.label || '';
    setDraftLinkLabel(label);
    setLinkError('');
    draftLinkOwnerIdRef.current = selectedLink?.id || null;
    draftLinkLabelRef.current = label;
  }, [selectedLink?.id]);

  const matchingCategoryIds = useMemo(() => {
    if (filterCategoryId === 'all') return null;
    const childIds = categories.filter(c => c.parentId === filterCategoryId).map(c => c.id);
    return new Set([filterCategoryId, ...childIds]);
  }, [categories, filterCategoryId]);

  const filteredMaps = maps.filter((m) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = !q || (
      m.title.toLowerCase().includes(q)
      || (m.description || '').toLowerCase().includes(q)
      || (m.category || '').toLowerCase().includes(q)
      || mindMapCategoryLabel(categories, m.categoryId).toLowerCase().includes(q)
      || (m.nodes || []).some(n => n.label.toLowerCase().includes(q) || (n.notes || '').toLowerCase().includes(q))
    );
    const matchCat = !matchingCategoryIds || matchingCategoryIds.has(m.categoryId);
    return matchSearch && matchCat;
  });
  const groupedMaps = groupMapsByCategory(filteredMaps, categories);

  useEffect(() => {
    if (!fullscreen && !linkingFromId && !pickingHideable && selectedIds.length <= 1 && !selectedBranchId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (pickingHideable) {
        e.preventDefault();
        setPickingHideable(false);
        return;
      }
      if (linkingFromId) {
        e.preventDefault();
        cancelLinking();
        return;
      }
      if (selectedBranchId) {
        e.preventDefault();
        setSelectedBranchId(null);
        return;
      }
      if (selectedIds.length > 1) {
        e.preventDefault();
        setSelectedIds(selectedId ? [selectedId] : []);
        return;
      }
      if (fullscreen) setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    if (fullscreen) document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, linkingFromId, pickingHideable, selectedIds.length, selectedId, selectedBranchId]);

  const dueCount = maps.reduce((acc, m) => acc + (computeMapStats(m, { today: todayStr }).dueBranches || 0), 0);
  const sessions = mindMapSessions || [];

  const openEditor = (map) => {
    setActiveMapId(map.id);
    setSelectedIds(map.rootId ? [map.rootId] : []);
    setSelectedLinkId(null);
    setSelectedBranchId(null);
    setLinkingFromId(null);
    setLocalNodes(null);
    setPickingHideable(false);
    setDraftHideableIds([]);
    setView('editor');
  };

  const resetFillSession = (map, difficulty = fillDifficulty) => {
    const ids = pickFillBlankNodeIds(map, difficulty);
    setFillBlankIds(ids);
    setFillAnswers({});
    setFillVerdicts({});
    setFillPhase('fill');
    setFillMasteredIds([]);
    setStudyReviews([]);
  };

  const openStudy = (map) => {
    setActiveMapId(map.id);
    setStudyIndex(0);
    setRevealed(false);
    setStudyReviews([]);
    resetFillSession(map, fillDifficulty);
    stopwatch.reset();
    stopwatch.start();
    setView('study');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Dê um nome ao mapa (ex: Direito Constitucional).');
      return;
    }
    try {
      const cat = categories.find(c => c.id === newCategoryId);
      const created = await onAddMap({
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: cat?.name || 'Geral',
        categoryId: cat?.id || newCategoryId || null,
        color: newColor || cat?.color,
        rootLabel: newTitle.trim()
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setFormError('');
      if (created?.id) {
        setPendingMap(created);
        openEditor(created);
      }
    } catch (err) {
      setFormError(err.message || 'Não foi possível criar o mapa.');
    }
  };

  const handleMoveNode = (nodeId, pos, commit) => {
    if (!editorMap) return;
    setLocalNodes((prev) => {
      const base = prev || editorMap.nodes;
      return base.map(n => (n.id === nodeId ? { ...n, ...pos } : n));
    });
    if (commit && onUpdateNode) onUpdateNode(editorMap.id, nodeId, pos);
  };

  const handleCommitMoves = (moves = []) => {
    if (!editorMap || !moves.length) return;
    setLocalNodes((prev) => {
      const base = prev || editorMap.nodes;
      const byId = new Map(moves.map(m => [m.id, m]));
      return base.map(n => (byId.has(n.id) ? { ...n, x: byId.get(n.id).x, y: byId.get(n.id).y } : n));
    });
    if (moves.length === 1) {
      onUpdateNode?.(editorMap.id, moves[0].id, { x: moves[0].x, y: moves[0].y });
      return;
    }
    if (onUpdateNodes) {
      onUpdateNodes(editorMap.id, moves.map(m => m.id), { updates: moves });
      return;
    }
    moves.forEach((move) => onUpdateNode?.(editorMap.id, move.id, { x: move.x, y: move.y }));
  };

  const handleUpdateSelectedAppearance = (patch) => {
    if (!editorMap || !selectedIds.length) return;
    if (selectedIds.length === 1) {
      onUpdateNode?.(editorMap.id, selectedIds[0], patch);
      return;
    }
    if (onUpdateNodes) {
      onUpdateNodes(editorMap.id, selectedIds, patch);
      return;
    }
    selectedIds.forEach((id) => onUpdateNode?.(editorMap.id, id, patch));
  };

  const handleSaveNode = () => {
    persistNodeDraft(draftOwnerIdRef.current);
  };

  const handleAddChild = (parentId) => {
    if (!editorMap) return;
    onAddNode(editorMap.id, { parentId, label: 'Novo ramo' });
  };

  const handleSelectNode = (nodeIdOrIds, options = {}) => {
    if (nodeIdOrIds == null || (Array.isArray(nodeIdOrIds) && nodeIdOrIds.length === 0)) {
      if (options.marquee && options.additive) return;
      persistNodeDraft(draftOwnerIdRef.current);
      persistLinkDraft(draftLinkOwnerIdRef.current);
      setSelectedIds([]);
      return;
    }
    const incoming = Array.isArray(nodeIdOrIds) ? nodeIdOrIds.filter(Boolean) : [nodeIdOrIds];
    persistNodeDraft(draftOwnerIdRef.current);
    persistLinkDraft(draftLinkOwnerIdRef.current);
    setSelectedLinkId(null);
    setSelectedBranchId(null);
    setSelectedIds((prev) => {
      if (options.marquee) {
        if (options.additive) {
          const next = prev.slice();
          incoming.forEach((id) => {
            if (!next.includes(id)) next.push(id);
          });
          return next;
        }
        return incoming;
      }
      const id = incoming[0];
      if (options.additive) {
        if (prev.includes(id)) {
          const next = prev.filter(item => item !== id);
          return next;
        }
        return [...prev, id];
      }
      if (options.range && prev.length) {
        const nodes = editorMap?.nodes || [];
        const last = prev[prev.length - 1];
        const from = nodes.findIndex(n => n.id === last);
        const to = nodes.findIndex(n => n.id === id);
        if (from !== -1 && to !== -1) {
          const start = Math.min(from, to);
          const end = Math.max(from, to);
          const rangeIds = nodes.slice(start, end + 1).map(n => n.id);
          const base = prev.filter(item => !rangeIds.includes(item));
          return [...base, ...rangeIds];
        }
      }
      return [id];
    });
  };

  const handleSelectLink = (linkId) => {
    persistNodeDraft(draftOwnerIdRef.current);
    persistLinkDraft(draftLinkOwnerIdRef.current);
    setSelectedLinkId(linkId);
    if (linkId) {
      setSelectedIds([]);
      setSelectedBranchId(null);
    }
    setLinkingFromId(null);
  };

  const handleSelectBranch = (nodeId) => {
    persistNodeDraft(draftOwnerIdRef.current);
    persistLinkDraft(draftLinkOwnerIdRef.current);
    setSelectedBranchId(nodeId);
    if (nodeId) {
      setSelectedIds([]);
      setSelectedLinkId(null);
      setLinkingFromId(null);
    }
  };

  const handleBendBranch = (nodeId, curve, commit) => {
    if (!editorMap || !nodeId) return;
    setLocalNodes((prev) => {
      const base = prev || editorMap.nodes;
      return base.map(n => (n.id === nodeId ? { ...n, curve } : n));
    });
    if (commit && onUpdateNode) onUpdateNode(editorMap.id, nodeId, { curve });
  };

  const handleResetBranchCurve = () => {
    if (!editorMap || !selectedBranchId) return;
    setLocalNodes((prev) => {
      const base = prev || editorMap.nodes;
      return base.map(n => (n.id === selectedBranchId ? { ...n, curve: null } : n));
    });
    onUpdateNode?.(editorMap.id, selectedBranchId, { curve: null });
  };

  const startLinkFromSelected = () => {
    if (!selectedNode) return;
    setLinkError('');
    setLinkingFromId(selectedNode.id);
  };

  const startHideablePicker = () => {
    if (!editorMap) return;
    cancelLinking();
    setSelectedIds([]);
    setSelectedLinkId(null);
    setSelectedBranchId(null);
    const saved = sanitizeFillHideableNodeIds(editorMap.fillHideableNodeIds, editorMap.nodes) || [];
    setDraftHideableIds(saved);
    setPickingHideable(true);
  };

  const toggleHideableNode = (nodeId) => {
    if (!nodeId) return;
    setDraftHideableIds((prev) => (
      prev.includes(nodeId) ? prev.filter(id => id !== nodeId) : [...prev, nodeId]
    ));
  };

  const saveHideablePicker = () => {
    if (!editorMap) return;
    const cleaned = sanitizeFillHideableNodeIds(draftHideableIds, editorMap.nodes);
    onUpdateMap?.(editorMap.id, { fillHideableNodeIds: cleaned });
    setPickingHideable(false);
  };

  const cancelHideablePicker = () => {
    setPickingHideable(false);
    setDraftHideableIds([]);
  };

  const cancelLinking = () => {
    setLinkingFromId(null);
    setLinkError('');
  };

  const handleLinkTarget = async (toId) => {
    if (!editorMap || !linkingFromId) return;
    if (toId === linkingFromId) {
      setLinkError('Escolha um ramo diferente para ligar.');
      return;
    }
    try {
      const before = new Set((editorMap.crossLinks || []).map(l => l.id));
      const created = await onAddCrossLink?.(editorMap.id, { fromId: linkingFromId, toId });
      setLinkingFromId(null);
      setLinkError('');
      const newId = (created?.crossLinks || []).find(l => !before.has(l.id))?.id
        || created?.crossLinks?.slice(-1)[0]?.id
        || null;
      if (newId) {
        setSelectedLinkId(newId);
        setSelectedIds([]);
      }
    } catch (err) {
      setLinkError(err.message || 'Não foi possível criar a ligação.');
    }
  };

  const handleSaveLink = () => {
    persistLinkDraft(draftLinkOwnerIdRef.current);
  };

  const studyQueue = useMemo(() => {
    if (!liveMap) return [];
    return getStudyQueue(liveMap, { today: todayStr, mode: studyMode, includeNotDue: true });
  }, [liveMap, studyMode, todayStr]);

  const dueQueue = useMemo(() => {
    if (!liveMap) return [];
    const due = getStudyQueue(liveMap, { today: todayStr, mode: studyMode });
    return due.length ? due : studyQueue;
  }, [liveMap, studyMode, todayStr, studyQueue]);

  const currentCard = dueQueue[studyIndex] || null;

  const rateCard = (quality) => {
    if (!currentCard) return;
    setStudyReviews(prev => [...prev.filter(r => r.nodeId !== currentCard.id), { nodeId: currentCard.id, quality }]);
    setRevealed(false);
    if (studyIndex + 1 >= dueQueue.length) {
      stopwatch.pause();
      setStudyIndex(dueQueue.length);
    } else {
      setStudyIndex(i => i + 1);
    }
  };

  const finishStudy = async (reviews = studyReviews) => {
    if (!liveMap || !reviews.length) return;
    await onStudyMap(liveMap.id, {
      reviews,
      durationMinutes: Math.max(1, Math.round((stopwatch.seconds || 0) / 60)),
      mode: studyMode,
      date: todayStr
    });
    stopwatch.reset();
    setView('list');
    setActiveMapId(null);
  };

  const startFillMode = (difficulty = fillDifficulty) => {
    const level = sanitizeFillMapDifficulty(difficulty);
    setStudyMode('fill');
    setFillDifficulty(level);
    setStudyIndex(0);
    setRevealed(false);
    if (liveMap) resetFillSession(liveMap, level);
  };

  const handleFillAnswer = (nodeId, value) => {
    setFillAnswers(prev => ({ ...prev, [nodeId]: value }));
  };

  const handleFillVerdict = (nodeId, verdict) => {
    setFillVerdicts(prev => ({ ...prev, [nodeId]: verdict }));
  };

  const revealFillAnswers = () => {
    if (!fillBlankIds.length) return;
    stopwatch.pause();
    setFillPhase('review');
  };

  const fillReviewsFromRound = () => {
    const seen = new Set();
    const reviews = [];
    fillMasteredIds.forEach((nodeId) => {
      if (seen.has(nodeId)) return;
      seen.add(nodeId);
      reviews.push({ nodeId, quality: 2 });
    });
    fillBlankIds.forEach((nodeId) => {
      if (seen.has(nodeId)) return;
      seen.add(nodeId);
      reviews.push({ nodeId, quality: fillVerdicts[nodeId] === 'hit' ? 2 : 0 });
    });
    return reviews;
  };

  const retryFillMisses = () => {
    const hits = fillBlankIds.filter(id => fillVerdicts[id] === 'hit');
    const misses = fillBlankIds.filter(id => fillVerdicts[id] === 'miss');
    if (!misses.length) return;
    setFillMasteredIds(prev => [...new Set([...prev, ...hits])]);
    setFillBlankIds(misses);
    setFillAnswers((prev) => {
      const next = { ...prev };
      misses.forEach((id) => { delete next[id]; });
      return next;
    });
    setFillVerdicts({});
    setFillPhase('fill');
    if (!stopwatch.isRunning) stopwatch.start();
  };

  const commitFillStudy = async () => {
    const reviews = fillReviewsFromRound();
    setStudyReviews(reviews);
    await finishStudy(reviews);
  };

  const promptDeleteMap = (map) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Mapa Mental',
      message: `Deseja realmente excluir "${map.title}"?\nTodos os ramos e as sessões de estudo serão removidos, com estorno das recompensas.`,
      confirmText: 'Sim, Excluir Mapa',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteMap) onDeleteMap(map.id);
        if (activeMapId === map.id) {
          setActiveMapId(null);
          setView('list');
        }
        closeConfirmModal();
      }
    });
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('Informe o nome do assunto.');
      return;
    }
    try {
      if (editingCategory) {
        await onUpdateCategory(editingCategory.id, {
          name: catName.trim(),
          color: catColor,
          parentId: catParentId || null
        });
      } else {
        await onAddCategory({
          name: catName.trim(),
          color: catColor,
          parentId: catParentId || null
        });
      }
      setCatName('');
      setCatParentId('');
      setEditingCategory(null);
      setCatError('');
    } catch (err) {
      setCatError(err.message || 'Não foi possível salvar o assunto.');
    }
  };

  const promptDeleteCategory = (cat) => {
    const kids = categories.filter(c => c.parentId === cat.id).length;
    setConfirmModal({
      isOpen: true,
      title: cat.parentId ? 'Excluir subassunto' : 'Excluir assunto',
      message: kids
        ? `Excluir "${cat.name}" também remove ${kids} subassunto(s). Os mapas serão movidos para outro assunto.`
        : `Excluir "${cat.name}"? Os mapas deste assunto serão movidos para outro assunto.`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteCategory) onDeleteCategory(cat.id);
        if (editingCategory?.id === cat.id) setEditingCategory(null);
        closeConfirmModal();
      }
    });
  };

  const categoryOptions = (
    <>
      {rootCategories.map((root) => (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name}</option>
          {categories.filter(c => c.parentId === root.id).map((child) => (
            <option key={child.id} value={child.id}>{root.name} · {child.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );

  const promptDeleteNode = () => {
    if (!editorMap || !selectedNode) return;
    const root = getRootNode(editorMap);
    if (root && selectedNode.id === root.id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir ramo',
      message: `Excluir "${selectedNode.label}" e todos os ramos abaixo dele?`,
      confirmText: 'Excluir ramo',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        onDeleteNode(editorMap.id, selectedNode.id);
        setSelectedIds(editorMap.rootId ? [editorMap.rootId] : []);
        closeConfirmModal();
      }
    });
  };

  if (view === 'editor' && editorMap) {
    const stats = computeMapStats(editorMap, { today: todayStr });
    const savedHideable = sanitizeFillHideableNodeIds(editorMap.fillHideableNodeIds, editorMap.nodes);
    const hideableCount = pickingHideable ? draftHideableIds.length : (savedHideable?.length || 0);
    const editorBody = (
        <div className={`mindmap-editor-grid ${fullscreen ? 'is-fullscreen' : ''}`}>
          <MindMapCanvas
            map={editorMap}
            selectedId={pickingHideable ? null : selectedId}
            selectedIds={pickingHideable ? [] : selectedIds}
            selectedLinkId={pickingHideable ? null : selectedLinkId}
            selectedBranchId={pickingHideable ? null : selectedBranchId}
            onSelect={pickingHideable ? undefined : handleSelectNode}
            onSelectLink={pickingHideable ? undefined : handleSelectLink}
            onSelectBranch={pickingHideable ? undefined : handleSelectBranch}
            onMoveNode={pickingHideable ? undefined : handleMoveNode}
            onCommitMoves={pickingHideable ? undefined : handleCommitMoves}
            onBendBranch={pickingHideable ? undefined : handleBendBranch}
            onAddChild={pickingHideable ? undefined : handleAddChild}
            linkingFromId={pickingHideable ? null : linkingFromId}
            onLinkTarget={pickingHideable ? undefined : handleLinkTarget}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(v => !v)}
            hideablePicker={pickingHideable ? {
              ids: new Set(draftHideableIds),
              onToggle: toggleHideableNode
            } : null}
          />
          <aside className="glass-panel mindmap-side">
            {pickingHideable ? (
              <>
                <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Nós ocultáveis
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 12, lineHeight: 1.45 }}>
                  Clique nos ramos que podem ficar em branco no modo Preencher Mapa. Os marcados em azul entram no sorteio de ocultação.
                </p>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 14px', lineHeight: 1.45 }}>
                  {hideableCount
                    ? `${hideableCount} nó(s) marcado(s). Sem marcação, qualquer ramo pode ser ocultado.`
                    : 'Nenhum nó marcado: o Preencher Mapa volta a ocultar qualquer ramo, conforme a dificuldade.'}
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button type="button" className="mindmap-ghost-btn" onClick={saveHideablePicker} style={{ borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' }}>
                    <Check size={14} /> Salvar seleção
                  </button>
                  <button type="button" className="mindmap-ghost-btn" onClick={() => setDraftHideableIds([])}>
                    Limpar marcação
                  </button>
                  <button type="button" className="mindmap-ghost-btn" onClick={cancelHideablePicker}>
                    Cancelar
                  </button>
                </div>
              </>
            ) : selectedBranch && selectedBranchParent ? (
              <>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Galho selecionado
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 10, lineHeight: 1.45 }}>
                  {selectedBranchParent.label} → {selectedBranch.label}
                </p>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0 0 12px', lineHeight: 1.45 }}>
                  Arraste as âncoras quadradas para mudar de onde o galho sai e onde chega. Os três pontos redondos definem o caminho.
                </p>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <button
                    type="button"
                    className="mindmap-ghost-btn"
                    disabled={!selectedBranch.curve}
                    onClick={handleResetBranchCurve}
                  >
                    <RotateCcw size={14} /> Restaurar curva natural
                  </button>
                </div>
              </>
            ) : selectedLink ? (
              <>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Ligação entre ramos
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 10, lineHeight: 1.45 }}>
                  {(editorMap.nodes || []).find(n => n.id === selectedLink.fromId)?.label || 'Ramo'}
                  {' ↔ '}
                  {(editorMap.nodes || []).find(n => n.id === selectedLink.toId)?.label || 'Ramo'}
                </p>
                <label style={labelStyle}>Rótulo (opcional)</label>
                <input
                  value={draftLinkLabel}
                  onChange={(e) => {
                    const value = e.target.value;
                    draftLinkLabelRef.current = value;
                    setDraftLinkLabel(value);
                  }}
                  onBlur={handleSaveLink}
                  placeholder="ex: causa, exceção, vs."
                  style={inputStyle}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                  {MIND_MAP_NODE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onUpdateCrossLink?.(editorMap.id, selectedLink.id, { color })}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: color, cursor: 'pointer',
                        border: selectedLink.color === color ? '2px solid #fff' : '2px solid transparent'
                      }}
                    />
                  ))}
                </div>
                <MindMapMediaPicker
                  icon={selectedLink.icon || ''}
                  imageUrl=""
                  color={selectedLink.color}
                  allowImage={false}
                  title="Ícone da ligação"
                  onChange={(patch) => onUpdateCrossLink?.(editorMap.id, selectedLink.id, { icon: patch.icon || '' })}
                />
                <div style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="mindmap-ghost-btn is-danger"
                    onClick={() => {
                      onDeleteCrossLink?.(editorMap.id, selectedLink.id);
                      setSelectedLinkId(null);
                    }}
                  >
                    <Unlink size={14} /> Remover ligação
                  </button>
                </div>
              </>
            ) : selectedNode ? (
              <>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  {multiSelected ? `${selectedNodes.length} ramos selecionados` : 'Ramo selecionado'}
                </div>
                {multiSelected ? (
                  <>
                    <p style={{ color: '#cbd5e1', fontSize: '0.82rem', margin: '0 0 10px', lineHeight: 1.45 }}>
                      Alterações de cor, fonte, ícone e imagem valem para todos os ramos destacados.
                    </p>
                    <div className="mindmap-multi-list">
                      {selectedNodes.slice(0, 8).map((n) => (
                        <span key={n.id} className="mindmap-multi-chip">{n.label}</span>
                      ))}
                      {selectedNodes.length > 8 && (
                        <span className="mindmap-multi-chip">+{selectedNodes.length - 8}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mindmap-ghost-btn"
                      style={{ marginBottom: 10 }}
                      onClick={() => setSelectedIds(selectedId ? [selectedId] : [])}
                    >
                      Manter só o último
                    </button>
                  </>
                ) : (
                  <input
                    key={selectedNode.id}
                    value={draftLabel}
                    onChange={(e) => {
                      const value = e.target.value;
                      draftLabelRef.current = value;
                      setDraftLabel(value);
                    }}
                    onBlur={handleSaveNode}
                    style={inputStyle}
                  />
                )}
                <label style={{ ...labelStyle, marginTop: 12 }}>Tamanho do texto</label>
                <div className="mindmap-font-stepper">
                  <button
                    type="button"
                    className="mindmap-ghost-btn mindmap-font-step"
                    title="Diminuir fonte"
                    disabled={minSelectedFont <= MIND_MAP_MIN_FONT_SIZE}
                    onClick={() => handleUpdateSelectedAppearance(
                      multiSelected
                        ? { fontSizeDelta: -1 }
                        : { fontSize: stepMindMapNodeFontSize(selectedNodeFont, -1) }
                    )}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="mindmap-font-value">
                    {multiSelected && minSelectedFont !== maxSelectedFont
                      ? `${minSelectedFont}–${maxSelectedFont}px`
                      : `${selectedNodeFont}px`}
                  </span>
                  <button
                    type="button"
                    className="mindmap-ghost-btn mindmap-font-step"
                    title="Aumentar fonte"
                    disabled={maxSelectedFont >= MIND_MAP_MAX_FONT_SIZE}
                    onClick={() => handleUpdateSelectedAppearance(
                      multiSelected
                        ? { fontSizeDelta: 1 }
                        : { fontSize: stepMindMapNodeFontSize(selectedNodeFont, 1) }
                    )}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {!multiSelected && (
                  <textarea
                    key={`${selectedNode.id}-notes`}
                    value={draftNotes}
                    onChange={(e) => {
                      const value = e.target.value;
                      draftNotesRef.current = value;
                      setDraftNotes(value);
                    }}
                    onBlur={handleSaveNode}
                    placeholder="Anotação, artigo, pegadinha, exemplo..."
                    rows={6}
                    style={{ ...inputStyle, marginTop: '10px', resize: 'vertical', minHeight: '120px' }}
                  />
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                  {MIND_MAP_NODE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleUpdateSelectedAppearance({ color })}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: color, cursor: 'pointer',
                        border: sharedColor === color ? '2px solid #fff' : '2px solid transparent'
                      }}
                    />
                  ))}
                </div>
                <MindMapMediaPicker
                  icon={sharedIcon}
                  imageUrl={sharedImage}
                  color={sharedColor || selectedNode.color}
                  title={multiSelected ? 'Ícone ou imagem de todos' : 'Ícone ou imagem'}
                  onChange={(patch) => handleUpdateSelectedAppearance(patch)}
                />
                {mixedMedia && (
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '6px 0 0', lineHeight: 1.45 }}>
                    Os ramos têm mídias diferentes. Escolher um ícone ou imagem substitui em todos.
                  </p>
                )}
                {!multiSelected && (
                  <div style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
                    <button type="button" className="mindmap-ghost-btn" onClick={() => handleAddChild(selectedNode.id)}>
                      <Plus size={14} /> Novo ramo filho
                    </button>
                    {linkingFromId === selectedNode.id ? (
                      <button type="button" className="mindmap-ghost-btn" style={{ borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' }} onClick={cancelLinking}>
                        <X size={14} /> Cancelar ligação
                      </button>
                    ) : (
                      <button type="button" className="mindmap-ghost-btn" onClick={startLinkFromSelected}>
                        <Link2 size={14} /> Ligar a outro ramo
                      </button>
                    )}
                    {linkError && <p style={{ color: '#f87171', fontSize: '0.78rem', margin: 0 }}>{linkError}</p>}
                    <button
                      type="button"
                      className="mindmap-ghost-btn"
                      onClick={() => onUpdateNode(editorMap.id, selectedNode.id, { collapsed: !selectedNode.collapsed })}
                    >
                      {selectedNode.collapsed ? <Eye size={14} /> : <EyeOff size={14} />}
                      {selectedNode.collapsed ? 'Expandir ramos' : 'Recolher ramos'}
                    </button>
                    {selectedNode.id !== editorMap.rootId && (
                      <button type="button" className="mindmap-ghost-btn is-danger" onClick={promptDeleteNode}>
                        <Trash2 size={14} /> Excluir ramo
                      </button>
                    )}
                  </div>
                )}
                <label style={{ ...labelStyle, marginTop: 14 }}>Linhas do mapa</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  <button
                    type="button"
                    className="mindmap-ghost-btn"
                    style={editorMap.lineStyle === 'taper' ? { borderColor: 'rgba(168,85,247,0.5)', color: '#c084fc' } : undefined}
                    onClick={() => onUpdateMap?.(editorMap.id, { lineStyle: 'taper' })}
                  >
                    Galhos
                  </button>
                  <button
                    type="button"
                    className="mindmap-ghost-btn"
                    style={editorMap.lineStyle !== 'taper' ? { borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' } : undefined}
                    onClick={() => onUpdateMap?.(editorMap.id, { lineStyle: 'curve' })}
                  >
                    Linhas
                  </button>
                </div>
                <label style={{ ...labelStyle, marginTop: 14 }}>Tamanho da fonte</label>
                <button
                  type="button"
                  className="mindmap-ghost-btn"
                  style={editorMap.scaleFontByDepth ? { borderColor: 'rgba(251,191,36,0.5)', color: '#fbbf24' } : undefined}
                  onClick={() => onUpdateMap?.(editorMap.id, { scaleFontByDepth: !editorMap.scaleFontByDepth })}
                >
                  {editorMap.scaleFontByDepth ? 'Núcleo maior · ligado' : 'Núcleo maior · desligado'}
                </button>
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.45 }}>
                  Quando ligado, o texto fica maior perto do núcleo e menor nas pontas.
                </p>
                <label style={{ ...labelStyle, marginTop: 14 }}>Assunto</label>
                <select
                  value={editorMap.categoryId || ''}
                  onChange={(e) => {
                    const cat = categories.find(c => c.id === e.target.value);
                    if (onUpdateMap) onUpdateMap(editorMap.id, { categoryId: cat?.id || null, category: cat?.name || 'Geral' });
                  }}
                  style={inputStyle}
                >
                  {categoryOptions}
                </select>
                {!multiSelected && (
                  <div style={{ marginTop: '16px', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                    Caminho: {nodePath(editorMap, selectedNode.id).map(n => n.label).join(' → ')}
                  </div>
                )}
              </>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>
                Clique em um ramo para editar, anotar ou ramificar. Clique no galho para curvá-lo: âncoras nos nós e três pontos de rota. Ctrl/Cmd+clique ou Shift+arrastar no fundo seleciona vários para mudar cor, fonte e ícone juntos.
              </p>
            )}
          </aside>
        </div>
    );
    return (
      <div className={fullscreen ? 'mindmap-fullscreen-root' : undefined}>
        {!fullscreen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <button type="button" className="mindmap-ghost-btn" onClick={() => { setFullscreen(false); setView('list'); setActiveMapId(null); }}>
                <ArrowLeft size={16} /> Mapas
              </button>
              <div>
                <h2 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{editorMap.title}</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                  {mindMapCategoryLabel(categories, editorMap.categoryId, editorMap.category)} · {stats.branches} ramos · {stats.dueBranches} para revisar
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(true)}>
                <Maximize2 size={15} /> Tela cheia
              </button>
              <button
                type="button"
                className="mindmap-ghost-btn"
                onClick={() => onUpdateMap?.(editorMap.id, { scaleFontByDepth: !editorMap.scaleFontByDepth })}
                title="Quanto mais perto do núcleo, maior a fonte"
                style={editorMap.scaleFontByDepth ? { borderColor: 'rgba(251,191,36,0.45)', color: '#fbbf24' } : undefined}
              >
                Aa {editorMap.scaleFontByDepth ? 'Núcleo maior' : 'Fonte igual'}
              </button>
              <button
                type="button"
                className="mindmap-ghost-btn"
                onClick={() => onUpdateMap?.(editorMap.id, { lineStyle: editorMap.lineStyle === 'taper' ? 'curve' : 'taper' })}
                title={editorMap.lineStyle === 'taper' ? 'Usar linhas finas' : 'Usar galhos que afinam'}
              >
                <GitBranch size={15} /> {editorMap.lineStyle === 'taper' ? 'Galhos' : 'Linhas'}
              </button>
              {pickingHideable ? (
                <>
                  <button type="button" className="mindmap-ghost-btn" onClick={cancelHideablePicker}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="mindmap-ghost-btn"
                    onClick={saveHideablePicker}
                    style={{ borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' }}
                  >
                    <Check size={15} /> Salvar ocultáveis ({hideableCount})
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="mindmap-ghost-btn"
                  onClick={startHideablePicker}
                  title="Escolher quais nós podem ficar em branco no Preencher Mapa"
                  style={savedHideable ? { borderColor: 'rgba(56,189,248,0.45)', color: '#38bdf8' } : undefined}
                >
                  <EyeOff size={15} /> {savedHideable ? `Ocultáveis (${hideableCount})` : 'Nós ocultáveis'}
                </button>
              )}
              <button type="button" className="mindmap-ghost-btn" onClick={() => onLayoutMap(editorMap.id)}>
                <Layout size={15} /> Organizar
              </button>
              <button
                type="button"
                onClick={() => openStudy(editorMap)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer'
                }}
              >
                <GraduationCap size={16} /> Estudar mapa
              </button>
            </div>
          </div>
        )}
        {fullscreen && (
          <div className="mindmap-fullscreen-bar">
            <span className="font-cinzel">{editorMap.title}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="mindmap-ghost-btn"
                onClick={() => onUpdateMap?.(editorMap.id, { scaleFontByDepth: !editorMap.scaleFontByDepth })}
                style={editorMap.scaleFontByDepth ? { borderColor: 'rgba(251,191,36,0.45)', color: '#fbbf24' } : undefined}
              >
                Aa {editorMap.scaleFontByDepth ? 'Núcleo maior' : 'Fonte igual'}
              </button>
              <button
                type="button"
                className="mindmap-ghost-btn"
                onClick={() => onUpdateMap?.(editorMap.id, { lineStyle: editorMap.lineStyle === 'taper' ? 'curve' : 'taper' })}
              >
                <GitBranch size={14} /> {editorMap.lineStyle === 'taper' ? 'Galhos' : 'Linhas'}
              </button>
              {pickingHideable ? (
                <button
                  type="button"
                  className="mindmap-ghost-btn"
                  onClick={saveHideablePicker}
                  style={{ borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' }}
                >
                  <Check size={14} /> Salvar ocultáveis
                </button>
              ) : (
                <button
                  type="button"
                  className="mindmap-ghost-btn"
                  onClick={startHideablePicker}
                  style={savedHideable ? { borderColor: 'rgba(56,189,248,0.45)', color: '#38bdf8' } : undefined}
                >
                  <EyeOff size={14} /> Ocultáveis
                </button>
              )}
              <button type="button" className="mindmap-ghost-btn" onClick={() => onLayoutMap(editorMap.id)}><Layout size={14} /> Organizar</button>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(false)}><Minimize2 size={14} /> Sair</button>
            </div>
          </div>
        )}
        {editorBody}
        <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
      </div>
    );
  }

  if (view === 'study' && liveMap) {
    const done = studyMode !== 'fill' && studyIndex >= dueQueue.length && studyReviews.length > 0;
    const fillBlankSet = new Set(fillBlankIds);
    const fillMarked = fillBlankIds.filter(id => fillVerdicts[id]).length;
    const fillHits = fillBlankIds.filter(id => fillVerdicts[id] === 'hit').length;
    const fillMisses = fillBlankIds.filter(id => fillVerdicts[id] === 'miss').length;
    const fillReady = fillPhase === 'review' && fillBlankIds.length > 0 && fillMarked === fillBlankIds.length;
    const fillPerfect = fillReady && fillMisses === 0;
    const hasBranches = (liveMap.nodes || []).some(n => n.parentId);
    return (
      <div className={fullscreen ? 'mindmap-fullscreen-root mindmap-study-fullscreen' : undefined}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <button type="button" className="mindmap-ghost-btn" onClick={() => { stopwatch.reset(); setFullscreen(false); setView('editor'); }}>
            <ArrowLeft size={16} /> Voltar ao mapa
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            <Clock size={14} /> {formatTimer(stopwatch.seconds)}
            <button type="button" className="mindmap-ghost-btn" onClick={() => (stopwatch.isRunning ? stopwatch.pause() : stopwatch.start())}>
              {stopwatch.isRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" className="mindmap-ghost-btn" onClick={stopwatch.reset}><RotateCcw size={14} /></button>
            <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(v => !v)}>
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {fullscreen ? 'Sair' : 'Tela cheia'}
            </button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '10px', display: 'inline-flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => { setStudyMode('branches'); setStudyIndex(0); setRevealed(false); setStudyReviews([]); }}
            className="mindmap-ghost-btn"
            style={studyMode === 'branches' ? { borderColor: 'rgba(168,85,247,0.5)', color: '#c084fc' } : undefined}
          >
            <GitBranch size={14} /> Recobrir ramos
          </button>
          <button
            type="button"
            onClick={() => { setStudyMode('cards'); setStudyIndex(0); setRevealed(false); setStudyReviews([]); }}
            className="mindmap-ghost-btn"
            style={studyMode === 'cards' ? { borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' } : undefined}
          >
            <Layers size={14} /> Cartões pai → filho
          </button>
          <button
            type="button"
            onClick={() => startFillMode(fillDifficulty)}
            className="mindmap-ghost-btn"
            style={studyMode === 'fill' ? { borderColor: 'rgba(251,191,36,0.5)', color: '#fbbf24' } : undefined}
          >
            <PenLine size={14} /> Preencher mapa
          </button>
        </div>

        {studyMode === 'fill' ? (
          !hasBranches ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              <Brain size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p>Este mapa ainda não tem ramos para preencher. Volte ao editor e ramifique o núcleo.</p>
            </div>
          ) : (
            <div className="mindmap-fill-study">
              <div className="glass-panel mindmap-fill-toolbar">
                <div className="mindmap-fill-levels">
                  {FILL_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      className="mindmap-ghost-btn"
                      onClick={() => startFillMode(level.id)}
                      style={fillDifficulty === level.id ? { borderColor: 'rgba(251,191,36,0.5)', color: '#fbbf24' } : undefined}
                    >
                      {level.label}
                      <span className="mindmap-fill-level-hint">{level.hint}</span>
                    </button>
                  ))}
                </div>
                <p className="mindmap-fill-copy">
                  {fillPhase === 'fill'
                    ? `Preencha os ${fillBlankIds.length} nós em branco e clique em Finalizar.`
                    : fillReady
                      ? (fillPerfect
                        ? `Tudo certo: ${fillHits}/${fillBlankIds.length}. Registre o estudo.`
                        : `${fillHits}/${fillBlankIds.length} acertos. Refaça os errados ou registre o estudo.`)
                      : `Respostas reveladas. Marque cada nó como acerto ou erro (${fillMarked}/${fillBlankIds.length}).`}
                </p>
                {fillPhase === 'fill' ? (
                  <button type="button" className="mindmap-fill-cta" onClick={revealFillAnswers}>
                    Finalizar
                  </button>
                ) : (
                  <div className="mindmap-fill-actions">
                    {fillReady && fillMisses > 0 && (
                      <button type="button" className="mindmap-fill-cta is-secondary" onClick={retryFillMisses}>
                        <RotateCcw size={14} /> Refazer Errados ({fillMisses})
                      </button>
                    )}
                    <button
                      type="button"
                      className="mindmap-fill-cta"
                      disabled={!fillReady}
                      onClick={commitFillStudy}
                    >
                      {fillReady
                        ? `Registrar estudo · ${fillHits}/${fillBlankIds.length} acertos`
                        : 'Marque acerto ou erro em cada nó'}
                    </button>
                  </div>
                )}
              </div>
              <MindMapCanvas
                map={{ ...liveMap, nodes: (liveMap.nodes || []).map(n => ({ ...n, collapsed: false })) }}
                readOnly
                fullscreen={fullscreen}
                onToggleFullscreen={() => setFullscreen(v => !v)}
                fillMode={{
                  blankIds: fillBlankSet,
                  answers: fillAnswers,
                  verdicts: fillVerdicts,
                  phase: fillPhase,
                  onChange: handleFillAnswer,
                  onVerdict: handleFillVerdict
                }}
              />
            </div>
          )
        ) : dueQueue.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
            <Brain size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <p>Este mapa ainda não tem ramos para estudar. Volte ao editor e ramifique o núcleo.</p>
          </div>
        ) : done ? (
          <div className="glass-panel" style={{ padding: '28px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <Sparkles size={28} color="#fbbf24" style={{ marginBottom: 10 }} />
            <h3 className="font-cinzel" style={{ fontSize: '1.2rem', marginBottom: 8 }}>Sessão concluída</h3>
            <p style={{ color: '#94a3b8', marginBottom: 18 }}>
              {studyReviews.filter(r => r.quality >= 2).length}/{studyReviews.length} ramos lembrados · {formatTimer(stopwatch.seconds)}
            </p>
            <button
              type="button"
              onClick={() => finishStudy()}
              style={{
                padding: '12px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 800,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#000'
              }}
            >
              Registrar estudo e ganhar XP
            </button>
          </div>
        ) : (
          <div className="glass-panel mindmap-study-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '10px' }}>
              <span>{currentCard.path?.join(' → ')}</span>
              <span>{studyIndex + 1} / {dueQueue.length}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <MindMapThumb
                node={{ icon: currentCard.promptIcon, imageUrl: currentCard.promptImageUrl }}
                size={44}
              />
              <h3 className="font-cinzel" style={{ fontSize: '1.45rem', margin: 0 }}>{currentCard.prompt}</h3>
            </div>
            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                style={{
                  width: '100%', padding: '16px', borderRadius: '12px', border: '1px dashed rgba(168,85,247,0.45)',
                  background: 'rgba(168,85,247,0.08)', color: '#e9d5ff', fontWeight: 800, cursor: 'pointer'
                }}
              >
                Revelar ramos
              </button>
            ) : (
              <>
                <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                  {(currentCard.answerNodes || (currentCard.answer ? [{ label: currentCard.answer, icon: currentCard.answerIcon, imageUrl: currentCard.answerImageUrl }] : [])).filter(a => a.label).map((ans) => (
                    <div key={`${ans.label}-${ans.icon || ''}`} className="mindmap-answer" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MindMapThumb node={ans} size={28} />
                      <span>{ans.label}</span>
                    </div>
                  ))}
                  {currentCard.notes && (
                    <p style={{ color: '#cbd5e1', fontSize: '0.88rem', fontStyle: 'italic' }}>{currentCard.notes}</p>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => rateCard(opt.value)}
                      style={{
                        padding: '12px 8px', borderRadius: '12px', border: `1px solid ${opt.color}55`,
                        background: `${opt.color}18`, color: opt.color, fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.8 }}>{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🧠</span> Cartografia do Conhecimento
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Crie mapas mentais, ramifique ideias e estude depois com revisão espaçada.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className="mindmap-ghost-btn"
            onClick={() => { setShowCategoryModal(true); setCatError(''); setEditingCategory(null); setCatName(''); setCatParentId(''); }}
          >
            <FolderTree size={16} /> Assuntos
          </button>
          <button
            type="button"
            onClick={() => { setShowAddModal(true); setFormError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer'
            }}
          >
            <Plus size={18} /> Novo mapa
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', marginBottom: '18px' }}>
        <StatCard label="Mapas" value={maps.length} color="#c084fc" />
        <StatCard label="Ramos para revisar" value={dueCount} color="#fbbf24" />
        <StatCard label="Sessões de estudo" value={sessions.length} color="#38bdf8" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div className="glass-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar mapa, ramo ou anotação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none' }}
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 220 }}
        >
          <option value="all">Todos os assuntos</option>
          {categoryOptions}
        </select>
      </div>

      {sessions.length > 0 && (
        <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '18px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px' }}>
            Últimas sessões de estudo
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {sessions.slice(0, 5).map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.mapTitle} · {s.recalled}/{s.reviewed} ramos ({s.accuracy}%)
                </span>
                <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{s.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredMaps.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
          <Network size={42} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p>Nenhum mapa mental ainda. Crie o primeiro núcleo e ramifique a matéria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '22px' }}>
          {groupedMaps.filter(g => g.topics.some(t => t.maps.length)).map((group) => (
            <section key={group.root.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: group.root.color || '#a855f7' }} />
                <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#e2e8f0' }}>{group.root.name}</h3>
              </div>
              {group.topics.filter(t => t.maps.length > 0).map((topic) => (
                <div key={topic.category.id} style={{ marginBottom: 14 }}>
                  {topic.category.id !== group.root.id && (
                    <div style={{ fontSize: '0.75rem', color: topic.category.color || '#94a3b8', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '6px 0 10px 18px' }}>
                      {topic.category.name}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                    {topic.maps.map((map) => {
                      const stats = computeMapStats(map, { today: todayStr });
                      return (
                        <div key={map.id} className="rpg-card" style={{ padding: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: map.color || topic.category.color || '#c084fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {mindMapCategoryLabel(categories, map.categoryId, map.category || 'Geral')}
                              </div>
                              <h3 className="font-cinzel" style={{ fontSize: '1.05rem', margin: '6px 0' }}>{map.title}</h3>
                              {map.description && <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{map.description}</p>}
                            </div>
                            <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteMap(map)} title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '12px', margin: '14px 0', fontSize: '0.78rem', color: '#cbd5e1' }}>
                            <span><GitBranch size={12} /> {stats.branches} ramos</span>
                            <span><Bookmark size={12} /> {stats.withNotes} notas</span>
                            <span><Brain size={12} /> {stats.mastery}%</span>
                          </div>
                          <div className="progress-container" style={{ height: 8, marginBottom: 14 }}>
                            <div style={{ width: `${stats.mastery}%`, height: '100%', background: map.color || '#a855f7', borderRadius: 999 }} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="mindmap-ghost-btn" onClick={() => openEditor(map)} style={{ flex: 1, justifyContent: 'center' }}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => openStudy(map)}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800,
                                background: 'rgba(168,85,247,0.18)', color: '#e9d5ff'
                              }}
                            >
                              <GraduationCap size={14} /> Estudar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,13,0.88)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form className="modal-sheet glass-panel" onSubmit={handleCreate} style={{ maxWidth: 480, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="font-cinzel">Novo mapa mental</h3>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <label style={labelStyle}>Título / núcleo</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Direito Constitucional" style={inputStyle} autoFocus />
            <label style={{ ...labelStyle, marginTop: 12 }}>Descrição</label>
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="O que este mapa vai organizar?" />
            <label style={{ ...labelStyle, marginTop: 12 }}>Assunto / subassunto</label>
            <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} style={inputStyle}>
              {categoryOptions}
            </select>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {MIND_MAP_NODE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: color, border: newColor === color ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                />
              ))}
            </div>
            {formError && (
              <p style={{ color: '#f87171', marginTop: 12, fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertCircle size={14} /> {formError}
              </p>
            )}
            <button
              type="submit"
              style={{
                marginTop: 18, width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800,
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff'
              }}
            >
              <Check size={14} style={{ marginRight: 6 }} /> Criar e abrir editor
            </button>
          </form>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,13,0.88)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-sheet glass-panel" style={{ maxWidth: 560, width: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="font-cinzel" style={{ color: '#c084fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size={18} /> Assuntos e subassuntos
              </h3>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setShowCategoryModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateCategory} style={{ marginBottom: 18, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={labelStyle}>{editingCategory ? 'Editar assunto' : 'Novo assunto'}</label>
              <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Direito Constitucional" style={inputStyle} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Nível</label>
              <select value={catParentId} onChange={(e) => setCatParentId(e.target.value)} style={inputStyle}>
                <option value="">Assunto (matéria)</option>
                {rootCategories.filter(c => c.id !== editingCategory?.id).map((root) => (
                  <option key={root.id} value={root.id}>Subassunto de {root.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {MIND_MAP_NODE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCatColor(color)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: color, border: catColor === color ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                  />
                ))}
              </div>
              {catError && <p style={{ color: '#f87171', marginTop: 10, fontSize: '0.8rem' }}>{catError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="mindmap-ghost-btn" style={{ color: '#e9d5ff', borderColor: 'rgba(168,85,247,0.4)' }}>
                  <Check size={14} /> {editingCategory ? 'Salvar' : 'Adicionar'}
                </button>
                {editingCategory && (
                  <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(null); setCatName(''); setCatParentId(''); }}>
                    Cancelar edição
                  </button>
                )}
              </div>
            </form>
            <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {rootCategories.map((root) => (
                <div key={root.id}>
                  <div className="mindmap-cat-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: root.color }} />
                      <strong>{root.name}</strong>
                    </span>
                    <span>
                      <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(root); setCatName(root.name); setCatColor(root.color); setCatParentId(''); }}><Pencil size={12} /></button>
                      <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteCategory(root)}><Trash2 size={12} /></button>
                    </span>
                  </div>
                  {categories.filter(c => c.parentId === root.id).map((child) => (
                    <div key={child.id} className="mindmap-cat-row is-child">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: child.color }} />
                        {child.name}
                      </span>
                      <span>
                        <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(child); setCatName(child.name); setCatColor(child.color); setCatParentId(child.parentId || ''); }}><Pencil size={12} /></button>
                        <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteCategory(child)}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#0c0e14',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f8fafc',
  fontSize: '0.9rem'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#94a3b8',
  fontWeight: 700,
  marginBottom: 6
};
