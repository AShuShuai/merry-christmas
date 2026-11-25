import React from 'react';
import { X, Heart, Sparkles } from 'lucide-react';
import { MemoryPhoto } from '../types';

interface Props {
  photo: MemoryPhoto | null;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<Props> = ({ photo, onClose }) => {
  if (!photo) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-lg w-full bg-gradient-to-b from-slate-900/95 via-[#0c1427]/95 to-slate-900/95 rounded-3xl p-5 sm:p-6 border-2 border-cyan-400/50 shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_50px_rgba(0,240,255,0.35)] animate-scale-up"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-cyan-500 text-slate-950 font-bold flex items-center justify-center shadow-lg hover:bg-cyan-400 hover:scale-110 transition-all cursor-pointer z-10"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* Polaroid Style Photo Frame */}
        <div className="relative rounded-2xl overflow-hidden bg-white p-2.5 pb-4 shadow-2xl border border-white/20">
          <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-950">
            <img
              src={photo.url}
              alt={photo.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Polaroid Title & Caption */}
          <div className="pt-3 px-1.5 text-center">
            <h3 className="font-display text-lg sm:text-xl font-bold text-slate-900 flex items-center justify-center gap-1.5">
              <span>{photo.title}</span>
              <Heart size={16} className="text-pink-500 fill-pink-500 inline-block animate-pulse" />
            </h3>
            {photo.subtitle && (
              <p className="text-xs sm:text-sm text-slate-600 mt-1 italic font-serif">
                "{photo.subtitle}"
              </p>
            )}
          </div>
        </div>

        {/* Holiday Dedication Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-cyan-200">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-cyan-400" />
            <span>Ricordo di Natale per Chiara</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/35 border border-cyan-400/40 text-cyan-200 font-semibold transition-all text-xs"
          >
            Chiudi Ricordo
          </button>
        </div>
      </div>
    </div>
  );
};
