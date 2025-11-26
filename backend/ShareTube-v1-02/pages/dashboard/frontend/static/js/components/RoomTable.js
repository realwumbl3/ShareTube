import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";

class RoomTableRow {
    constructor(room) {
        html`
            <div class="room-row">
                <div class="room-code">
                    <span class="mobile-label">Code</span>
                    <span class="room-code-text">${room.code.interp((v) => v)}</span>
                </div>
                <div class="room-name">
                    <span class="mobile-label">Name</span>
                    ${room.name.interp((v) => v)}
                </div>
                <div class="room-owner">
                    <span class="mobile-label">Owner</span>
                    ${room.owner.interp((v) => v)}
                </div>
                <div class="room-status">
                    <span class="mobile-label">Status</span>
                    <span class="status-badge ${room.is_active.interp((v) => (v ? "active" : "inactive"))}">
                        ${room.is_active.interp((v) => (v ? "Active" : "Inactive"))}
                    </span>
                </div>
                <div class="room-stats">
                    <span class="mobile-label">Members</span>
                    ${room.member_count.interp((v) => v || 0)} members
                </div>
                <div class="room-stats">
                    <span class="mobile-label">Queue</span>
                    ${room.queue_count.interp((v) => v || 0)} videos
                </div>
                <div class="room-stats">
                    <span class="mobile-label">Activity</span>
                    ${room.recent_activity.interp((v) => v || 0)} events
                </div>
                <div class="room-date">
                    <span class="mobile-label">Created</span>
                    ${room.created_at.interp((v) => this.formatDate(v))}
                </div>
            </div>
        `.bind(this);
    }

    formatDate(dateString) {
        if (!dateString) return "-";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch (e) {
            return "-";
        }
    }
}

export default class RoomTable {
    constructor(rooms) {
        this.rooms = rooms;
        this.searchTerm = new LiveVar("");
        this.showActiveOnly = new LiveVar(false);
        this.filteredRooms = new LiveList([]);

        // Update filtered rooms when filters change
        this.searchTerm.subscribe(() => this.updateFilteredRooms());
        this.showActiveOnly.subscribe(() => this.updateFilteredRooms());
        this.rooms.subscribe(() => this.updateFilteredRooms());
        this.updateFilteredRooms();

        html`
            <div class="room-table-container glass-panel">
                <div class="table-header-control">
                    <h3>Rooms <span class="count-badge">${this.rooms.interp((r) => r.length)}</span></h3>
                    <div class="table-controls">
                        <label class="filter-checkbox">
                            <input type="checkbox" zyx-input=${(e) => this.showActiveOnly.set(e.target.checked)} />
                            Active only
                        </label>
                        <input
                            type="text"
                            placeholder="Search rooms..."
                            class="search-input glass-input"
                            zyx-input=${(e) => this.searchTerm.set(e.target.value)}
                        />
                    </div>
                </div>

                <div class="table-wrapper">
                    <div class="room-table">
                        <div class="room-table-header">
                            <div class="header-cell">Code</div>
                            <div class="header-cell">Name</div>
                            <div class="header-cell">Owner</div>
                            <div class="header-cell">Status</div>
                            <div class="header-cell">Members</div>
                            <div class="header-cell">Queue</div>
                            <div class="header-cell">Activity</div>
                            <div class="header-cell">Created</div>
                        </div>
                        <div class="table-body" zyx-live-list=${{
                            list: this.filteredRooms,
                            compose: RoomTableRow,
                            filter: () => true,
                        }}>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    updateFilteredRooms() {
        const term = this.searchTerm.get().toLowerCase();
        const activeOnly = this.showActiveOnly.get();
        const allRooms = this.rooms;

        // Clear current filtered list
        this.filteredRooms.splice(0, this.filteredRooms.length);

        // Apply filters
        let filtered = allRooms;

        if (activeOnly) {
            filtered = filtered.filter((room) => room.is_active);
        }

        if (term) {
            filtered = filtered.filter(
                (room) =>
                    room.code.toLowerCase().includes(term) ||
                    room.name.toLowerCase().includes(term) ||
                    room.owner.toLowerCase().includes(term)
            );
        }

        // Add filtered rooms to the LiveList
        filtered.forEach((room) => this.filteredRooms.push(room));
    }
}

css`

    .room-table-container {
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
        color: var(--accent-secondary);
    }

    .table-controls {
        display: flex;
        gap: 1.5rem;
        align-items: center;
    }

    .filter-checkbox {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: var(--text-secondary);
        cursor: pointer;
        user-select: none;
    }

    .filter-checkbox input[type="checkbox"] {
        accent-color: var(--accent-primary);
        width: 16px;
        height: 16px;
    }

    .search-input {
        padding: 0.6rem 1.2rem;
        min-width: 250px;
        font-size: 0.9rem;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .room-table {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
        min-width: 1000px;
    }

    .room-table-header {
        display: grid;
        grid-template-columns: 1fr 1.5fr 1fr 1fr 0.8fr 0.8fr 0.8fr 1fr;
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

    .room-row {
        display: grid;
        grid-template-columns: 1fr 1.5fr 1fr 1fr 0.8fr 0.8fr 0.8fr 1fr;
        border-bottom: 1px solid var(--glass-border);
        transition: background-color 0.2s;
        align-items: center;
    }

    .room-row:hover {
        background-color: rgba(255, 255, 255, 0.02);
    }

    .room-row > div {
        padding: 1rem;
        display: flex;
        align-items: center;
    }

    .room-code-text {
        font-family: var(--font-mono);
        font-weight: 600;
        color: var(--accent-primary);
        background: rgba(0, 243, 255, 0.1);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.85rem;
    }
    
    .room-name {
        font-weight: 500;
        color: var(--text-primary);
    }

    .room-owner {
        color: var(--text-secondary);
    }

    .status-badge {
        padding: 0.25rem 0.75rem;
        border-radius: 100px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border: 1px solid transparent;
    }

    .status-badge.active {
        background: rgba(0, 255, 157, 0.1);
        color: var(--accent-success);
        border-color: rgba(0, 255, 157, 0.2);
        box-shadow: 0 0 10px rgba(0, 255, 157, 0.1);
    }

    .status-badge.inactive {
        background: rgba(255, 255, 255, 0.05);
        color: var(--text-muted);
        border-color: var(--glass-border);
    }

    .room-stats {
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 0.85rem;
    }

    .room-date {
        color: var(--text-muted);
        white-space: nowrap;
        font-size: 0.85rem;
    }

    .mobile-label {
        display: none;
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    @media (max-width: 1024px) {
        .table-header-control {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .table-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
        }

        .search-input {
            width: 100%;
        }
    }

    @media (max-width: 768px) {
        .room-table {
            min-width: 100%;
        }

        .room-table-header {
            display: none;
        }

        .room-row {
            display: flex;
            flex-direction: column;
            align-items: stretch;
            padding: 1rem;
            margin-bottom: 1rem;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--glass-border);
            border-radius: var(--radius-md);
        }

        .room-row > div {
            padding: 0.5rem 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
        }

        .room-row > div:last-child {
            border-bottom: none;
        }

        .mobile-label {
            display: block;
        }
        
        .room-code {
            background: rgba(0, 243, 255, 0.05);
            margin: -1rem -1rem 0.5rem -1rem;
            padding: 0.75rem 1rem !important;
            border-bottom: 1px solid var(--glass-border) !important;
            border-radius: var(--radius-md) var(--radius-md) 0 0;
        }
    }
`;
