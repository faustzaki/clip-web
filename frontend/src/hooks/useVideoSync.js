import { useEffect } from 'react';

/**
 * Sinkronisasi elemen <video> ke state editor (satu elemen video, ref diteruskan lewat props):
 * - `timeupdate` → currentTime (DETIK, kontrak lama)
 * - `loadedmetadata` → duration
 * - balik ke awal kandidat aktif saat playback melewati `end` (perilaku lama)
 * Listener dibersihkan saat ganti video / unmount. `videoUrl` jadi dependency agar re-attach
 * saat elemen video di-mount ulang.
 */
export default function useVideoSync({ videoRef, videoUrl, activeCandidate, setCurrentTime, setDuration }) {
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoUrl) return;

    const handleTimeUpdate = () => {
      setCurrentTime(el.currentTime);
      if (activeCandidate && typeof activeCandidate.end === 'number' && el.currentTime >= activeCandidate.end) {
        el.currentTime = activeCandidate.start || 0;
      }
    };
    const handleLoadedMetadata = () => setDuration(el.duration || 0);

    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('loadedmetadata', handleLoadedMetadata);
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);

    return () => {
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoRef, videoUrl, activeCandidate, setCurrentTime, setDuration]);
}
