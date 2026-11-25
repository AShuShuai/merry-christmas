import React, { useState, useRef, useEffect } from 'react';
import { ChristmasTreeCanvas, CanvasHandle } from './components/ChristmasTreeCanvas';
import { ControlsPanel } from './components/ControlsPanel';
import { TreeSettings } from './types';
import { DEFAULT_SETTINGS } from './config/themes';
import { chimeAudio } from './utils/audio';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<TreeSettings>(() => {
    // Load saved settings from localStorage if available
    try {
      const saved = localStorage.getItem('christmas_tree_settings_v1');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return DEFAULT_SETTINGS;
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const canvasRef = useRef<CanvasHandle | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('christmas_tree_settings_v1', JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Audio Toggle
  const handleToggleAudio = () => {
    const nextState = !settings.musicEnabled;
    setSettings((prev) => ({ ...prev, musicEnabled: nextState }));
    chimeAudio.setLoop(nextState);
  };

  // Fullscreen Toggle
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#080209] select-none">
      {/* 3D Canvas Scene */}
      <ChristmasTreeCanvas ref={canvasRef} settings={settings} />

      {/* Floating Controls Overlay */}
      <ControlsPanel
        settings={settings}
        onUpdateSettings={setSettings}
        canvasRef={canvasRef}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleAudio={handleToggleAudio}
      />
    </div>
  );
};

export default App;
