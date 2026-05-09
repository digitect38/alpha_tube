'use client';
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

type Props = {
  src: string;
  poster?: string | null;
  title?: string;
  artist?: string;
  artwork?: string | null;
};

export function Player({ src, poster, title, artist, artwork }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const isHls = src.endsWith('.m3u8');

  // For non-HLS (plain MP4 — what every imported video uses) the src prop on
  // the JSX element is enough; React/SSR handles hydration. We only need an
  // effect for HLS, which Chrome/Firefox can't play natively without hls.js.
  useEffect(() => {
    if (!isHls) return;
    const video = ref.current;
    if (!video) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;     // Safari plays HLS natively.
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    // Last-resort fallback (older browsers).
    video.src = src;
  }, [src, isHls]);

  // Media Session: lock-screen / OS-level metadata + transport controls. This
  // is what keeps audio playing when the screen is off.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!title) return;
    const video = ref.current;
    if (!video) return;

    navigator.mediaSession.metadata = new window.MediaMetadata({
      title,
      artist: artist ?? '',
      album: 'Alpha Tube',
      artwork: artwork
        ? [{ src: artwork, sizes: '480x270', type: 'image/jpeg' }]
        : [],
    });

    const setIfSupported = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    };

    setIfSupported('play',  () => video.play());
    setIfSupported('pause', () => video.pause());
    setIfSupported('seekto', e => {
      if (typeof e.seekTime === 'number') video.currentTime = e.seekTime;
    });
    setIfSupported('seekbackward', e => {
      video.currentTime = Math.max(0, video.currentTime - (e.seekOffset ?? 10));
    });
    setIfSupported('seekforward', e => {
      video.currentTime = Math.min(
        Number.isFinite(video.duration) ? video.duration : Infinity,
        video.currentTime + (e.seekOffset ?? 10),
      );
    });

    const onPlay  = () => { navigator.mediaSession.playbackState = 'playing'; };
    const onPause = () => { navigator.mediaSession.playbackState = 'paused'; };
    video.addEventListener('play',  onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('play',  onPlay);
      video.removeEventListener('pause', onPause);
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      ['play','pause','seekto','seekbackward','seekforward'].forEach(a =>
        setIfSupported(a as MediaSessionAction, null),
      );
    };
  }, [title, artist, artwork]);

  // Fullscreen UX: double-click toggles, F key toggles, M mutes, space toggles
  // play. iOS Safari needs the webkit-prefixed video.webkitEnterFullscreen()
  // because it doesn't expose the standard Fullscreen API on element level.
  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const enter = async () => {
      const v = video as HTMLVideoElement & {
        webkitEnterFullscreen?: () => void;
      };
      if (v.requestFullscreen) {
        try { await v.requestFullscreen(); return; } catch {}
      }
      if (typeof v.webkitEnterFullscreen === 'function') {
        v.webkitEnterFullscreen();
      }
    };

    const exit = async () => {
      const d = document as Document & {
        webkitExitFullscreen?: () => Promise<void>;
      };
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      } else if (typeof d.webkitExitFullscreen === 'function') {
        await d.webkitExitFullscreen();
      }
    };

    const toggle = () => {
      if (document.fullscreenElement) exit();
      else enter();
    };

    const onDblClick = () => toggle();
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inTextInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (inTextInput) return;
      const key = e.key.toLowerCase();
      if (key === 'f') { e.preventDefault(); toggle(); }
      else if (key === 'm') { e.preventDefault(); video.muted = !video.muted; }
      else if (key === ' ' && document.activeElement === video) {
        e.preventDefault();
        if (video.paused) video.play(); else video.pause();
      }
    };

    video.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    return () => {
      video.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <video
      ref={ref}
      src={isHls ? undefined : src}
      controls
      poster={poster ?? undefined}
      className="w-full aspect-video bg-black rounded-lg"
      playsInline
      preload="metadata"
    />
  );
}
