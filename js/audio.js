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
      this.bpm = 114;
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
        this.music.gain.value = 0.46;
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
        this.music.gain.linearRampToValueAtTime(on ? 0.12 : 0.46, t + 0.25);
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

    growl() {
      this.tone({ f0: 120, f1: 62, type: "sawtooth", dur: 0.3, vol: 0.055 });
      this.noise({ dur: 0.32, vol: 0.05, type: "lowpass", f0: 520, f1: 130, q: 0.8 });
    }

    spit() {
      this.tone({ f0: 620, f1: 190, type: "sawtooth", dur: 0.16, vol: 0.035 });
      this.noise({ dur: 0.12, vol: 0.035, type: "bandpass", f0: 900, f1: 2200, q: 1.2 });
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
      this.bpm = 112 + this.intensity * 1.6;
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

    _noiseHit(time, freq, q, vol, dur) {
      const ctx = this.ctx;
      if (!ctx || !this.noiseBuf) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = freq > 5000 ? "highpass" : "bandpass";
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.music);
      src.start(time, Math.random() * 1.4);
      src.stop(time + dur + 0.02);
    }

    _drum(type, time) {
      const ctx = this.ctx;
      if (!ctx) return;
      if (type === "kick") {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(145, time);
        osc.frequency.exponentialRampToValueAtTime(41, time + 0.13);
        g.gain.setValueAtTime(0.16, time);
        g.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
        osc.connect(g);
        g.connect(this.music);
        osc.start(time);
        osc.stop(time + 0.21);
        return;
      }
      if (type === "clap") {
        for (let i = 0; i < 3; i++) this._noiseHit(time + i * 0.013, 1300, 1.1, 0.017, 0.055);
        return;
      }
      if (type === "hat") {
        this._noiseHit(time, 7600, 0.8, 0.019, 0.035);
        return;
      }
      if (type === "openhat") {
        this._noiseHit(time, 6200, 0.7, 0.021, 0.17);
        return;
      }
      this._noiseHit(time, 1900, 0.7, 0.055, 0.12);
    }

    _bass(freq, time, dur, vol) {
      const ctx = this.ctx;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, time);
      sub.type = "sine";
      sub.frequency.setValueAtTime(freq / 2, time);
      filt.type = "lowpass";
      filt.Q.value = 4;
      filt.frequency.setValueAtTime(880, time);
      filt.frequency.exponentialRampToValueAtTime(190, time + dur);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(filt);
      filt.connect(g);
      sub.connect(g);
      g.connect(this.music);
      osc.start(time);
      sub.start(time);
      osc.stop(time + dur + 0.03);
      sub.stop(time + dur + 0.03);
    }

    _pad(freq, time, dur, vol) {
      const ctx = this.ctx;
      if (!ctx) return;
      for (const det of [-7, 7]) {
        const osc = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(det, time);
        filt.type = "lowpass";
        filt.frequency.setValueAtTime(1100, time);
        filt.frequency.linearRampToValueAtTime(700, time + dur);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(vol, time + 0.45);
        g.gain.setValueAtTime(vol, time + dur - 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.music);
        osc.start(time);
        osc.stop(time + dur + 0.05);
      }
    }

    _lead(freq, time, dur, vol) {
      const ctx = this.ctx;
      if (!ctx) return;
      for (const det of [-8, 8]) {
        const osc = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(det, time);
        filt.type = "lowpass";
        filt.frequency.setValueAtTime(3000, time);
        filt.frequency.exponentialRampToValueAtTime(1200, time + dur);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(vol, time + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(filt);
        filt.connect(g);
        g.connect(this.music);
        const send = ctx.createGain();
        send.gain.value = 0.32;
        g.connect(send);
        send.connect(this.delay);
        osc.start(time);
        osc.stop(time + dur + 0.04);
      }
    }

    _riser(time, stepDur) {
      const ctx = this.ctx;
      if (!ctx) return;
      const dur = stepDur * 2.6;
      this._noiseSweep(time, dur, 700, 5600, 0.028);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(720, time + dur);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.018, time + dur * 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(g);
      g.connect(this.music);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    }

    _noiseSweep(time, dur, f0, f1, vol) {
      const ctx = this.ctx;
      if (!ctx || !this.noiseBuf) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.setValueAtTime(f0, time);
      f.frequency.exponentialRampToValueAtTime(f1, time + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(vol, time + dur * 0.85);
      g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.music);
      src.start(time, Math.random() * 1.2);
      src.stop(time + dur + 0.03);
    }

    _playStep(step, time, stepDur) {
      if (this.muted) return;
      const s = step % 16;
      const bar = Math.floor(step / 16);
      const prog = [
        { root: 55.0, chord: [220.0, 261.63, 329.63, 440.0] }, // Am
        { root: 43.65, chord: [174.61, 220.0, 261.63, 349.23] }, // F
        { root: 65.41, chord: [261.63, 329.63, 392.0, 523.25] }, // C
        { root: 49.0, chord: [196.0, 246.94, 293.66, 392.0] }, // G
      ];
      const part = prog[bar % 4];

      // four-on-the-floor with a ghost kick before the turnaround
      if (s % 4 === 0) this._drum("kick", time);
      if (s === 4 || s === 12) {
        this._drum("snare", time);
        this._drum("clap", time);
      }
      if (s % 2 === 0) this._drum(s === 6 || s === 14 ? "openhat" : "hat", time);
      if (s === 14 && bar % 2 === 1) this._drum("kick", time + stepDur * 0.5);

      // offbeat saw bass
      if (s % 2 === 0) {
        const pattern = [0, 0, 12, 0, 7, 0, 12, 7];
        const semi = pattern[(s / 2) % 8];
        this._bass(part.root * 2 * Math.pow(2, semi / 12), time, stepDur * 1.6, 0.062);
      }

      // sustained chord pads
      if (s === 0) {
        for (let i = 0; i < 3; i++) this._pad(part.chord[i], time, stepDur * 15.5, 0.013);
      }

      // 16th-note arpeggio
      const arp = [0, 2, 1, 3, 0, 2, 1, 2, 0, 3, 1, 2, 0, 2, 3, 2];
      const note = part.chord[arp[s]];
      const oct = s % 8 === 6 ? 2 : 1;
      this._lead(note * 2 * oct, time, 0.11, 0.012 + this.intensity * 0.0011);

      // sparse melody hook
      if (bar % 2 === 0 && (s === 0 || s === 10)) {
        const idx = s === 0 ? bar % 4 : (bar + 2) % 4;
        this._lead(part.chord[idx] * 2, time, 0.42, 0.021);
      }

      // fill and riser into the next 4-bar phrase
      if (bar % 4 === 3 && s >= 12) this._drum("snare", time);
      if (bar % 4 === 3 && s === 14) this._riser(time, stepDur);
    }
  }

  window.Sound = new SoundEngine();
})();
