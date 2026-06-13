class AudioController {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private playTone(
    frequency: number,
    type: OscillatorType,
    duration: number,
    volume: number = 0.1,
    frequencySlideTo?: number
  ) {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      if (frequencySlideTo) {
        osc.frequency.exponentialRampToValueAtTime(frequencySlideTo, ctx.currentTime + duration);
      }

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      // Ignore audio errors (e.g. user hasn't interacted with page yet)
    }
  }

  private playComplexTone(
    frequencies: number[],
    type: OscillatorType,
    duration: number,
    volume: number = 0.1,
    filterFreq?: number
  ) {
      if (!this.enabled) return;
      try {
        const ctx = this.getContext();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        
        // Add lowpass filter if requested
        let outputNode: AudioNode = gain;
        if (filterFreq) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(Math.max(filterFreq * 0.1, 20), ctx.currentTime + duration);
            gain.connect(filter);
            outputNode = filter;
        }

        outputNode.connect(ctx.destination);

        frequencies.forEach(freq => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            osc.connect(gain);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        });
      } catch (e) { }
  }

  playCorrect() {
    // A nice sparkly major third ping
    this.playTone(523.25, 'sine', 0.15, 0.08); 
    setTimeout(() => this.playComplexTone([659.25, 1318.51], 'sine', 0.5, 0.08), 80); 
  }

  playIncorrect() {
    // Subtle low thud/buzz with filter
    this.playComplexTone([150, 155], 'sawtooth', 0.3, 0.06, 400);
    setTimeout(() => this.playComplexTone([100, 103], 'square', 0.4, 0.06, 200), 120);
  }

  playTick() {
    // Very subtle high tick
    this.playTone(1200, 'sine', 0.03, 0.01, 800);
  }

  playStart() {
    // A quick rising whoosh/chime to get ready
    this.playTone(300, 'sine', 0.4, 0.05, 800);
    setTimeout(() => this.playTone(600, 'sine', 0.3, 0.05, 1200), 100);
    setTimeout(() => this.playComplexTone([800, 1600], 'sine', 0.6, 0.06), 200);
  }

  playEnd() {
    // Triumphant ending chord arpeggio
    this.playTone(440, 'triangle', 0.15, 0.08); // A4
    setTimeout(() => this.playTone(554.37, 'triangle', 0.15, 0.08), 100); // C#5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.15, 0.08), 200); // E5
    setTimeout(() => this.playComplexTone([880, 1760], 'sine', 1.0, 0.1), 300); // A5 big resolve
  }
}

export const audio = new AudioController();
