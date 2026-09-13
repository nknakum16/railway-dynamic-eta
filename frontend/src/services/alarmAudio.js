/**
 * Web Audio API synthesizer for Station Arrival Alarms.
 * Uses native browser audio context to generate loud, unmistakable
 * chime & alarm tones without requiring external mp3 assets.
 */

class AlarmService {
  constructor() {
    this.audioCtx = null;
    this.timerId = null;
    this.active = false;
  }

  initContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  playTone(freq, startTime, duration, type = "sine", gainLevel = 0.25) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      // Envelope: gentle attack, sustain, gentle decay
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(gainLevel, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {
      console.warn("Audio error playing tone:", e);
    }
  }

  playIndianRailwaysChime() {
    this.initContext();
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    // Classic 4-note railway chime (e.g. F4, A4, C5, F5 chime)
    const notes = [349.23, 440.0, 523.25, 698.46];
    notes.forEach((freq, idx) => {
      this.playTone(freq, now + idx * 0.22, 0.4, "sine", 0.35);
    });

    // Also buzz/vibrate if supported on device
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate([400, 150, 400, 150, 600]);
      } catch {
        // Ignore vibration errors
      }
    }
  }

  startContinuousAlarm() {
    if (this.active) return;
    this.active = true;
    this.initContext();

    this.playIndianRailwaysChime();
    this.timerId = setInterval(() => {
      if (this.active) {
        this.playIndianRailwaysChime();
      }
    }, 2000);
  }

  stopAlarm() {
    this.active = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore vibration cancel error
      }
    }
  }

  isPlaying() {
    return this.active;
  }
}

export const alarmService = new AlarmService();
export default alarmService;
