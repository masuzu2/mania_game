(function () {
  class HitSound {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.volume = 0.5; 
    }

    
    ensureContext() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      
      if (window.HitsoundLoader) window.HitsoundLoader.unlock();
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
    }

    setEnabled(v) {
      this.enabled = v;
    }

        playTap() {
      if (!this.enabled) return;
      
      if (window.HitsoundLoader && window.HitsoundLoader.playN(this.volume)) return;
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1400, t0);
      osc.frequency.exponentialRampToValueAtTime(600, t0 + 0.035);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.5, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.06);
    }

        playHoldStart() {
      if (!this.enabled) return;
      
      if (window.HitsoundLoader && window.HitsoundLoader.playLN(this.volume)) return;
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, t0);
      osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.04);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.48, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    }

        playHoldEnd() {
      if (!this.enabled) return;
      
      if (window.HitsoundLoader && window.HitsoundLoader.playLN(this.volume)) return;
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1000, t0);
      osc.frequency.exponentialRampToValueAtTime(1600, t0 + 0.04);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.42, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.08);
    }

        playMiss() {
      if (!this.enabled) return;
      
      if (window.HitsoundLoader && window.HitsoundLoader.playMiss(this.volume)) return;
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t0);
      osc.frequency.exponentialRampToValueAtTime(80, t0 + 0.12);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(this.volume * 0.35, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    }
  }

  window.HitSound = HitSound;
})();

