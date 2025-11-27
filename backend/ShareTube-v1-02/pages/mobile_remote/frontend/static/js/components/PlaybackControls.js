import { html, css, LiveVar } from "/extension/app/dep/zyx.js";

export default class PlaybackControls {
    constructor(app) {
        this.app = app;

        // Local state for seeking
        this.seekPosition = new LiveVar(0);

        html`
            <div class="playback-controls">
                <!-- Time Display and Progress Bar -->
                <div class="time-display">
                    <span class="time-current">
                        ${this.app.playbackStatus.interp((status) => this.formatTime(status.current_time))}
                    </span>
                    <div class="progress-container">
                        <div class="progress-bar" zyx-click=${(e) => this.handleProgressClick(e)}>
                            <div
                                class="progress-fill"
                                style=${this.app.playbackStatus.interp((status) => {
                                    const percent =
                                        status.duration > 0 ? (status.current_time / status.duration) * 100 : 0;
                                    return `width: ${percent}%`;
                                })}
                            ></div>
                        </div>
                    </div>
                    <span class="time-duration">
                        ${this.app.playbackStatus.interp((status) => this.formatTime(status.duration))}
                    </span>
                </div>

                <!-- Control Buttons -->
                <div class="control-buttons">
                    <button class="control-btn" zyx-click=${() => this.handlePrevious()}>⏮</button>
                    <button class="control-btn play-btn" zyx-click=${() => this.handleTogglePlayPause()}>
                        ${this.app.playbackStatus.interp((status) => (status.is_playing ? "⏸" : "▶"))}
                    </button>
                    <button class="control-btn" zyx-click=${() => this.handleNext()}>⏭</button>
                </div>

                <!-- Volume Control -->
                <div class="volume-control">
                    <span class="volume-icon">🔊</span>
                    <input
                        type="range"
                        class="volume-slider"
                        min="0"
                        max="100"
                        value=${this.app.playbackStatus.interp((status) => status.volume)}
                        zyx-input=${(e) => this.handleVolumeChange(e)}
                    />
                    <span class="volume-value"> ${this.app.playbackStatus.interp((status) => status.volume)}% </span>
                </div>
            </div>
        `.bind(this);
    }

    handleProgressClick(e) {
        const progressBar = e.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;

        // Find the parent app component to call seek method
        this.app.seekToPosition(percentage);
    }

    handleTogglePlayPause() {
        this.app.togglePlayPause();
    }

    handlePrevious() {
        this.app.previousVideo();
    }

    handleNext() {
        this.app.nextVideo();
    }

    handleVolumeChange(e) {
        const volume = e.target.value;
        this.app.setVolume(volume);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    }
}

css`
    .playback-controls {
        display: flex;
        flex-direction: column;
        gap: 2rem;
    }

    /* Time Display and Progress Bar */
    .time-display {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 2rem;
    }

    .progress-container {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .progress-bar {
        flex: 1;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        cursor: pointer;
        position: relative;
        overflow: hidden;
    }

    .progress-bar::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
        opacity: 0.3;
    }

    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
        border-radius: 3px;
        width: 0%;
        transition: width 0.3s;
        position: relative;
        z-index: 1;
    }

    .time-current,
    .time-duration {
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 0.9rem;
        min-width: 45px;
        text-align: center;
    }

    /* Control Buttons */
    .control-buttons {
        display: flex;
        justify-content: center;
        gap: 2rem;
        margin-bottom: 2rem;
    }

    .control-btn {
        background: rgba(255, 255, 255, 0.05);
        outline: 1px solid var(--glass-border);
        color: var(--text-primary);
        width: 60px;
        height: 60px;
        border-radius: 50%;
        font-size: 1.5rem;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
    }

    .control-btn::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: radial-gradient(circle at center, rgba(0, 243, 255, 0.1), transparent 70%);
        opacity: 0;
        transition: opacity 0.3s;
    }

    .control-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        outline-color: var(--accent-primary);
        box-shadow: var(--glow-primary);
        transform: translateY(-1px);
    }

    .control-btn:hover::before {
        opacity: 1;
    }

    .control-btn:active {
        transform: scale(0.95);
    }

    .play-btn {
        width: 80px;
        height: 80px;
        font-size: 2rem;
    }

    /* Volume Control */
    .volume-control {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .volume-icon {
        font-size: 1.2rem;
    }

    .volume-slider {
        flex: 1;
        -webkit-appearance: none;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        outline: none;
        cursor: pointer;
    }

    .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
        transition: all 0.3s;
    }

    .volume-slider::-webkit-slider-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 0 15px rgba(0, 243, 255, 0.5);
    }

    .volume-slider::-moz-range-thumb {
        width: 20px;
        height: 20px;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        border-radius: 50%;
        cursor: pointer;
        border: none;
        box-shadow: 0 0 10px rgba(0, 243, 255, 0.3);
        transition: all 0.3s;
    }

    .volume-slider::-moz-range-thumb:hover {
        transform: scale(1.1);
        box-shadow: 0 0 15px rgba(0, 243, 255, 0.5);
    }

    .volume-value {
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 0.9rem;
        min-width: 35px;
        text-align: center;
    }

    /* Mobile optimizations */
    @media (max-width: 480px) {
        .control-buttons {
            gap: 1rem;
        }

        .control-btn {
            width: 50px;
            height: 50px;
            font-size: 1.2rem;
        }

        .play-btn {
            width: 65px;
            height: 65px;
            font-size: 1.5rem;
        }

        .time-display {
            gap: 0.5rem;
        }

        .time-current,
        .time-duration {
            font-size: 0.8rem;
            min-width: 40px;
        }
    }
`;
