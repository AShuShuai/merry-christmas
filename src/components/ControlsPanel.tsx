import React, { useState } from 'react';
import {
  Sparkles,
  Palette,
  Type,
  Sliders,
  RotateCcw,
  Camera,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Eye,
  EyeOff,
  ChevronRight,
  ChevronLeft,
  Heart,
  Wand2,
} from 'lucide-react';
import { TreeSettings, ThemeId, GreetingFont } from '../types';
import { THEMES } from '../config/themes';
import { CanvasHandle } from './ChristmasTreeCanvas';

interface Props {
  settings: TreeSettings;
  onUpdateSettings: (updater: (prev: TreeSettings) => TreeSettings) => void;
  canvasRef: React.RefObject<CanvasHandle>;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleAudio: () => void;
}

export const ControlsPanel: React.FC<Props> = ({
  settings,
  onUpdateSettings,
  canvasRef,
  isFullscreen,
  onToggleFullscreen,
  onToggleAudio,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'text' | 'theme' | 'effects'>('text');

  const themesList = Object.values(THEMES);

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

        {/* Snapshot Button */}
        <button
          type="button"
          onClick={() => canvasRef.current?.takeSnapshot()}
          title="Scatta Foto HD dell'albero (PNG)"
          className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:bg-black/60 hover:border-white/30 transition-all duration-300 shadow-lg"
        >
          <Camera size={18} />
        </button>

        {/* Restart Intro Animation Button */}
        <button
          type="button"
          onClick={() => canvasRef.current?.restartIntro()}
          title="Riavvia Animazione Magica Iniziale"
          className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:bg-black/60 hover:border-white/30 transition-all duration-300 shadow-lg group"
        >
          <Wand2 size={18} className="group-hover:rotate-12 transition-transform" />
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Esci da Schermo Intero' : 'Schermo Intero'}
          className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/15 text-white/70 hover:text-white hover:bg-black/60 hover:border-white/30 transition-all duration-300 shadow-lg"
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>

        {/* Open/Close Settings Panel Button */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Personalizza Albero e Dedica"
          className={`px-4 py-2.5 rounded-full backdrop-blur-md border font-sans text-xs font-semibold flex items-center gap-2 transition-all duration-300 shadow-lg ${
            isOpen
              ? 'bg-pink-500/35 border-pink-400/60 text-white shadow-pink-500/30'
              : 'bg-black/45 border-white/20 text-white/90 hover:bg-black/65 hover:border-pink-400/50 hover:text-white'
          }`}
        >
          <Sparkles size={16} className="text-pink-300 animate-spin-slow" />
          <span>Personalizza</span>
          {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Interactive Helper Hint (Bottom Left) */}
      <div className="fixed bottom-4 left-4 z-40 pointer-events-none text-[11px] font-sans text-white/40 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 hidden sm:flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
        <span>Trascina con il mouse per ruotare in 3D • Clicca per scintillii luminosi</span>
      </div>

      {/* Settings Modal Drawer (Slide-in from Right) */}
      {isOpen && (
        <aside
          className="fixed top-0 right-0 h-full w-full sm:w-[420px] z-50 bg-[#0d0711]/92 backdrop-blur-xl border-l border-white/15 text-white flex flex-col shadow-2xl animate-slide-left font-sans"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-400/40 flex items-center justify-center text-pink-300">
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-wide flex items-center gap-1.5">
                  <span>Albero di Natale Magico</span>
                  <Heart size={14} className="text-pink-400 fill-pink-400" />
                </h2>
                <p className="text-[11px] text-white/50">Personalizza atmosfera, dedica e colori</p>
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
          <div className="grid grid-cols-3 p-2 bg-white/[0.03] border-b border-white/10 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'text'
                  ? 'bg-pink-500/20 text-pink-200 border border-pink-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Type size={14} />
              <span>Dedica</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('theme')}
              className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'theme'
                  ? 'bg-pink-500/20 text-pink-200 border border-pink-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Palette size={14} />
              <span>Temi</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('effects')}
              className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'effects'
                  ? 'bg-pink-500/20 text-pink-200 border border-pink-500/40 font-semibold'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <Sliders size={14} />
              <span>Effetti 3D</span>
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs custom-scrollbar">
            {/* TAB 1: DEDICA / GREETING TEXT */}
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
                      className="text-[11px] text-pink-300 hover:underline flex items-center gap-1"
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/15 text-white placeholder-white/30 focus:outline-none focus:border-pink-400 focus:bg-white/[0.08] transition-all"
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
                        className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:border-pink-400/50 hover:bg-pink-500/15 text-[11px] text-white/80 transition-all"
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
                            ? 'bg-pink-500/25 border-pink-400 text-pink-200 font-bold'
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

            {/* TAB 2: TEMI DI COLORE */}
            {activeTab === 'theme' && (
              <div className="space-y-3">
                <label className="block font-semibold text-white/90 mb-1">Seleziona Palette</label>
                {themesList.map((t) => {
                  const isSelected = settings.themeId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() =>
                        onUpdateSettings((prev) => ({ ...prev, themeId: t.id as ThemeId }))
                      }
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.08] border-pink-400 shadow-[0_0_20px_rgba(255,105,180,0.25)]'
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`font-semibold ${isSelected ? 'text-pink-300' : 'text-white'}`}>
                          {t.name}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] bg-pink-500/25 text-pink-200 border border-pink-400/40 px-2 py-0.5 rounded-full font-bold">
                            Attivo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 mb-2.5">{t.tagline}</p>
                      {/* Color dots preview */}
                      <div className="flex items-center gap-1.5">
                        {t.palette.map((rgb, idx) => (
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

            {/* TAB 3: EFFETTI & CONTROLLI 3D */}
            {activeTab === 'effects' && (
              <div className="space-y-5">
                {/* Sliders */}
                <div className="space-y-4">
                  {/* Point count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Particelle Albero</span>
                      <span className="font-mono text-pink-300">{settings.totalPoints}</span>
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
                      className="w-full accent-pink-400"
                    />
                  </div>

                  {/* Rotation Speed */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Velocità di Rotazione</span>
                      <span className="font-mono text-pink-300">{settings.rotationSpeed.toFixed(2)}x</span>
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
                      className="w-full accent-pink-400"
                    />
                  </div>

                  {/* Petals / Snow count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Petali / Fiocchi Fluttuanti</span>
                      <span className="font-mono text-pink-300">{settings.petalCount}</span>
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
                      className="w-full accent-pink-400"
                    />
                  </div>

                  {/* Meteors count */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-white/80">Frequenza Stelle Cadenti</span>
                      <span className="font-mono text-pink-300">{settings.meteorCount}</span>
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
                      className="w-full accent-pink-400"
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
                          className="w-4 h-4 rounded accent-pink-400"
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
            Merry Christmas 3D • React + TypeScript Engine
          </div>
        </aside>
      )}
    </>
  );
};
