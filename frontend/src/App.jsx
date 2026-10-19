import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import StudioView from './components/StudioView';
import GalleryView from './components/GalleryView';
import CropStudioModal from './components/CropStudioModal';
import CaptionEditorModal from './components/CaptionEditorModal';
import { fetchHealth, fetchState, fetchOptions, resetWorkspace } from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('studio');
  const [health, setHealth] = useState(null);
  const [state, setState] = useState(null);
  const [options, setOptions] = useState(null);
  const [isResetting, setIsResetting] = useState(false);

  // Active Modals
  const [cropStudioCandidate, setCropStudioCandidate] = useState(null);
  const [captionEditorCandidate, setCaptionEditorCandidate] = useState(null);

  const loadAll = async () => {
    try {
      const [h, s, o] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchState().catch(() => null),
        fetchOptions().catch(() => null)
      ]);
      setHealth(h);
      setState(s);
      setOptions(o);
    } catch (err) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(() => {
      fetchHealth().then(setHealth).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    if (!window.confirm('Reset semua video source, transkrip, dan kandidat?')) return;
    try {
      setIsResetting(true);
      await resetWorkspace();
      await loadAll();
      setIsResetting(false);
    } catch (err) {
      setIsResetting(false);
      alert('Gagal reset workspace: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 flex flex-col font-sans selection:bg-neon selection:text-dark-bg">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        onReset={handleReset}
        isResetting={isResetting}
      />

      <main className="flex-1">
        {activeTab === 'studio' ? (
          <StudioView
            state={state}
            options={options}
            onRefreshState={loadAll}
            onOpenCropStudio={(cand) => setCropStudioCandidate(cand)}
            onOpenCaptionEditor={(cand) => setCaptionEditorCandidate(cand)}
            onClipRendered={() => loadAll()}
          />
        ) : (
          <GalleryView />
        )}
      </main>

      {/* Modal 1: Crop Studio Keyframe Framing */}
      {cropStudioCandidate && (
        <CropStudioModal
          candidate={cropStudioCandidate}
          videoUrl={state?.video?.url}
          onClose={() => setCropStudioCandidate(null)}
          onApply={(data) => {
            console.log('Applied crop data:', data);
            setCropStudioCandidate(null);
          }}
        />
      )}

      {/* Modal 2: Caption Editor */}
      {captionEditorCandidate && (
        <CaptionEditorModal
          candidate={captionEditorCandidate}
          videoUrl={state?.video?.url}
          onClose={() => setCaptionEditorCandidate(null)}
          onSave={(data) => {
            if (state?.candidates) {
              cropStudioCandidate.hook = data.hookTitle;
            }
            setCaptionEditorCandidate(null);
          }}
        />
      )}
    </div>
  );
}
