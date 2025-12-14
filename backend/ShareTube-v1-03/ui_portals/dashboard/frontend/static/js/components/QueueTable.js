import { html, css, LiveVar, LiveList } from "/extension/shared/dep/zyx.js";

class QueueTableRow {
    constructor(queue) {
        this.queue = queue;
        this.expanded = new LiveVar(false);

        html`
            <div class="queue-row">
                <div class="queue-room">
                    <span class="mobile-label">Room</span>
                    <div class="room-info">
                        <span class="room-code">${queue.room_code.interp((v) => v)}</span>
                        <button class="expand-btn" zyx-click=${() => this.expanded.set(!this.expanded.get())}>
                            ${this.expanded.interp((e) => (e ? "▼" : "▶"))}
                        </button>
                    </div>
                </div>
                <div class="queue-count">
                    <span class="mobile-label">Count</span>
                    ${queue.entry_count.interp((v) => v)} videos
                </div>
                <div class="queue-preview">
                    <span class="mobile-label">Content</span>
                    <!-- Collapsed view -->
                    <div zyx-if=${[this.expanded, (e) => !e]}>${this.renderCollapsedContent()}</div>
                    <div zyx-else>${this.renderExpandedContent()}</div>
                    <!-- Expanded view -->
                </div>
            </div>
        `.bind(this);
    }

    renderCollapsedContent() {
        const entries = this.queue.entries.get();
        if (!entries || entries.length === 0) {
            return html`<span class="no-entries">No videos</span>`;
        }

        const firstEntry = entries[0];
        return html`
            <div class="queue-preview-item">
                <span class="video-title">${firstEntry.title}</span>
                ${entries.length > 1 ? html`<span class="more-items">+${entries.length - 1} more</span>` : ""}
            </div>
        `;
    }

    renderExpandedContent() {
        const entries = this.queue.entries.get();
        if (!entries || entries.length === 0) {
            return html`<div class="queue-entries"><span class="no-entries">No videos in queue</span></div>`;
        }

        return html`
            <div class="queue-entries">
                ${entries.map(
                    (entry) => html`
                        <div class="queue-entry">
                            <div class="entry-info">
                                <span class="entry-title">${entry.title}</span>
                                <span class="entry-meta"
                                    >by ${entry.added_by} • ${this.formatDuration(entry.duration_ms)}</span
                                >
                            </div>
                            <div class="entry-url">${entry.url}</div>
                        </div>
                    `
                )}
            </div>
        `;
    }

    formatDuration(ms) {
        if (!ms) return "0:00";
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
}

export default class QueueTable {
    constructor(queues) {
        this.queues = queues;
        this.searchTerm = new LiveVar("");
        this.filteredQueues = new LiveList([]);

        // Update filtered queues when search term or queues change
        this.searchTerm.subscribe(() => this.updateFilteredQueues());
        this.queues.subscribe(() => this.updateFilteredQueues());
        this.updateFilteredQueues();

        html`
            <div class="queue-table-container glass-panel">
                <div class="table-header-control">
                    <h3>Queues <span class="count-badge">${this.queues.interp((q) => q.length)}</span></h3>
                    <div class="table-controls">
                        <input
                            type="text"
                            placeholder="Search by room code..."
                            class="search-input glass-input"
                            zyx-input=${(e) => this.searchTerm.set(e.target.value)}
                        />
                    </div>
                </div>

                <div class="table-wrapper">
                    <div class="queue-table">
                        <div class="queue-table-header">
                            <div class="header-cell">Room</div>
                            <div class="header-cell">Count</div>
                            <div class="header-cell">Queue Contents</div>
                        </div>
                        <div
                            class="table-body"
                            zyx-live-list=${{
                                list: this.filteredQueues,
                                compose: QueueTableRow,
                                filter: () => true,
                            }}
                        ></div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    updateFilteredQueues() {
        const term = this.searchTerm.get().toLowerCase();
        const allQueues = this.queues;

        // Clear current filtered list
        this.filteredQueues.splice(0, this.filteredQueues.length);

        // Add filtered queues
        const filtered = term ? allQueues.filter((queue) => queue.room_code.toLowerCase().includes(term)) : allQueues;

        // Add all filtered queues to the LiveList
        filtered.forEach((queue) => this.filteredQueues.push(queue));
    }
}

css`
    .queue-table-container {
        overflow: hidden;
    }

    .table-header-control {
        padding: 1.5rem;
        border-bottom: 1px solid var(--glass-border);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .table-header-control h3 {
        margin: 0;
        color: var(--text-primary);
        font-size: 1.1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .count-badge {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.2rem 0.6rem;
        border-radius: 100px;
        font-size: 0.8rem;
        font-family: var(--font-mono);
        color: var(--accent-warning);
    }

    .search-input {
        padding: 0.6rem 1.2rem;
        min-width: 250px;
        font-size: 0.9rem;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .queue-table {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
        min-width: 800px;
    }

    .queue-table-header {
        display: grid;
        grid-template-columns: 1fr 1fr 3fr;
        background: rgba(0, 0, 0, 0.2);
        border-bottom: 1px solid var(--glass-border);
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-size: 0.75rem;
    }

    .header-cell {
        padding: 1rem;
        white-space: nowrap;
    }

    .table-body {
        display: flex;
        flex-direction: column;
    }

    .queue-row {
        display: grid;
        grid-template-columns: 1fr 1fr 3fr;
        border-bottom: 1px solid var(--glass-border);
        transition: background-color 0.2s;
    }

    .queue-row:hover {
        background-color: rgba(255, 255, 255, 0.02);
    }

    .queue-row > div {
        padding: 1rem;
        display: flex;
        align-items: flex-start;
    }

    .queue-room {
        min-width: 120px;
    }

    .room-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .room-code {
        font-family: var(--font-mono);
        font-weight: 600;
        color: var(--accent-primary);
        background: rgba(0, 243, 255, 0.1);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.85rem;
    }

    .expand-btn {
        background: none;
        outline: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.8rem;
        padding: 0.2rem;
        border-radius: 3px;
        transition: color 0.2s, background-color 0.2s;
        border: none;
    }

    .expand-btn:hover {
        color: var(--accent-primary);
        background-color: rgba(255, 255, 255, 0.1);
    }

    .queue-count {
        color: var(--text-secondary);
        font-weight: 500;
        white-space: nowrap;
    }


    .queue-preview-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .video-title {
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .more-items {
        color: var(--text-muted);
        font-size: 0.8rem;
    }

    .queue-entries {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        max-height: 300px;
        overflow-y: auto;
        padding-right: 0.5rem;
    }

    .queue-entry {
        padding: 0.75rem;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 4px;
        border-left: 3px solid var(--accent-primary);
        transition: background 0.2s;
    }

    .queue-entry:hover {
        background: rgba(255, 255, 255, 0.06);
    }

    .entry-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-bottom: 0.5rem;
    }

    .entry-title {
        font-weight: 500;
        color: var(--text-primary);
        line-height: 1.3;
    }

    .entry-meta {
        font-size: 0.8rem;
        color: var(--text-muted);
    }

    .entry-url {
        font-size: 0.75rem;
        color: var(--accent-primary);
        word-break: break-all;
        font-family: var(--font-mono);
        opacity: 0.8;
    }

    .no-entries {
        color: var(--text-muted);
        font-style: italic;
    }

    .mobile-label {
        display: none;
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    @media (max-width: 768px) {
        .table-header-control {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .search-input {
            min-width: auto;
            width: 100%;
        }

        .queue-table {
            min-width: 100%;
        }

        .queue-table-header {
            display: none;
        }

        .queue-row {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            padding: 1rem;
            margin-bottom: 1rem;
            background: rgba(255, 255, 255, 0.03);
            outline: 1px solid var(--glass-border);
            border-radius: var(--radius-md);
        }

        .queue-row > div {
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: flex-start; /* Changed from center for preview content */
            width: 100%;
        }

        .queue-row > div:last-child {
            border-bottom: none;
            flex-direction: column; /* Stack label and content for preview */
            gap: 0.5rem;
        }

        .mobile-label {
            display: block;
            flex-shrink: 0;
        }

        .queue-preview {
            max-width: none;
            width: 100%;
        }

        .queue-entries {
            max-height: 200px;
        }
    }
`;
