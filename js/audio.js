/* Tiny procedural audio engine: synth SFX + adaptive arp loop. */
(function () {
  "use strict";

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfx = null;
      this.music = null;
      this.delay = null;
      this.delaySend = null;
      this.noiseBuf = null;
      this.muted = false;
      this.musicRunning = false;
      this.musicTimer = null;
      this.step = 0;
      this.nextStepTime = 0;
      this.bpm = 94;
      this.intensity = 1;
      this.ducked = false;
      this.tempoJitter = 0;
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        const ctx = new AC();
        this.ctx = ctx;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 18;
        comp.ratio.value = 5;
        comp.attack.value = 0.004;
        comp.release.value = 0.22;
        comp.connect(ctx.destination);

        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.62;
        this.master.connect(comp);

        this.sfx = ctx.createGain();
        this.sfx.gain.value = 0.95;
        this.sfx.connect(this.master);

        this.music = ctx.createGain();
        this.music.gain.value = 0.34;
        this.music.connect(this.master);

        this.delay = ctx.createDelay(0.8);
        this.delay.delayTime.value = 0.27;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        this.delay.connect(fb);
        fb.connect(this.delay);
        const wet = ctx.createGain();
        wet.gain.value = 0.5;
        this.delay.connect(wet);
        wet.connect(this.music);

        this.noiseBuf = this._makeNoise(2.0);
        return true;
      } catch (err) {
        console.warn("Audio unavailable", err);
        return false;
      }
    }

    _makeNoise(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(muted ? 0 : 0.62, this.ctx.currentTime + 0.08);
      }
    }

    duck(on) {
      this.ducked = on;
      if (this.music && this.ctx) {
        const t = this.ctx.currentTime;
        this.music.gain.cancelScheduledValues(t);
        this.music.gain.linearRampToValueAtTime(on ? 0.1 : 0.34, t + 0.25);
      }
    }

    tone(opts) {
      const ctx = this.ctx;
      if (!ctx || this.muted) return;
      const {
        f0 = 440,
        f1 = f0,
        type = "sine",
        dur = 0.15,
        vol = 0.08,
        attack = 0.006,
        dest = null,
        slide = "exp",
        send = 0,
      } = opts;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1 !== f0) {
        if (slide === "exp") {
          osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        } else {
          osc.frequency.linearRampToValueAtTime(Math.max(20, f1), t + dur);
        }
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(dest || this.sfx);
      if (send > 0 && this.delay) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s);
        s.connect(this.delay);
      }
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    noise(opts) {
      const ctx = this.ctx;
      if (!ctx || this.muted || !this.noiseBuf) return;
      const {
        dur = 0.15,
        vol = 0.08,
        type = "bandpass",
        f0 = 1200,
        f1 = f0,
        q = 1,
        attack = 0.002,
        dest = null,
      } = opts;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = type;
      filt.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      filt.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(dest || this.sfx);
      src.start(t, Math.random() * 1.5);
      src.stop(t + dur + 0.05);
    }

    seq(notes, spacing, opts) {
      if (!this.ctx || this.muted) return;
      const ctx = this.ctx;
      const base = ctx.currentTime + 0.01;
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = base + i * spacing;
        osc.type = opts.type || "triangle";
        osc.frequency.value = f;
        const dur = opts.dur || 0.16;
        const vol = (opts.vol || 0.06) * (1 - i * 0.05);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g);
        g.connect(this.sfx);
        if (opts.send) {
          const s = ctx.createGain();
          s.gain.value = opts.send;
          g.connect(s);
          s.connect(this.delay);
        }
        osc.start(t);
        osc.stop(t + dur + 0.05);
      });
    }

    /* ---------------------------------------------------------- SFX */

    jump() {
      this.tone({ f0: 240, f1: 560, type: "triangle", dur: 0.14, vol: 0.1 });
      this.noise({ dur: 0.09, vol: 0.025, f0: 900, f1: 2000 });
    }

    doubleJump() {
      this.tone({ f0: 360, f1: 820, type: "square", dur: 0.15, vol: 0.055 });
      this.tone({ f0: 720, f1: 1320, type: "triangle", dur: 0.2, vol: 0.06, send: 0.3 });
    }

    land(hard) {
      this.noise({ dur: 0.1, vol: hard ? 0.1 : 0.05, type: "lowpass", f0: 700, f1: 220 });
      this.tone({ f0: 110, f1: 55, type: "sine", dur: 0.12, vol: hard ? 0.11 : 0.06 });
    }

    slash() {
      this.noise({ dur: 0.16, vol: 0.09, type: "highpass", f0: 700, f1: 3200, q: 0.7 });
      this.tone({ f0: 1100, f1: 240, type: "sawtooth", dur: 0.13, vol: 0.035 });
    }

    hitEnemy() {
      this.noise({ dur: 0.1, vol: 0.1, type: "bandpass", f0: 1200, f1: 400, q: 0.8 });
      this.tone({ f0: 320, f1: 110, type: "square", dur: 0.1, vol: 0.045 });
    }

    parrySwing() {
      this.tone({ f0: 240, f1: 900, type: "sine", dur: 0.09, vol: 0.035 });
    }

    parry() {
      this.tone({ f0: 1320, f1: 1320, type: "triangle", dur: 0.5, vol: 0.07, send: 0.65 });
      this.tone({ f0: 1980, f1: 1760, type: "sine", dur: 0.42, vol: 0.045, send: 0.7 });
      this.noise({ dur: 0.2, vol: 0.05, type: "highpass", f0: 3500, f1: 6000 });
    }

    parryFail() {
      this.tone({ f0: 170, f1: 90, type: "square", dur: 0.1, vol: 0.035 });
    }

    hurt() {
      this.tone({ f0: 150, f1: 48, type: "sawtooth", dur: 0.32, vol: 0.14 });
      this.noise({ dur: 0.25, vol: 0.1, type: "lowpass", f0: 900, f1: 160 });
    }

    block() {
      this.tone({ f0: 740, f1: 520, type: "triangle", dur: 0.28, vol: 0.08, send: 0.4 });
      this.noise({ dur: 0.12, vol: 0.05, type: "bandpass", f0: 2600, f1: 1400, q: 2 });
    }

    shieldBreak() {
      this.noise({ dur: 0.35, vol: 0.1, type: "highpass", f0: 2800, f1: 500 });
      this.tone({ f0: 540, f1: 120, type: "sawtooth", dur: 0.4, vol: 0.06 });
    }

    ember(combo) {
      const f = 780 + Math.min(combo, 18) * 34;
      this.tone({ f0: f, f1: f * 1.35, type: "sine", dur: 0.1, vol: 0.045 });
    }

    perk() {
      this.seq([523, 659, 784, 1046], 0.07, { type: "triangle", vol: 0.075, dur: 0.24, send: 0.5 });
      this.noise({ dur: 0.3, vol: 0.03, type: "highpass", f0: 4000, f1: 8000 });
    }

    heal() {
      this.seq([392, 523, 659], 0.08, { type: "sine", vol: 0.07, dur: 0.3, send: 0.3 });
    }

    levelUp() {
      this.seq([220, 330, 440, 554, 659, 880], 0.055, { type: "triangle", vol: 0.065, dur: 0.4, send: 0.35 });
      this.tone({ f0: 90, f1: 60, type: "sine", dur: 0.4, vol: 0.1 });
    }

    surge() {
      this.noise({ dur: 0.5, vol: 0.08, type: "bandpass", f0: 300, f1: 1800, q: 0.9 });
      this.tone({ f0: 160, f1: 240, type: "sawtooth", dur: 0.4, vol: 0.05 });
    }

    nearMiss() {
      this.noise({ dur: 0.12, vol: 0.03, type: "bandpass", f0: 1600, f1: 500, q: 1.4 });
    }

    gameOver() {
      this.seq([392, 330, 262, 196, 131], 0.16, { type: "triangle", vol: 0.085, dur: 0.6, send: 0.4 });
      this.noise({ dur: 0.7, vol: 0.05, type: "lowpass", f0: 800, f1: 120 });
    }

    start() {
      this.tone({ f0: 90, f1: 300, type: "sawtooth", dur: 0.5, vol: 0.05 });
      this.seq([330, 440, 554, 659], 0.09, { type: "triangle", vol: 0.06, dur: 0.35, send: 0.4 });
    }

    ui() {
      this.tone({ f0: 620, f1: 820, type: "square", dur: 0.06, vol: 0.025 });
    }

    record() {
      this.seq([880, 1108, 1320, 1760], 0.08, { type: "sine", vol: 0.05, dur: 0.3, send: 0.6 });
    }

    /* -------------------------------------------------------- Music */

    setIntensity(level) {
      this.intensity = Math.max(1, Math.min(20, level));
      this.bpm = 92 + this.intensity * 3.2;
    }

    startMusic() {
      if (!this.ensure()) return;
      if (this.musicRunning) return;
      this.musicRunning = true;
      this.step = 0;
      this.nextStepTime = this.ctx.currentTime + 0.12;
      this.musicTimer = window.setInterval(() => this._schedule(), 32);
    }

    stopMusic() {
      this.musicRunning = false;
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
    }

    _schedule() {
      if (!this.musicRunning || !this.ctx) return;
      const ctx = this.ctx;
      const stepDur = 60 / (this.bpm || 100) / 4;
      while (this.nextStepTime < ctx.currentTime + 0.18) {
        this._playStep(this.step, this.nextStepTime, stepDur);
        this.nextStepTime += stepDur;
        this.step++;
      }
    }

    _note(freq, time, dur, type, vol, dest, send) {
      const ctx = this.ctx;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(dest || this.music);
      if (send) {
        const s = ctx.createGain();
        s.gain.value = send;
        g.connect(s);
        s.connect(this.delay);
      }
      osc.start(time);
      osc.stop(time + dur + 0.05);
    }

    _drum(type, time) {
      const ctx = this.ctx;
      if (!ctx) return;
      if (type === "kick") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(130, time);
        osc.frequency.exponentialRampToValueAtTime(43, time + 0.12);
        g.gain.setValueAtTime(0.11, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
        osc.connect(g);
        g.connect(this.music);
        osc.start(time);
        osc.stop(time + 0.18);
        return;
      }
      if (!this.noiseBuf) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      if (type === "hat") {
        f.type = "highpass";
        f.frequency.value = 7000;
        g.gain.setValueAtTime(0.016, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
      } else {
        f.type = "bandpass";
        f.frequency.value = 1900;
        f.Q.value = 0.7;
        g.gain.setValueAtTime(0.045, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      }
      src.connect(f);
      f.connect(g);
      g.connect(this.music);
      src.start(time, Math.random() * 1.4);
      src.stop(time + 0.14);
    }

    _playStep(step, time, stepDur) {
      if (this.muted) return;
      const s = step % 16;
      const bar = Math.floor(step / 16);
      const roots = [110, 87.31, 130.81, 98];
      const root = roots[bar % 4];
      if (s % 4 === 0) this._drum("kick", time);
      if (s === 4 || s === 12) this._drum("snare", time);
      if (s % 2 === 0) this._drum("hat", time);
      if (s === 0 || s === 6 || s === 8 || s === 14) {
        this._note(root, time, 0.22, "triangle", 0.065, this.music);
      }
      const scale = [0, 3, 5, 7, 10, 12, 10, 7];
      if (s % 2 === 0) {
        const oct = this.intensity > 6 && s % 8 === 0 ? 2 : 1;
        const semi = scale[(step + bar) % scale.length];
        const freq = 220 * Math.pow(2, semi / 12) * oct;
        this._note(freq, time, 0.16, "triangle", 0.012 + this.intensity * 0.0012, this.music, 0.4);
      }
      if (s === 0 && bar % 2 === 0) {
        [root * 2, root * 2.378, root * 3].forEach((f, i) => {
          this._note(f, time + i * 0.01, 1.5, "sine", 0.018, this.music, 0.3);
        });
      }
      if (this.intensity >= 8 && (s === 3 || s === 11) && Math.random() < 0.5) {
        this._note(root * 4, time, 0.08, "square", 0.009, this.music, 0.5);
      }
    }
  }

  window.Sound = new SoundEngine();
})();
