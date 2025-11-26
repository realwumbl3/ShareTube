import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";

class UserTableRow {
    constructor(user) {
        html`
            <div class="user-row">
                <div class="user-name">
                    <div class="user-info">
                        <span class="user-display-name">${user.name.interp(v => v)}</span>
                        <span class="user-email">${user.email.interp(v => v)}</span>
                    </div>
                </div>
                <div class="user-status">
                    <span class="status-badge ${user.active.interp(v => v ? 'active' : 'inactive')}">
                        ${user.active.interp(v => v ? 'Active' : 'Inactive')}
                    </span>
                </div>
                <div class="user-stats">${user.room_count.interp(v => v || 0)} rooms</div>
                <div class="user-stats">${user.videos_added.interp(v => v || 0)} videos</div>
                <div class="user-date">${user.created_at.interp(v => this.formatDate(v))}</div>
                <div class="user-date">${user.last_seen.interp(v => this.formatDate(v))}</div>
            </div>
        `.bind(this);
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch (e) {
            return '-';
        }
    }
}

export default class UserTable {
    constructor(users) {
        this.users = users;
        this.searchTerm = new LiveVar('');
        this.filteredUsers = new LiveList([]);

        // Update filtered users when search term or users change
        this.searchTerm.subscribe(() => this.updateFilteredUsers());
        this.users.subscribe(() => this.updateFilteredUsers());
        this.updateFilteredUsers();

        html`
            <div class="user-table-container glass-panel">
                <div class="table-header-control">
                    <h3>Users <span class="count-badge">${this.users.interp(u => u.length)}</span></h3>
                    <div class="table-controls">
                        <input
                            type="text"
                            placeholder="Search users..."
                            class="search-input glass-input"
                            zyx-input=${(e) => this.searchTerm.set(e.target.value)}
                        />
                    </div>
                </div>

                <div class="table-wrapper">
                    <div class="user-table">
                        <div class="table-header-row">
                            <div class="header-cell">User</div>
                            <div class="header-cell">Status</div>
                            <div class="header-cell">Rooms</div>
                            <div class="header-cell">Videos</div>
                            <div class="header-cell">Joined</div>
                            <div class="header-cell">Last Seen</div>
                        </div>
                        <div class="table-body" zyx-live-list=${{
                            list: this.filteredUsers,
                            compose: UserTableRow,
                        }}>
                        </div>
                    </div>
                </div>
            </div>
        `.bind(this);
    }

    updateFilteredUsers() {
        const term = this.searchTerm.get().toLowerCase();
        const allUsers = this.users;

        // Clear current filtered list
        this.filteredUsers.splice(0, this.filteredUsers.length);

        // Add filtered users
        const filtered = term ?
            allUsers.filter(user =>
                user.name.toLowerCase().includes(term) ||
                user.email.toLowerCase().includes(term)
            ) : allUsers;

        // Add all filtered users to the LiveList
        filtered.forEach(user => this.filteredUsers.push(user));
    }
}

css`
    .user-table-container {
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
        color: var(--accent-primary);
    }

    .search-input {
        padding: 0.6rem 1.2rem;
        min-width: 250px;
        font-size: 0.9rem;
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .user-table {
        display: flex;
        flex-direction: column;
        font-size: 0.9rem;
        min-width: 800px;
    }

    .table-header-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr;
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

    .user-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr;
        border-bottom: 1px solid var(--glass-border);
        transition: background-color 0.2s;
        align-items: center;
    }

    .user-row:hover {
        background-color: rgba(255, 255, 255, 0.02);
    }

    .user-row > div {
        padding: 1rem;
        display: flex;
        align-items: center;
    }

    .user-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .user-display-name {
        font-weight: 600;
        color: var(--text-primary);
        font-size: 0.95rem;
    }

    .user-email {
        font-size: 0.8rem;
        color: var(--text-muted);
        font-family: var(--font-mono);
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

    .user-stats {
        color: var(--text-secondary);
        font-family: var(--font-mono);
        font-size: 0.85rem;
    }

    .user-date {
        color: var(--text-muted);
        white-space: nowrap;
        font-size: 0.85rem;
    }

    @media (max-width: 768px) {
        .table-header-control {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
        }

        .search-input {
            width: 100%;
        }
    }
`;
