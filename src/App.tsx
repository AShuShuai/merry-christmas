import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChristmasTreeCanvas, CanvasHandle } from './components/ChristmasTreeCanvas';
import { ControlsPanel } from './components/ControlsPanel';
import { FloatingPhotosOverlay } from './components/FloatingPhotosOverlay';
import { HandTrackingWebcam } from './components/HandTrackingWebcam';
import { PhotoLightbox } from './components/PhotoLightbox';
import { TreeSettings, HandGestureState, MemoryPhoto } from './types';
import { DEFAULT_SETTINGS } from './config/themes';
import { chimeAudio } from './utils/audio';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<TreeSettings>(() => {
    try {
      const saved = localStorage.getItem('christmas_tree_settings_v3');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    // Always default to 'frozen' (Blue style)
    return DEFAULT_SETTINGS;
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isUiHidden, setIsUiHidden] = useState<boolean>(false);
  const canvasRef = useRef<CanvasHandle | null>(null);

  // Camera projection state shared with 3D floating photos
  const [cameraState, setCameraState] = useState({
    yaw: 0,
    pitch: 0,
    width: 0,
    height: 0,
    focal: 800,
    scatter: 0,
  });

  // Hand Tracking Gesture State
  const [gestureState, setGestureState] = useState<HandGestureState>({
    hasHand: false,
    gesture: 'none',
    cursorX: 0.5,
    cursorY: 0.5,
    deltaX: 0,
    deltaY: 0,
    pinchDistance: 1,
    isPinching: false,
  });

  // Selected Memory Photo for Lightbox Modal
  const [selectedPhoto, setSelectedPhoto] = useState<MemoryPhoto | null>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('christmas_tree_settings_v3', JSON.stringify(settings));
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

  // Webcam Toggle
  const handleToggleWebcam = () => {
    setSettings((prev) => ({ ...prev, webcamEnabled: !prev.webcamEnabled }));
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

  // Hotkey 'H' to hide/show UI for clean recording / full immersion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setIsUiHidden((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Camera broadcast from canvas render loop
  const handleCameraUpdate = useCallback(
    (
      yaw: number,
      pitch: number,
      width: number,
      height: number,
      focal: number,
      scatter: number
    ) => {
      setCameraState({ yaw, pitch, width, height, focal, scatter });
    },
    []
  );

  // Gesture callback from MediaPipe hand tracker
  const handleGestureUpdate = useCallback((st: HandGestureState) => {
    setGestureState(st);

    // Open Palm 🖐️: Disperse tree into floating cloud of polaroid memories (Chaos Mode)
    if (st.gesture === 'open_palm') {
      setSettings((prev) => (prev.treeState !== 'dispersed' ? { ...prev, treeState: 'dispersed' } : prev));
    }

    // Fist ✊: Assemble tree back into conical Christmas tree & close modal
    if (st.gesture === 'fist') {
      setSettings((prev) => (prev.treeState !== 'formed' ? { ...prev, treeState: 'formed' } : prev));
      setSelectedPhoto(null);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#02050c] select-none">
      {/* 3D Canvas Scene */}
      <ChristmasTreeCanvas
        ref={canvasRef}
        settings={settings}
        gestureDeltaX={settings.webcamEnabled && gestureState.hasHand ? gestureState.deltaX : 0}
        gestureDeltaY={settings.webcamEnabled && gestureState.hasHand ? gestureState.deltaY : 0}
        onCameraUpdate={handleCameraUpdate}
      />

      {/* 3D Floating Memory Polaroids Overlay */}
      {settings.showPhotos && (
        <FloatingPhotosOverlay
          photos={settings.photos}
          yaw={cameraState.yaw}
          pitch={cameraState.pitch}
          width={cameraState.width}
          height={cameraState.height}
          focal={cameraState.focal}
          scatter={cameraState.scatter}
          gestureState={gestureState}
          onSelectPhoto={setSelectedPhoto}
          activePhoto={selectedPhoto}
        />
      )}

      {/* Webcam Hand Tracking PIP Widget */}
      {!isUiHidden && (
        <HandTrackingWebcam
          enabled={settings.webcamEnabled}
          onToggle={handleToggleWebcam}
          onGesture={handleGestureUpdate}
          gestureState={gestureState}
        />
      )}

      {/* Floating Controls Overlay */}
      {!isUiHidden && (
        <ControlsPanel
          settings={settings}
          onUpdateSettings={setSettings}
          canvasRef={canvasRef}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleAudio={handleToggleAudio}
          onToggleWebcam={handleToggleWebcam}
        />
      )}

      {/* Keyboard Helper Hint */}
      {!isUiHidden && (
        <div className="fixed top-4 left-4 z-30 pointer-events-none text-[11px] font-mono text-cyan-200/50 bg-black/35 backdrop-blur-sm px-3 py-1.5 rounded-full border border-cyan-400/15 hidden md:block">
          Premi <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-200 font-bold">H</kbd> per nascondere i tasti
        </div>
      )}

      {/* Fullscreen Photo Lightbox Modal */}
      <PhotoLightbox photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
    </div>
  );
};

export default App;
