import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'grimorio_focus_player';
const AUDIO_SRC = '/api/focus/audio';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { volume: 0.8, loop: true, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : 0.8,
      loop: parsed.loop !== false,
      muted: !!parsed.muted
    };
  } catch {
    return { volume: 0.8, loop: true, muted: false };
  }
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useFocusPlayer() {
  const audioRef = useRef(null);
  const prefs = useRef(loadPrefs());
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(prefs.current.volume);
  const [muted, setMuted] = useState(prefs.current.muted);
  const [loop, setLoop] = useState(prefs.current.loop);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const ensureSrc = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const current = audio.getAttribute('src') || audio.src || '';
    if (!current.includes('/api/focus/audio')) {
      audio.src = AUDIO_SRC;
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.loop = prefs.current.loop;
    audio.volume = prefs.current.muted ? 0 : prefs.current.volume;
    audioRef.current = audio;

    const onLoaded = () => {
      setDuration(audio.duration || 0);
      setReady(true);
      setLoading(false);
      setError(null);
    };
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
      setLoading(false);
    };
    const onPause = () => setPlaying(false);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onEnded = () => {
      if (!audio.loop) {
        setPlaying(false);
        setCurrentTime(0);
      }
    };
    const onError = () => {
      setLoading(false);
      setPlaying(false);
      setError('Não foi possível carregar o áudio de foco. O servidor não encontrou data/audio/focus_mp3.mp3.');
    };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const next = { volume, loop, muted };
    prefs.current = next;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = loop;
    audio.volume = muted ? 0 : volume;
  }, [volume, loop, muted]);

  const prepare = useCallback(() => {
    ensureSrc();
  }, [ensureSrc]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureSrc();
    setError(null);
    setLoading(true);
    try {
      await audio.play();
    } catch (err) {
      setLoading(false);
      setPlaying(false);
      setError(err?.message || 'O navegador bloqueou a reprodução. Clique em Tocar novamente.');
    }
  }, [ensureSrc]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const seek = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    ensureSrc();
    const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    const next = Math.min(Math.max(0, seconds), max || seconds);
    audio.currentTime = next;
    setCurrentTime(next);
  }, [duration, ensureSrc]);

  const skip = useCallback((delta) => {
    const audio = audioRef.current;
    if (!audio) return;
    seek((audio.currentTime || 0) + delta);
  }, [seek]);

  const setVolume = useCallback((value) => {
    const next = Math.min(1, Math.max(0, value));
    setVolumeState(next);
    if (next > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  const toggleLoop = useCallback(() => {
    setLoop((prev) => !prev);
  }, []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return {
    playing,
    currentTime,
    duration,
    volume,
    muted,
    loop,
    ready,
    error,
    loading,
    progress,
    src: AUDIO_SRC,
    prepare,
    play,
    pause,
    toggle,
    seek,
    skip,
    setVolume,
    toggleMute,
    toggleLoop,
    formatClock
  };
}
