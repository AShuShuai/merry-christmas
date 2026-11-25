/**
 * Web Audio API Synthesizer for crystal Christmas music box chimes.
 * Requires 0 external audio files and works offline seamlessly.
 */

class ChimeAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlayingLoop: boolean = false;
  private loopTimer: number | null = null;
  private currentNoteIndex: number = 0;

  // Gentle Christmas pentatonic arpeggio (C Major / A Minor celestial tones in Hz)
  private melody: number[] = [
    523.25, // C5
    659.25, // E5
    783.99, // G5
    987.77, // B5
    1046.50, // C6
    880.00, // A5
    783.99, // G5
    659.25, // E5
    587.33, // D5
    523.25, // C5
    783.99, // G5
    1046.50, // C6
  ];

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Plays a crystal bell chime tone with harmonics and reverb decay
   */
  public playChime(freq: number = 880, gainValue: number = 0.12) {
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Master gain for this note
      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(gainValue, now);
      masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      masterGain.connect(this.ctx.destination);

      // Fundamental tone (Sine wave)
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, now);
      osc1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 1.8);

      // Overtone 1 (Harmonic crystal chime)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq * 2.76, now); // Metallic celestial overtone
      gain2.gain.setValueAtTime(gainValue * 0.35, now);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.9);

      // Overtone 2 (High sparkle shimmer)
      const osc3 = this.ctx.createOscillator();
      const gain3 = this.ctx.createGain();
      osc3.type = 'triangle';
      osc3.frequency.setValueAtTime(freq * 5.4, now);
      gain3.gain.setValueAtTime(gainValue * 0.15, now);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc3.connect(gain3);
      gain3.connect(this.ctx.destination);
      osc3.start(now);
      osc3.stop(now + 0.45);
    } catch {
      // Audio autoplay policy catch
    }
  }

  /**
   * Toggle background gentle music box melody
   */
  public setLoop(enable: boolean) {
    if (enable === this.isPlayingLoop) return;
    this.isPlayingLoop = enable;

    if (enable) {
      this.initContext();
      this.stepLoop();
    } else {
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
    }
  }

  private stepLoop = () => {
    if (!this.isPlayingLoop) return;

    const note = this.melody[this.currentNoteIndex];
    this.playChime(note, 0.08);

    this.currentNoteIndex = (this.currentNoteIndex + 1) % this.melody.length;

    // Rhythmic variation like a delicate music box
    const delay = (this.currentNoteIndex % 4 === 0) ? 900 : 450;
    this.loopTimer = window.setTimeout(this.stepLoop, delay);
  };
}

export const chimeAudio = new ChimeAudioEngine();
