class AudioToneManager {
    private audioContext: AudioContext | null = null;
    private oscillators: OscillatorNode[] = [];
    private gainNode: GainNode | null = null;
    private toneIntervals: number[] = [];

    constructor() {
        if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.gainNode = this.audioContext.createGain();
            this.gainNode.connect(this.audioContext.destination);
            this.gainNode.gain.value = 0.3; // Default volume
        }
    }

    private ensureAudioContext() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    private playTone(frequency: number, duration: number) {
        if (!this.audioContext || !this.gainNode) return;

        this.ensureAudioContext();

        const oscillator = this.audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.connect(this.gainNode);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration / 1000);

        this.oscillators.push(oscillator);

        // Clean up after the tone finishes
        setTimeout(() => {
            const index = this.oscillators.indexOf(oscillator);
            if (index > -1) {
                this.oscillators.splice(index, 1);
            }
        }, duration);
    }

    /**
     * Play calling tone (repeated 800Hz beeps every 2s)
     */
    playCallingTone() {
        this.stopAllTones();

        const playBeep = () => {
            this.playTone(800, 400); // 800Hz for 400ms
        };

        // Play immediately
        playBeep();

        // Repeat every 2 seconds
        const interval = setInterval(playBeep, 2000);
        this.toneIntervals.push(interval);
    }

    /**
     * Play ringtone (alternating 800Hz/1200Hz)
     */
    playRingtone() {
        this.stopAllTones();

        let toggle = true;
        const playRing = () => {
            this.playTone(toggle ? 800 : 1200, 400);
            toggle = !toggle;
        };

        // Play immediately
        playRing();

        // Repeat every 800ms (400ms tone + 400ms pause)
        const interval = setInterval(playRing, 800);
        this.toneIntervals.push(interval);
    }

    /**
     * Play end call tone (descending 800/600/400Hz)
     */
    playEndCallTone() {
        this.stopAllTones();

        setTimeout(() => this.playTone(800, 200), 0);
        setTimeout(() => this.playTone(600, 200), 200);
        setTimeout(() => this.playTone(400, 200), 400);
    }

    /**
     * Play a success notification beep
     */
    playSuccessTone() {
        this.playTone(880, 150);
        setTimeout(() => this.playTone(1108.73, 150), 150);
    }

    /**
     * Play an error notification beep
     */
    playErrorTone() {
        this.playTone(440, 150);
        setTimeout(() => this.playTone(349.23, 150), 150);
    }

    /**
     * Stop all currently playing tones and intervals
     */
    stopAllTones() {
        // Stop all oscillators
        this.oscillators.forEach(osc => {
            try {
                osc.stop();
                osc.disconnect();
            } catch (e) {
                // Oscillator may already be stopped
            }
        });
        this.oscillators = [];

        // Clear all intervals
        this.toneIntervals.forEach(interval => clearInterval(interval));
        this.toneIntervals = [];
    }

    /**
     * Set the volume for all tones (0.0 to 1.0)
     */
    setVolume(volume: number) {
        if (this.gainNode) {
            this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Resume audio context (required for user interaction)
     */
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
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
