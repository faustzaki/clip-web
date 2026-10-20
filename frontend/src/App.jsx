import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import ProjectsView from './components/ProjectsView';
import NewProjectView from './components/NewProjectView';
import StudioView from './components/StudioView';
import GalleryView from './components/GalleryView';
import CropStudioModal from './components/CropStudioModal';
import CaptionEditorModal from './components/CaptionEditorModal';
import { fetchHealth, fetchState, fetchOptions, fetchProjects, resetWorkspace } from './api';

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

  const [cropStudioCandidate, setCropStudioCandidate] = useState(null);
  const [captionEditorCandidate, setCaptionEditorCandidate] = useState(null);

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

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
    fetchOptions().then(setOptions).catch(() => {});
    loadProjects();
    const interval = setInterval(() => {
      fetchHealth().then(setHealth).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const s = state?.ingest?.status;
    if (!activeProjectId || (s !== 'running' && s !== 'starting')) return;
    const t = setInterval(() => loadProjectState(activeProjectId), 1500);
    return () => clearInterval(t);
  }, [activeProjectId, state?.ingest?.status]);

  const handleReset = async () => {
    if (!activeProjectId) return;
    if (!window.confirm('Reset video source, transkrip, dan kandidat project ini?')) return;
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

  return (
    <div className="min-h-screen bg-dark-bg text-gray-100 flex flex-col font-sans selection:bg-neon selection:text-dark-bg">
      <Navbar
        projectId={view === 'project' ? activeProjectId : null}
        projectTitle={state?.project?.title || null}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        onBackToProjects={backToProjects}
        onReset={handleReset}
        isResetting={isResetting}
      />

      <main className="flex-1">
        {view === 'projects' && (
          <ProjectsView
            projects={projects}
            isLoading={isLoadingProjects}
            onOpen={openProject}
            onNew={() => setView('new')}
            onRefresh={loadProjects}
          />
        )}
        {view === 'new' && (
          <NewProjectView
            options={options}
            onCreated={(pid) => openProject(pid)}
            onCancel={backToProjects}
          />
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
              onOpenCaptionEditor={(cand) => setCaptionEditorCandidate(cand)}
              onClipRendered={() => loadProjectState(activeProjectId)}
            />
          ) : (
            <GalleryView projectId={activeProjectId} />
          )
        )}
      </main>

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
