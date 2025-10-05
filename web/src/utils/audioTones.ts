class AudioToneManager {
    private audioContext: AudioContext | null = null;
    private gainNode: GainNode | null = null;
    private oscillators: OscillatorNode[] = [];
    private toneIntervals: number[] = [];

    constructor() {
        if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0.3; // base volume
        }
    }

    private ensureAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume();
    }

    /** Play a single polished note */
    private playNote(frequency: number, duration: number, startOffset: number = 0, pan: number = 0, amplitude: number = 0.2) {
        if (!this.audioContext || !this.gainNode) return;
        this.ensureAudioContext();
        const now = this.audioContext.currentTime + startOffset / 1000;

        // Soft bass layer (optional)
        const bassOsc = this.audioContext.createOscillator();
        const bassGain = this.audioContext.createGain();
        bassOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(frequency / 2, now);
        bassGain.gain.setValueAtTime(amplitude * 0.2, now);
        bassOsc.connect(bassGain).connect(this.gainNode);
        bassOsc.start(now);
        bassOsc.stop(now + duration / 1000 + 0.2);
        this.oscillators.push(bassOsc);

        // Main harmonics
        const harmonics = [1, 1.5, 2]; // fewer, controlled harmonics
        harmonics.forEach((mult, i) => {
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.type = 'sine';

            // Very subtle detune
            const detune = (Math.random() - 0.5) * 2; // ±1 Hz
            osc.frequency.setValueAtTime(frequency * mult + detune, now);

            // Stereo pan
            const panner = this.audioContext.createStereoPanner();
            panner.pan.value = pan + (Math.random() - 0.5) * 0.05; // subtle

            osc.connect(gain).connect(panner).connect(this.gainNode);

            // Smooth ADSR
            const attack = 0.05, decay = 0.1, sustainLevel = 0.7, release = 0.25;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(amplitude / mult, now + attack);
            gain.gain.linearRampToValueAtTime((amplitude * sustainLevel) / mult, now + attack + decay);
            gain.gain.setValueAtTime((amplitude * sustainLevel) / mult, now + duration / 1000 - release);
            gain.gain.linearRampToValueAtTime(0, now + duration / 1000 + release);

            // Staggered start for subtle shimmer
            osc.start(now + i * 0.015);
            osc.stop(now + duration / 1000 + release + 0.02);

            this.oscillators.push(osc);
        });
    }

    /** Play chord with soft shimmer and minimal randomness */
    private playChord(frequencies: number[], duration: number) {
        frequencies.forEach((freq, i) => {
            const stagger = i * 40; // minimal stagger
            const pan = (i % 2 === 0 ? -0.2 : 0.2);
            const amplitude = 0.18 + Math.random() * 0.02; // subtle variation
            this.playNote(freq, duration, stagger, pan, amplitude);
        });
    }

    /** Play chord sequence with gentle overlap */
    private playChordSequence(chords: number[][], noteDuration: number, overlap: number = 50) {
        let offset = 0;
        chords.forEach(chord => {
            setTimeout(() => this.playChord(chord, noteDuration), offset);
            offset += noteDuration - overlap;
        });
    }

    /** Smooth looping with subtle evolution */
    private loopSequence(chords: number[][], noteDuration: number, loopInterval: number) {
        const play = () => {
            // Slightly evolve chord notes (+/- 0.5 Hz)
            const evolvedChords = chords.map(chord => chord.map(f => f + (Math.random() - 0.5) * 1));
            this.playChordSequence(evolvedChords, noteDuration, 50);
        };
        play();
        const interval = setInterval(play, loopInterval);
        this.toneIntervals.push(interval);
    }

    /** Teams-style calling tone */
    playCallingTone() {
        this.stopAllTones();
        const notes = [523, 659]; // C5, E5 - simple ascending chime
        this.loopSequence(notes.map(n => [n]), 400, 1500);
    }

    /** Teams-style receiver ringtone */
    playRingtone() {
        this.stopAllTones();
        const melody = [523, 659, 783, 659]; // C5, E5, G5, E5 - simple melodic sequence
        this.loopSequence(melody.map(n => [n]), 300, 2000);
    }

    /** End call tone */
    playEndCallTone() {
        this.stopAllTones();
        const notes = [880, 660]; // A5, E5 - simple descending beep
        this.playChordSequence(notes.map(n => [n]), 200, 50);
    }

    stopAllTones() {
        this.oscillators.forEach(o => {
            try { o.stop(); o.disconnect(); } catch { }
        });
        this.oscillators = [];
        this.toneIntervals.forEach(i => clearInterval(i));
        this.toneIntervals = [];
    }

    setVolume(volume: number) {
        if (this.gainNode) this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }

    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume();
    }

    destroy() {
        this.stopAllTones();
        if (this.audioContext) { this.audioContext.close(); this.audioContext = null; }
    }
}


// Create a singleton instance
let audioToneManager: AudioToneManager | null = null;

export const getAudioToneManager = (): AudioToneManager => {
    if (!audioToneManager) {
        audioToneManager = new AudioToneManager();
    }
    return audioToneManager;
};

export const destroyAudioToneManager = () => {
    if (audioToneManager) {
        audioToneManager.destroy();
        audioToneManager = null;
    }
};

export default AudioToneManager;
