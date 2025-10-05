class AudioToneManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private activeNodes: Set<AudioNode> = new Set();
    private toneIntervals: number[] = [];

    // Musical note frequencies (A4 = 440Hz reference)
    private readonly notes = {
        C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
        G4: 392.00, A4: 440.00, B4: 493.88,
        C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
        G5: 783.99, A5: 880.00, B5: 987.77
    };

    constructor() {
        if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);
            this.masterGain.gain.value = 0.25;
        }
    }

    private ensureAudioContext() {
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    private playMelodiousTone(
        frequency: number,
        duration: number,
        waveType: OscillatorType = 'sine',
        fadeIn: number = 0.05,
        fadeOut: number = 0.05
    ) {
        if (!this.audioContext || !this.masterGain) return;

        this.ensureAudioContext();

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = waveType;
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        const now = this.audioContext.currentTime;
        const durationSec = duration / 1000;

        // Smooth fade in/out envelope
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.6, now + fadeIn);
        gainNode.gain.linearRampToValueAtTime(0.6, now + durationSec - fadeOut);
        gainNode.gain.linearRampToValueAtTime(0, now + durationSec);

        oscillator.start(now);
        oscillator.stop(now + durationSec);

        this.activeNodes.add(oscillator);
        this.activeNodes.add(gainNode);

        setTimeout(() => {
            this.activeNodes.delete(oscillator);
            this.activeNodes.delete(gainNode);
        }, duration);
    }

    private playChord(frequencies: number[], duration: number, waveType: OscillatorType = 'sine') {
        frequencies.forEach(freq => {
            this.playMelodiousTone(freq, duration, waveType);
        });
    }

    /**
     * Play gentle calling melody (ascending major arpeggio)
     */
    playCallingTone() {
        this.stopAllTones();

        const melody = [this.notes.C5, this.notes.E5, this.notes.G5, this.notes.C5];
        let index = 0;

        const playNote = () => {
            this.playMelodiousTone(melody[index % melody.length], 400, 'sine', 0.03, 0.1);
            index++;
        };

        playNote();
        const interval = setInterval(playNote, 600);
        this.toneIntervals.push(interval);
    }

    /**
     * Play soothing ringtone (peaceful chord progression)
     */
    playRingtone() {
        this.stopAllTones();

        const chordProgression = [
            [this.notes.C4, this.notes.E4, this.notes.G4],  // C major
            [this.notes.A4, this.notes.C5, this.notes.E5],  // A minor
            [this.notes.F4, this.notes.A4, this.notes.C5],  // F major
            [this.notes.G4, this.notes.B4, this.notes.D5]   // G major
        ];

        let chordIndex = 0;

        const playNextChord = () => {
            this.playChord(chordProgression[chordIndex % chordProgression.length], 800, 'sine');
            chordIndex++;
        };

        playNextChord();
        const interval = setInterval(playNextChord, 1200);
        this.toneIntervals.push(interval);
    }

    /**
     * Play gentle end call melody (descending peaceful notes)
     */
    playEndCallTone() {
        this.stopAllTones();

        const melody = [
            { freq: this.notes.G5, delay: 0 },
            { freq: this.notes.E5, delay: 200 },
            { freq: this.notes.C5, delay: 400 },
            { freq: this.notes.G4, delay: 600 }
        ];

        melody.forEach(({ freq, delay }) => {
            setTimeout(() => {
                this.playMelodiousTone(freq, 300, 'sine', 0.02, 0.15);
            }, delay);
        });
    }

    /**
     * Play uplifting success melody
     */
    playSuccessTone() {
        const melody = [
            { freq: this.notes.C5, delay: 0 },
            { freq: this.notes.E5, delay: 100 },
            { freq: this.notes.G5, delay: 200 },
            { freq: this.notes.C5, delay: 300 }
        ];

        melody.forEach(({ freq, delay }) => {
            setTimeout(() => {
                this.playMelodiousTone(freq, 200, 'triangle', 0.02, 0.08);
            }, delay);
        });
    }

    /**
     * Play gentle error notification
     */
    playErrorTone() {
        const melody = [
            { freq: this.notes.E5, delay: 0 },
            { freq: this.notes.D5, delay: 150 },
            { freq: this.notes.C5, delay: 300 }
        ];

        melody.forEach(({ freq, delay }) => {
            setTimeout(() => {
                this.playMelodiousTone(freq, 250, 'sine', 0.03, 0.12);
            }, delay);
        });
    }

    /**
     * Play a calming notification chime
     */
    playNotificationChime() {
        this.playChord([this.notes.C5, this.notes.E5, this.notes.G5], 600, 'triangle');
    }

    /**
     * Play ambient meditation tone (sustained harmonious sound)
     */
    playMeditationTone() {
        this.stopAllTones();

        const baseFreq = this.notes.C4;
        const harmonics = [baseFreq, baseFreq * 1.5, baseFreq * 2, baseFreq * 3];

        harmonics.forEach((freq, i) => {
            this.playMelodiousTone(freq, 3000, 'sine', 0.5, 0.5);
        });
    }

    /**
     * Stop all currently playing tones
     */
    stopAllTones() {
        this.activeNodes.forEach(node => {
            try {
                if (node instanceof OscillatorNode) {
                    node.stop();
                }
                node.disconnect();
            } catch (e) {
                // Node may already be stopped
            }
        });
        this.activeNodes.clear();

        this.toneIntervals.forEach(interval => clearInterval(interval));
        this.toneIntervals = [];
    }

    /**
     * Set master volume (0.0 to 1.0)
     */
    setVolume(volume: number) {
        if (this.masterGain) {
            const clampedVolume = Math.max(0, Math.min(1, volume));
            const now = this.audioContext?.currentTime || 0;
            this.masterGain.gain.setTargetAtTime(clampedVolume, now, 0.1);
        }
    }

    /**
     * Resume audio context (required after user interaction)
     */
    resume() {
        if (this.audioContext?.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Cleanup and close audio context
     */
    destroy() {
        this.stopAllTones();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Singleton instance
let audioManager: AudioToneManager | null = null;

export const getAudioToneManager = (): AudioToneManager => {
    if (!audioManager) {
        audioManager = new AudioToneManager();
    }
    return audioManager;
};

export const destroyAudioToneManager = () => {
    if (audioManager) {
        audioManager.destroy();
        audioManager = null;
    }
};

export default AudioToneManager;
