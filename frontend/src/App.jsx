import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ProjectsView from './components/ProjectsView';
import NewProjectView from './components/NewProjectView';
import StudioView from './components/StudioView';
import GalleryView from './components/GalleryView';
import CropStudioModal from './components/CropStudioModal';
import SubtitleApplyModal from './components/SubtitleApplyModal';
import SettingsModal from './components/SettingsModal';
import { fetchHealth, fetchState, fetchOptions, fetchProjects, resetWorkspace, putCrop } from './api';

export default function App() {
  const [view, setView] = useState('projects');
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState('studio');
  const [health, setHealth] = useState(null);
  const [state, setState] = useState(null);
  const [options, setOptions] = useState(null);
  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serverDown, setServerDown] = useState(false);

  const [cropStudioCandidate, setCropStudioCandidate] = useState(null);
  const [subtitleApplyTarget, setSubtitleApplyTarget] = useState(null);

  const loadProjects = async () => {
    try {
      setIsLoadingProjects(true);
      const p = await fetchProjects();
      setProjects(p);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadProjectState = async (pid) => {
    try {
      const s = await fetchState(pid);
      setState(s);
    } catch (err) {
      console.error('Failed to load project state:', err);
    }
  };

  const openProject = (pid) => {
    setActiveProjectId(pid);
    setState(null);
    setActiveTab('studio');
    setView('project');
    loadProjectState(pid);
  };

  const backToProjects = () => {
    setActiveProjectId(null);
    setState(null);
    setView('projects');
    loadProjects();
  };

  const checkHealth = async () => {
    try {
      const h = await fetchHealth();
      setHealth(h);
      setServerDown(false);
      return true;
    } catch {
      setServerDown(true);
      return false;
    }
  };

  useEffect(() => {
    checkHealth().then((ok) => {
      if (ok) {
        fetchOptions().then(setOptions).catch(() => {});
        loadProjects();
      }
    });
    const interval = setInterval(() => {
      checkHealth().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const busy = ['running', 'starting'].includes(state?.ingest?.status);
    if (!activeProjectId || !busy) return;
    const t = setInterval(() => loadProjectState(activeProjectId), 1500);
    return () => clearInterval(t);
  }, [activeProjectId, state?.ingest?.status]);

  const handleReset = async () => {
    if (!activeProjectId) return;
    if (!window.confirm('Reset video source, transkrip, kandidat, dan klip project ini?')) return;
    try {
      setIsResetting(true);
      await resetWorkspace(activeProjectId);
      await loadProjectState(activeProjectId);
      setIsResetting(false);
    } catch (err) {
      setIsResetting(false);
      alert('Gagal reset workspace: ' + err.message);
    }
  };

  if (serverDown) {
    return (
      <div className="h-screen w-screen bg-dark-bg text-gray-100 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-dark-card border border-dark-border rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-white">Server backend tidak jalan</h1>
            <p className="text-xs text-gray-400 leading-relaxed">
              Jalankan <code className="px-1.5 py-0.5 rounded bg-dark-bg border border-dark-border text-neon font-mono">run.bat</code> di folder project, lalu coba lagi.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              checkHealth().then((ok) => {
                if (ok) {
                  fetchOptions().then(setOptions).catch(() => {});
                  loadProjects();
                }
              });
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-neon hover:bg-neon/90 text-white font-semibold text-xs transition-colors cursor-pointer"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-dark-bg text-gray-100 flex flex-col font-sans selection:bg-neon selection:text-white">
      <Navbar
        projectId={view === 'project' ? activeProjectId : null}
        projectTitle={state?.project?.title || null}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onBackToProjects={backToProjects}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {view === 'projects' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ProjectsView
              projects={projects}
              isLoading={isLoadingProjects}
              onOpen={openProject}
              onNew={() => setView('new')}
              onRefresh={loadProjects}
            />
          </div>
        )}
        {view === 'new' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <NewProjectView
              options={options}
              onCreated={(pid) => openProject(pid)}
              onCancel={backToProjects}
            />
          </div>
        )}
        {view === 'project' && (
          activeTab === 'studio' ? (
            <StudioView
              projectId={activeProjectId}
              state={state}
              options={options}
              onRefreshState={() => loadProjectState(activeProjectId)}
              onBackToProjects={backToProjects}
              onOpenCropStudio={(cand) => setCropStudioCandidate(cand)}
              onOpenSubtitleApply={(target) => setSubtitleApplyTarget(target)}
              onGoToGallery={() => setActiveTab('gallery')}
              onClipRendered={() => loadProjectState(activeProjectId)}
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <GalleryView projectId={activeProjectId} />
            </div>
          )
        )}
      </main>

      {cropStudioCandidate && (
        <CropStudioModal
          candidate={cropStudioCandidate}
          videoUrl={state?.video?.url}
          videoWidth={state?.video?.width}
          videoHeight={state?.video?.height}
          cropRect={state?.project?.crops?.[String(cropStudioCandidate.idx)]}
          onClose={() => setCropStudioCandidate(null)}
          onApply={async ({ rect }) => {
            try {
              await putCrop(activeProjectId, cropStudioCandidate.idx, rect);
              await loadProjectState(activeProjectId);
            } catch (err) {
              console.error('Failed to save crop:', err);
            }
            setCropStudioCandidate(null);
          }}
        />
      )}

      {subtitleApplyTarget && (
        <SubtitleApplyModal
          projectId={activeProjectId}
          clip={subtitleApplyTarget.clip}
          candidate={subtitleApplyTarget.candidate}
          prefs={state?.project?.render_prefs}
          onPrefsChange={async () => {
            await loadProjectState(activeProjectId);
          }}
          fonts={options?.subtitle_fonts}
          positions={options?.subtitle_positions}
          onClose={() => setSubtitleApplyTarget(null)}
          onApplied={async () => {
            await loadProjectState(activeProjectId);
          }}
          onGoToGallery={() => {
            setActiveTab('gallery');
            setSubtitleApplyTarget(null);
          }}
        />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        health={health}
        projectId={activeProjectId}
        onResetWorkspace={handleReset}
        isResetting={isResetting}
        onSettingsSaved={async () => {
          try {
            const [opts, h] = await Promise.all([fetchOptions(), fetchHealth()]);
            setOptions(opts);
            setHealth(h);
          } catch (e) {
            console.error('Failed to reload options:', e);
          }
        }}
      />
    </div>
  );
}
