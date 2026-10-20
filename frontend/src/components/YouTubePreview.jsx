import React, { useEffect, useRef } from 'react';

let ytApiPromise = null;
function loadIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve(window.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytApiPromise;
}

export default function YouTubePreview({
  videoId,
  start,
  muted,
  onTime,
  onDuration,
  onError,
  apiRef,
}) {
  const hostRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let unmounted = false;

    loadIframeApi().then((YT) => {
      if (unmounted || !hostRef.current) return;

      const player = new YT.Player(hostRef.current, {
        videoId,
        playerVars: {
          controls: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          start: Math.floor(start || 0),
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (unmounted) return;
            if (muted) player.mute(); else player.unMute();
            if (onDuration) onDuration(player.getDuration());
            clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
              if (onTime) onTime(player.getCurrentTime?.() || 0);
            }, 250);
          },
          onError: (e) => {
            if (onError) onError(e?.data);
          },
        },
      });

      playerRef.current = player;

      if (apiRef) {
        apiRef.current = {
          play: () => player.playVideo(),
          pause: () => player.pauseVideo(),
          seek: (t) => player.seekTo(t, true),
          muted: (m) => (m ? player.mute() : player.unMute()),
          isPaused: () => player.getPlayerState() !== 1,
        };
      }
    });

    return () => {
      unmounted = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (apiRef) {
        apiRef.current = null;
      }
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || typeof player.mute !== 'function') return;
    if (muted) player.mute(); else player.unMute();
  }, [muted]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || typeof player.seekTo !== 'function') return;
    player.seekTo(start || 0, true);
  }, [start]);

  return (
    <div className="w-full h-full">
      <div ref={hostRef} className="w-full h-full" />
    </div>
  );
}
