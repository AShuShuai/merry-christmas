import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChristmasTreeCanvas, CanvasHandle } from './components/ChristmasTreeCanvas';
import { ControlsPanel } from './components/ControlsPanel';
import { FloatingPhotosOverlay } from './components/FloatingPhotosOverlay';
import { HandTrackingWebcam } from './components/HandTrackingWebcam';
import { PhotoLightbox } from './components/PhotoLightbox';
import { TreeSettings, HandGestureState, MemoryPhoto, PhotoTransitionOrigin } from './types';
import { DEFAULT_SETTINGS } from './config/themes';
import { chimeAudio } from './utils/audio';

const SETTINGS_STORAGE_KEY = 'christmas_tree_settings_v6';
const PREVIOUS_SETTINGS_STORAGE_KEYS = [
  'christmas_tree_settings_v5',
  'christmas_tree_settings_v4',
  'christmas_tree_settings_v3',
];

interface ChristmasSceneProps {
  settings: TreeSettings;
  gestureState: HandGestureState;
  canvasRef: React.MutableRefObject<CanvasHandle | null>;
  isPhotoOpen: boolean;
  isPhotoClosing: boolean;
  selectedPhotoId?: string;
  onSelectPhoto: (photo: MemoryPhoto, origin?: PhotoTransitionOrigin) => void;
  onPhotoOriginUpdate: (photoId: string, origin: PhotoTransitionOrigin) => void;
  onRequestClosePhoto: () => void;
}

const ChristmasScene = React.memo<ChristmasSceneProps>(({
  settings,
  gestureState,
  canvasRef,
  isPhotoOpen,
  isPhotoClosing,
  selectedPhotoId,
  onSelectPhoto,
  onPhotoOriginUpdate,
  onRequestClosePhoto,
}) => {
  const [cameraState, setCameraState] = useState({
    yaw: 0,
    pitch: 0,
    width: 0,
    height: 0,
    focal: 800,
    scatter: 0,
    intro: 0,
  });

  const handleCameraUpdate = useCallback(
    (
      yaw: number,
      pitch: number,
      width: number,
      height: number,
      focal: number,
      scatter: number,
      intro: number
    ) => {
      setCameraState({ yaw, pitch, width, height, focal, scatter, intro });
    },
    []
  );

  return (
    <>
      <ChristmasTreeCanvas
        ref={canvasRef}
        settings={settings}
        gestureDeltaX={settings.webcamEnabled && gestureState.hasHand ? gestureState.deltaX : 0}
        gestureDeltaY={settings.webcamEnabled && gestureState.hasHand ? gestureState.deltaY : 0}
        onCameraUpdate={handleCameraUpdate}
      />
      {settings.showPhotos && (
        <FloatingPhotosOverlay
          photos={settings.photos}
          yaw={cameraState.yaw}
          pitch={cameraState.pitch}
          width={cameraState.width}
          height={cameraState.height}
          focal={cameraState.focal}
          scatter={cameraState.scatter}
          introProgress={cameraState.intro}
          treeIsDispersed={settings.treeState === 'dispersed'}
          gestureState={gestureState}
          onSelectPhoto={onSelectPhoto}
          selectedPhotoId={selectedPhotoId}
          onPhotoOriginUpdate={onPhotoOriginUpdate}
          isPhotoOpen={isPhotoOpen}
          isPhotoClosing={isPhotoClosing}
          onRequestClosePhoto={onRequestClosePhoto}
        />
      )}
    </>
  );
});

export const App: React.FC = () => {
  const [settings, setSettings] = useState<TreeSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        const savedSettings = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...savedSettings,
          themeId: savedSettings.themeId === 'frozen' ? DEFAULT_SETTINGS.themeId : savedSettings.themeId,
          treeState: 'formed',
        };
      }
      for (const storageKey of PREVIOUS_SETTINGS_STORAGE_KEYS) {
        const previousSettings = localStorage.getItem(storageKey);
        if (previousSettings) {
          const savedSettings = JSON.parse(previousSettings);
          return {
            ...DEFAULT_SETTINGS,
            ...savedSettings,
            themeId: savedSettings.themeId === 'frozen' ? DEFAULT_SETTINGS.themeId : savedSettings.themeId,
            webcamEnabled: true,
            treeState: 'formed',
          };
        }
      }
    } catch {
      // fallback
    }
    // Fall back to the default theme when there are no saved settings.
    return DEFAULT_SETTINGS;
  });

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isUiHidden, setIsUiHidden] = useState<boolean>(false);
  const canvasRef = useRef<CanvasHandle | null>(null);

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
  const [photoOrigin, setPhotoOrigin] = useState<PhotoTransitionOrigin | undefined>();
  const [isPhotoClosing, setIsPhotoClosing] = useState(false);
  const photoOriginRef = useRef<PhotoTransitionOrigin | undefined>();
  const selectedPhotoIdRef = useRef<string | null>(null);
  const [photoCloseRequest, setPhotoCloseRequest] = useState(0);
  const photoOpenRef = useRef(false);
  const closeRequestedRef = useRef(false);
  const handleSelectPhoto = useCallback((photo: MemoryPhoto, origin?: PhotoTransitionOrigin) => {
    closeRequestedRef.current = false;
    photoOpenRef.current = true;
    setIsPhotoClosing(false);
    selectedPhotoIdRef.current = photo.id;
    photoOriginRef.current = origin;
    setPhotoOrigin(origin);
    setSelectedPhoto(photo);
  }, []);
  const handlePhotoOriginUpdate = useCallback((photoId: string, origin: PhotoTransitionOrigin) => {
    if (selectedPhotoIdRef.current === photoId) {
      photoOriginRef.current = origin;
    }
  }, []);
  const handlePhotoCloseStart = useCallback(() => setIsPhotoClosing(true), []);
  const getCurrentPhotoOrigin = useCallback(() => photoOriginRef.current, []);
  const handleClosePhoto = useCallback(() => {
    photoOpenRef.current = false;
    closeRequestedRef.current = false;
    setIsPhotoClosing(false);
    selectedPhotoIdRef.current = null;
    photoOriginRef.current = undefined;
    setPhotoOrigin(undefined);
    setSelectedPhoto(null);
  }, []);
  const requestPhotoClose = useCallback(() => {
    if (!photoOpenRef.current || closeRequestedRef.current) return;
    closeRequestedRef.current = true;
    setPhotoCloseRequest((request) => request + 1);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Audio Toggle
  const handleToggleAudio = useCallback(() => {
    const nextState = !settings.musicEnabled;
    setSettings((prev) => ({ ...prev, musicEnabled: nextState }));
    chimeAudio.setLoop(nextState);
  }, [settings.musicEnabled]);

  // Webcam Toggle
  const handleToggleWebcam = useCallback(() => {
    setSettings((prev) => ({ ...prev, webcamEnabled: !prev.webcamEnabled }));
  }, []);

  // Fullscreen Toggle
  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

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

  // Gesture callback from MediaPipe hand tracker
  const handleGestureUpdate = useCallback((st: HandGestureState) => {
    setGestureState(st);

    // Keep the tree formed when no hand is visible; an open palm disperses it.
    if (!st.hasHand || st.gesture === 'fist') {
      setSettings((prev) => (prev.treeState !== 'formed' ? { ...prev, treeState: 'formed' } : prev));
    } else if (st.gesture === 'open_palm') {
      setSettings((prev) => (prev.treeState !== 'dispersed' ? { ...prev, treeState: 'dispersed' } : prev));
    }

    // Fist ✊: Assemble tree back into conical Christmas tree & close modal
    if (st.gesture === 'fist') {
      requestPhotoClose();
    }
  }, [requestPhotoClose]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#02050c] select-none">
      <ChristmasScene
        settings={settings}
        gestureState={gestureState}
        canvasRef={canvasRef}
        isPhotoOpen={selectedPhoto !== null}
        isPhotoClosing={isPhotoClosing}
        selectedPhotoId={selectedPhoto?.id}
        onSelectPhoto={handleSelectPhoto}
        onPhotoOriginUpdate={handlePhotoOriginUpdate}
        onRequestClosePhoto={requestPhotoClose}
      />

      {/* Keep the tracker mounted while the UI is hidden to avoid restarting the camera. */}
      <HandTrackingWebcam
        enabled={settings.webcamEnabled}
        visible={!isUiHidden}
        onGesture={handleGestureUpdate}
      />

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
      <PhotoLightbox
        photo={selectedPhoto}
        origin={photoOrigin}
        getCurrentOrigin={getCurrentPhotoOrigin}
        closeRequest={photoCloseRequest}
        onCloseStart={handlePhotoCloseStart}
        onClose={handleClosePhoto}
      />
    </div>
  );
};

export default App;
