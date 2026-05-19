'use client';
import { useEffect, useRef, useState } from 'react';
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

  // Cast tokens let Chromecast/AirPlay fetch the asset without portal cookies.
  // Only applied to plain-MP4 routes — HLS would need every segment URL
  // rewritten to include the token, which is a bigger change. We strip any
  // existing query, request a token scoped to this videoId, then append it
  // so <video controls> exposes a cast-ready URL. Chrome's built-in cast
  // affordance picks it up automatically.
  const [tokenSrc, setTokenSrc] = useState<string | null>(null);
  useEffect(() => {
    if (isHls) return;
    const m = src.match(/\/api\/file\/([a-f0-9]{16})/);
    if (!m) return;
    const vid = m[1];
    let cancelled = false;
    fetch(`/cast-token/alpha_tube/${vid}`, { method: 'POST', credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.token) return;
        const sep = src.includes('?') ? '&' : '?';
        setTokenSrc(`${src}${sep}token=${d.token}`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src, isHls]);

  const effectiveSrc = tokenSrc ?? src;

  // Google Cast SDK: load lazily, expose an explicit button. Chrome's built-in
  // <video controls> cast affordance only shows when its discovery thread
  // already found a device — failure modes here are silent. An explicit button
  // also makes the feature visible in non-Chrome chromium builds.
  const [castReady, setCastReady] = useState(false);
  const [casting, setCasting] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.cast?.framework) { setCastReady(true); return; }
    if (w.__castScriptLoading) return;
    w.__castScriptLoading = true;
    w.__onGCastApiAvailable = (available: boolean) => {
      if (!available) return;
      const ctx = w.cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      setCastReady(true);
    };
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.async = true;
    document.head.appendChild(s);
  }, []);

  const startCast = async () => {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (!w.cast?.framework) return;
    const ctx = w.cast.framework.CastContext.getInstance();
    try {
      // Pop the device picker. Cancel throws — that's a no-op.
      await ctx.requestSession();
      const session = ctx.getCurrentSession();
      if (!session) return;
      // Cast device fetches the URL itself, so use an absolute origin and
      // the token-authenticated src.
      const absoluteSrc = new URL(effectiveSrc, window.location.origin).toString();
      const mediaInfo = new w.chrome.cast.media.MediaInfo(absoluteSrc, 'video/mp4');
      const md = new w.chrome.cast.media.GenericMediaMetadata();
      if (title) md.title = title;
      if (artist) md.subtitle = artist;
      if (artwork) md.images = [new w.chrome.cast.Image(new URL(artwork, window.location.origin).toString())];
      mediaInfo.metadata = md;
      await session.loadMedia(new w.chrome.cast.media.LoadRequest(mediaInfo));
      setCasting(true);
      const stateListener = (ev: any) => {
        const SESSION_END = w.cast.framework.SessionState.SESSION_ENDED;
        if (ev.sessionState === SESSION_END) {
          setCasting(false);
          ctx.removeEventListener(w.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, stateListener);
        }
      };
      ctx.addEventListener(w.cast.framework.CastContextEventType.SESSION_STATE_CHANGED, stateListener);
    } catch {
      /* user cancelled / no device / etc. */
    }
  };

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
    <div className="relative">
      <video
        ref={ref}
        src={isHls ? undefined : effectiveSrc}
        controls
        poster={poster ?? undefined}
        className="w-full aspect-video bg-black rounded-lg"
        playsInline
        preload="metadata"
      />
      {castReady && !isHls && (
        <button
          type="button"
          onClick={startCast}
          aria-label={casting ? 'Casting' : 'Cast to device'}
          title={casting ? 'Casting to device' : 'Cast to TV'}
          className={
            'absolute right-3 top-3 px-2.5 py-1.5 rounded text-xs font-medium ' +
            (casting ? 'bg-red-600 text-white' : 'bg-black/60 text-white hover:bg-black/80')
          }
        >
          📺 {casting ? 'Casting' : 'Cast'}
        </button>
      )}
    </div>
  );
}
