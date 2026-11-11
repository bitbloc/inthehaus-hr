// Web Audio API Synthesizer (Zero external asset dependencies, works offline & in LINE LIFF)
class SoundFX {
  constructor() {
    this.ctx = null;
  }

  getContext() {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 1. Tactile Braun mechanical punch button click
  playTactileClick() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.04);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // AudioContext fallback
    }
  }

  // 2. Crisp water drop & ice cube clink in cold water
  playWaterDrop() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // Resonant water 'plink / bloop'
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(1450, now + 0.09);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);

      // High glass clink overtone
      const clinkOsc = ctx.createOscillator();
      const clinkGain = ctx.createGain();
      clinkOsc.type = 'sine';
      clinkOsc.frequency.setValueAtTime(2300, now + 0.02);
      clinkOsc.frequency.exponentialRampToValueAtTime(2600, now + 0.07);

      clinkGain.gain.setValueAtTime(0.18, now + 0.02);
      clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      clinkOsc.connect(clinkGain);
      clinkGain.connect(ctx.destination);

      clinkOsc.start(now + 0.02);
      clinkOsc.stop(now + 0.16);
    } catch {
      // AudioContext fallback
    }
  }

  // 3. Pleasant chord chime on punch completion
  playSuccessChime() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, i) => { // C5, E5, G5 chord
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);

        gain.gain.setValueAtTime(0.2, now + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.35);
      });
    } catch {
      // AudioContext fallback
    }
  }

  // Safe Haptic feedback for touch devices
  triggerHaptic(pattern = [15, 30, 15]) {
    if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      try {
        window.navigator.vibrate(pattern);
      } catch {
        // Vibration not supported
      }
    }
  }
}

export const sfx = new SoundFX();

