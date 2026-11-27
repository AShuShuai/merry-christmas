import React, { useState } from 'react';
import {
  Sparkles,
  Info,
  Palette,
  Type,
  Sliders,
  RotateCcw,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Heart,
  Image,
  Plus,
  Trash2,
} from 'lucide-react';
import { TreeSettings, ThemeId, GreetingFont, MemoryPhoto, PortraitLoadStatus } from '../types';
import { THEMES } from '../config/themes';
import { DEFAULT_PHOTOS } from '../config/defaultPhotos';
import { CanvasHandle } from './ChristmasTreeCanvas';

interface Props {
  settings: TreeSettings;
  onUpdateSettings: (updater: (prev: TreeSettings) => TreeSettings) => void;
  portraitStatus: { status: PortraitLoadStatus; message?: string };
  canvasRef: React.RefObject<CanvasHandle>;
  onToggleAudio: () => void;
}

export const ControlsPanel = React.memo<Props>(({
  settings,
  onUpdateSettings,
  portraitStatus,
  canvasRef,
  onToggleAudio,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isHelpHovered, setIsHelpHovered] = useState(false);
  const [activeTab, setActiveTab] = useState<'photos' | 'text' | 'theme' | 'effects'>('photos');

  // New photo form state
  const [newTitle, setNewTitle] = useState<string>('');
  const [newSubtitle, setNewSubtitle] = useState<string>('');
  const [newImgUrl, setNewImgUrl] = useState<string>('');
  const [portraitUploadError, setPortraitUploadError] = useState('');

  const themesList = Object.values(THEMES);

  // Handle local image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setNewImgUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePortraitUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPortraitUploadError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setPortraitUploadError('Impossibile leggere il file selezionato.');
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        try {
          const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D context is unavailable');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const portraitUrl = canvas.toDataURL('image/jpeg', 0.84);
          onUpdateSettings((prev) => ({ ...prev, portraitUrl }));
        } catch (error) {
          console.error('Unable to prepare the selected portrait image.', error);
          setPortraitUploadError('Impossibile preparare questa immagine per il ritratto.');
        }
      };
      image.onerror = () => {
        setPortraitUploadError('Il file selezionato non è un’immagine valida.');
      };
      image.src = reader.result;
    };
    reader.onerror = () => {
      console.error('Unable to read the selected portrait image.', reader.error);
      setPortraitUploadError('Impossibile leggere il file selezionato.');
    };
    reader.readAsDataURL(file);
  };

  const handleAddPhoto = () => {
    if (!newImgUrl.trim()) return;

    const newPhoto: MemoryPhoto = {
      id: `photo-${Date.now()}`,
      url: newImgUrl,
      title: newTitle.trim() || 'Ricordo Speciale ❤️',
      subtitle: newSubtitle.trim() || 'Un momento magico insieme',
      angle: Math.random() * Math.PI * 2,
      y: (Math.random() - 0.5) * 8,
      radius: 6.0 + Math.random() * 2.0,
    };

    onUpdateSettings((prev) => ({
      ...prev,
      showPhotos: true,
      photos: [...prev.photos, newPhoto],
    }));

    setNewTitle('');
    setNewSubtitle('');
    setNewImgUrl('');
  };

  const handleRemovePhoto = (id: string) => {
    onUpdateSettings((prev) => ({
      ...prev,
      photos: prev.photos.filter((p) => p.id !== id),
    }));
  };

  const handleResetPhotos = () => {
    onUpdateSettings((prev) => ({
      ...prev,
      photos: DEFAULT_PHOTOS,
    }));
  };

  return (
    <>
      {/* Floating Action Button Bar (Top Right) */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-2 pointer-events-auto">
        {/* Toggle Audio Chimes Button */}
        <button
          type="button"
          onClick={onToggleAudio}
          title={settings.musicEnabled ? 'Disattiva Musica Carillon' : 'Attiva Musica Carillon di Natale'}
          className={`p-3 rounded-full backdrop-blur-md border transition-all duration-300 shadow-lg ${
            settings.musicEnabled
              ? 'bg-pink-500/30 border-pink-400/60 text-pink-200 shadow-pink-500/25 animate-pulse'
              : 'bg-black/40 border-white/15 text-white/70 hover:text-white hover:bg-black/60 hover:border-white/30'
          }`}
        >
          {settings.musicEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>

        {/* Open/Close Settings Panel Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Personalizza Albero, Foto e Gesti"
          className={`px-4 py-2.5 rounded-full backdrop-blur-md border font-sans text-xs font-semibold flex items-center gap-2 transition-all duration-300 shadow-lg ${
            isOpen
              ? 'bg-cyan-500/35 border-cyan-400/60 text-white shadow-cyan-500/30'
              : 'bg-black/45 border-white/20 text-white/90 hover:bg-black/65 hover:border-cyan-400/50 hover:text-white'
          }`}
        >
          <Sparkles size={16} className="text-cyan-300 animate-spin-slow" />
          <span>Personalizza</span>
          {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div
        className="fixed bottom-4 left-4 z-40 pointer-events-auto"
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setIsHelpHovered(true);
        }}
        onPointerLeave={() => setIsHelpHovered(false)}
      >
        {(isHelpOpen || isHelpHovered) && (
          <div
            id="gesture-help"
            role="tooltip"
            className="absolute bottom-full left-0 mb-3 w-64 rounded-2xl border border-white/15 bg-[#07101c]/85 p-4 text-left text-xs text-white/80 shadow-2xl backdrop-blur-xl"
          >
            <h2 className="mb-2 font-semibold text-cyan-200">Gesti della mano</h2>
            <p className="mb-1.5">Muovi la mano per ruotare l'albero.</p>
            <p className="mb-1.5">Palmo aperto: trasforma l'albero nel ritratto; pugno: ricomponilo.</p>
            <p>Pizzica con indice e pollice per aprire una foto.</p>
          </div>
        )}
        <button
          type="button"
          aria-label="Istruzioni per i gesti"
          aria-expanded={isHelpOpen || isHelpHovered}
          aria-controls="gesture-help"
          onClick={() => setIsHelpOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/75 shadow-lg backdrop-blur-md transition-colors hover:border-cyan-300/50 hover:bg-black/65 hover:text-cyan-100"
        >
          <Info size={17} />
        </button>
      </div>

      {/* Settings Modal Drawer (Slide-in from Right) */}
      {isOpen && (
        <aside className="fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 bg-[#070e1c]/95 backdrop-blur-2xl border-l border-cyan-400/20 text-white flex flex-col shadow-2xl animate-slide-left font-sans">
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-wide flex items-center gap-1.5 text-white">
                  <span>Albero di Natale &amp; Ricordi</span>
                  <Heart size={14} className="text-cyan-400 fill-cyan-400" />
                </h2>
                <p className="text-[11px] text-cyan-200/60">Foto fluttuanti 3D, gesti della mano e dedica</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-4 p-2 bg-white/[0.02] border-b border-white/10 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'photos'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Image size={13} />
              <span>Foto</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'text'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Type size={13} />
              <span>Dedica</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'theme'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Palette size={13} />
              <span>Temi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('effects')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1 transition-all ${
                activeTab === 'effects'
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Sliders size={13} />
              <span>Effetti</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs custom-scrollbar">
            {/* TAB: FOTO & RICORDI FLUTTUANTI */}
            {activeTab === 'photos' && (
              <div className="space-y-5">
                {/* Quick Tree State Toggle (Formed vs Dispersed) */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings((prev) => ({ ...prev, treeState: 'formed' }))}
                    className={`py-2 px-3 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      settings.treeState === 'formed'
                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20'
                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <span>🎄 Compatto (✊)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings((prev) => ({ ...prev, treeState: 'dispersed' }))}
                    className={`py-2 px-3 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      settings.treeState === 'dispersed'
                        ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/20'
                        : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white'
                    }`}
                  >
                    <span>✨ Ritratto (🖐️)</span>
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <h4 className="font-semibold text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-300" />
                    <span>Ritratto di scintille</span>
                  </h4>
                  <label className="block text-[11px] text-white/70">
                    Usa una foto dei ricordi
                    <select
                      value={settings.portraitUrl}
                      onChange={(e) => {
                        setPortraitUploadError('');
                        onUpdateSettings((prev) => ({ ...prev, portraitUrl: e.target.value }));
                      }}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/15 text-white focus:outline-none focus:border-amber-300"
                    >
                      <option value="/chiara-portrait.jpg">Ritratto predefinito</option>
                      {settings.photos.map((photo) => (
                        <option key={photo.id} value={photo.url}>
                          {photo.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[11px] text-white/70">
                    Oppure carica un altro ritratto
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePortraitUpload}
                      className="mt-1 w-full text-[11px] text-white/60 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-amber-400/20 file:text-amber-100 file:font-semibold hover:file:bg-amber-400/30 cursor-pointer"
                    />
                  </label>
                  {settings.portraitUrl && (
                    <img
                      src={settings.portraitUrl}
                      alt="Anteprima del ritratto"
                      className="w-16 h-16 object-cover rounded-lg border border-amber-300/40"
                    />
                  )}
                  {portraitUploadError ? (
                    <p role="alert" className="text-[10px] text-red-300">{portraitUploadError}</p>
                  ) : portraitStatus.status === 'error' ? (
                    <p role="alert" className="text-[10px] text-red-300">
                      Ritratto non pronto: {portraitStatus.message}
                    </p>
                  ) : (
                    <p className="text-[10px] text-white/45" aria-live="polite">
                      {portraitStatus.status === 'loading'
                        ? 'Caricamento MediaPipe e analisi della foto...'
                        : 'Ritratto pronto: i tratti del volto diventano bianchi e tornano ai colori dell’albero.'}
                    </p>
                  )}
                </div>

                {/* Show/Hide Photos Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/10">
                  <div>
                    <span className="font-semibold text-white block">Mostra Foto sull'Albero 3D</span>
                    <span className="text-[10px] text-white/50">Foto polaroid che ruotano con l'albero</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.showPhotos}
                    onChange={(e) =>
                      onUpdateSettings((prev) => ({ ...prev, showPhotos: e.target.checked }))
                    }
                    className="w-4 h-4 rounded accent-cyan-400 cursor-pointer"
                  />
                </div>

                {/* Add New Custom Photo Section */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <h4 className="font-semibold text-white flex items-center gap-1.5">
                    <Plus size={14} className="text-cyan-400" />
                    <span>Aggiungi una Foto Personale</span>
                  </h4>

                  <div>
                    <label className="block text-[11px] text-white/70 mb-1">Carica Foto dal Dispositivo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="w-full text-[11px] text-white/60 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:bg-cyan-500/20 file:text-cyan-200 file:font-semibold hover:file:bg-cyan-500/30 cursor-pointer"
                    />
                  </div>

                  {newImgUrl && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-cyan-400/50 shadow-md">
                      <img src={newImgUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-white/70 mb-1">Titolo del Ricordo</label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="es. Io e Chiara a Natale ❤️"
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-white/70 mb-1">Dedica o Sottotitolo (Opzionale)</label>
                    <input
                      type="text"
                      value={newSubtitle}
                      onChange={(e) => setNewSubtitle(e.target.value)}
                      placeholder="es. Una serata indimenticabile..."
                      className="w-full px-3 py-2 rounded-xl bg-white/[0.05] border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddPhoto}
                    disabled={!newImgUrl}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs disabled:opacity-40 hover:brightness-110 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    Aggiungi Ricordo all'Albero ✨
                  </button>
                </div>

                {/* Current Photos List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white/90">Foto Attuali ({settings.photos.length})</span>
                    <button
                      type="button"
                      onClick={handleResetPhotos}
                      className="text-[10px] text-cyan-300 hover:underline"
                    >
                      Ripristina Default
                    </button>
                  </div>

                  <div className="space-y-2">
                    {settings.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] border border-white/10 group hover:border-cyan-400/40 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={photo.url}
                            alt={photo.title}
                            className="w-10 h-10 rounded-lg object-cover border border-white/20"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-white text-[11px] truncate">{photo.title}</div>
                            {photo.subtitle && (
                              <div className="text-[10px] text-white/50 truncate italic">{photo.subtitle}</div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(photo.id)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: DEDICA */}
            {activeTab === 'text' && (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold text-white/90">Testo di Auguri</label>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings((prev) => ({ ...prev, showGreeting: !prev.showGreeting }))
                      }
                      className="text-[11px] text-cyan-300 hover:underline flex items-center gap-1"
                    >
                      {settings.showGreeting ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{settings.showGreeting ? 'Visibile' : 'Nascosto'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={settings.greetingText}
                    onChange={(e) =>
                      onUpdateSettings((prev) => ({ ...prev, greetingText: e.target.value }))
                    }
                    placeholder="es. Merry Christmas, Buon Natale Chiara ❤️"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 focus:bg-white/[0.08] transition-all"
                  />
                </div>

                {/* Quick Dedication Presets */}
                <div>
                  <label className="block font-semibold text-white/90 mb-2">Frasi Pronte Rapide</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Merry Christmas',
                      'Buon Natale Chiara ❤️',
                      'Per Te Chiara ✨',
                      'Ti Amo Chiara 💖',
                      'Buone Feste e Felice Anno Nuovo 🎄',
                      'Joy & Magic 🌟',
                    ].map((phrase) => (
                      <button
                        key={phrase}
                        type="button"
                        onClick={() =>
                          onUpdateSettings((prev) => ({ ...prev, greetingText: phrase, showGreeting: true }))
                        }
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/15 text-[11px] text-white/80 transition-all"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Selector */}
                <div>
                  <label className="block font-semibold text-white/90 mb-2">Stile Carattere</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cursive' as GreetingFont, name: 'Cursive Romantico' },
                      { id: 'serif' as GreetingFont, name: 'Serif Elegante' },
                      { id: 'cinzel' as GreetingFont, name: 'Classico Maestoso' },
                    ].map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() =>
                          onUpdateSettings((prev) => ({ ...prev, greetingFont: font.id }))
                        }
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          settings.greetingFont === font.id
                            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 font-bold'
                            : 'bg-white/[0.03] border-white/10 text-white/70 hover:bg-white/[0.07]'
                        }`}
                      >
                        <span className="block text-[11px]">{font.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: TEMI DI COLORE */}
            {activeTab === 'theme' && (
              <div className="space-y-3">
                <label className="block font-semibold text-white/90 mb-1">Seleziona Palette</label>
                {themesList.map((t) => {
                  const isSelected = settings.themeId === t.id;
                  const previewPalette = t.treePalette
                    ? [...t.treePalette, ...t.palette.slice(0, 2)]
                    : t.palette;
                  return (
                    <div
                      key={t.id}
                      onClick={() =>
                        onUpdateSettings((prev) => ({ ...prev, themeId: t.id as ThemeId }))
                      }
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.08] border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.25)]'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`font-semibold ${isSelected ? 'text-cyan-300' : 'text-white'}`}>
                          {t.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 px-2 py-0.5 rounded-full font-bold">
                            Attivo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 mb-2.5">{t.tagline}</p>
                      {/* Color dots preview */}
                      <div className="flex items-center gap-1.5">
                        {previewPalette.map((rgb, idx) => (
                          <span
                            key={idx}
                            className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                            style={{
                              backgroundColor: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB: EFFETTI & CONTROLLI 3D */}
            {activeTab === 'effects' && (
              <div className="space-y-5">
                {/* Sliders */}
                <div className="space-y-4">
                  {/* Point count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Particelle Albero</span>
                      <span className="font-mono text-cyan-300">{settings.totalPoints}</span>
                    </div>
                    <input
                      type="range"
                      min={3000}
                      max={12000}
                      step={300}
                      value={settings.totalPoints}
                      onChange={(e) =>
                        onUpdateSettings((prev) => ({
                          ...prev,
                          totalPoints: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Rotation Speed */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Velocità di Rotazione</span>
                      <span className="font-mono text-cyan-300">{settings.rotationSpeed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1.0}
                      step={0.05}
                      value={settings.rotationSpeed}
                      onChange={(e) =>
                        onUpdateSettings((prev) => ({
                          ...prev,
                          rotationSpeed: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Petals / Snow count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Petali / Fiocchi Fluttuanti</span>
                      <span className="font-mono text-cyan-300">{settings.petalCount}</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={200}
                      step={10}
                      value={settings.petalCount}
                      onChange={(e) =>
                        onUpdateSettings((prev) => ({
                          ...prev,
                          petalCount: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>

                  {/* Meteors count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Frequenza Stelle Cadenti</span>
                      <span className="font-mono text-cyan-300">{settings.meteorCount}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={settings.meteorCount}
                      onChange={(e) =>
                        onUpdateSettings((prev) => ({
                          ...prev,
                          meteorCount: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="pt-2 border-t border-white/10 space-y-2.5">
                  <span className="block font-semibold text-white/90 mb-2">Elementi della Scena</span>

                  {[
                    { key: 'autoRotate', label: 'Rotazione Automatica' },
                    { key: 'interactiveRotation', label: 'Rotazione Interattiva (Trascina 3D)' },
                    { key: 'breatheEffect', label: 'Respiro & Battito Luminoso' },
                    { key: 'showStar', label: 'Stella Splendente in Cima' },
                    { key: 'showPetals', label: 'Petali e Neve Cadente' },
                    { key: 'showMeteors', label: 'Stelle Cadenti' },
                    { key: 'showGroundGlow', label: 'Aura Luminosa a Terra' },
                    { key: 'showOrbits', label: 'Polvere di Fata Orbitante' },
                  ].map((item) => {
                    const isChecked = !!settings[item.key as keyof TreeSettings];
                    return (
                      <label
                        key={item.key}
                        className="flex items-center justify-between p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer"
                      >
                        <span className="text-white/80 text-[11px]">{item.label}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            onUpdateSettings((prev) => ({
                              ...prev,
                              [item.key]: e.target.checked,
                            }))
                          }
                          className="w-4 h-4 rounded accent-cyan-400"
                        />
                      </label>
                    );
                  })}
                </div>

                {/* Camera Reset */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => canvasRef.current?.resetCamera()}
                    className="w-full py-2.5 rounded-xl bg-white/5 border border-white/15 text-white/80 hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 transition-all"
                  >
                    <RotateCcw size={14} />
                    <span>Reimposta Orientamento Telecamera</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-4 border-t border-white/10 bg-black/20 text-center text-[10px] text-white/40">
            Merry Christmas 3D • Hand Gesture &amp; Photo Memories
          </div>
        </aside>
      )}
    </>
  );
});
