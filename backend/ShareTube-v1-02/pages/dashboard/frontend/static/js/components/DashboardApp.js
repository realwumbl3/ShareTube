import { html, css, LiveVar, LiveList } from "/extension/app/dep/zyx.js";
import { io } from "/extension/app/dep/socket.io.min.esm.js";
import DashboardUser from "../models/User.js";
import DashboardRoom from "../models/Room.js";
import DashboardQueue from "../models/Queue.js";
import DashboardActivity from "../models/Activity.js";
import StatsGrid from "./StatsGrid.js";
import ActivityFeed from "./ActivityFeed.js";
import UserTable from "./UserTable.js";
import RoomTable from "./RoomTable.js";
import QueueTable from "./QueueTable.js";

export default class DashboardApp {
    constructor() {
        // Dashboard state
        this.currentView = new LiveVar("overview"); // overview, users, rooms, queues
        this.stats = new LiveVar({});
        this.activity = new LiveList([]);
        this.users = new LiveList([]);
        this.rooms = new LiveList([]);
        this.queues = new LiveList([]);
        this.loading = new LiveVar(false);
        this.lastUpdate = new LiveVar(null);

        // Initialize data loading
        this.loadDashboardData();
        this.startAutoRefresh();

        // Create sub-components
        this.statsGrid = new StatsGrid(this.stats);
        this.activityFeed = new ActivityFeed(this.activity);
        this.userTable = new UserTable(this.users);
        this.roomTable = new RoomTable(this.rooms);
        this.queueTable = new QueueTable(this.queues);

        html`
            <div class="dashboard-app">
                <header class="dashboard-header glass-panel">
                    <div class="header-brand">
                        <h1>ShareTube <span class="brand-accent">/ Dashboard</span></h1>
                    </div>
                    <nav class="dashboard-nav">
                        <button
                            class="nav-btn glass-button ${this.currentView.interp(v => v === 'overview' ? 'active' : '')}"
                            zyx-click=${() => this.setView('overview')}
                        >
                            Overview
                        </button>
                        <button
                            class="nav-btn glass-button ${this.currentView.interp(v => v === 'users' ? 'active' : '')}"
                            zyx-click=${() => this.setView('users')}
                        >
                            Users
                        </button>
                        <button
                            class="nav-btn glass-button ${this.currentView.interp(v => v === 'rooms' ? 'active' : '')}"
                            zyx-click=${() => this.setView('rooms')}
                        >
                            Rooms
                        </button>
                        <button
                            class="nav-btn glass-button ${this.currentView.interp(v => v === 'queues' ? 'active' : '')}"
                            zyx-click=${() => this.setView('queues')}
                        >
                            Queues
                        </button>
                    </nav>
                    <div class="dashboard-status">
                        <span class="last-update">
                            ${this.lastUpdate.interp(v => v ? `Updated: ${v}` : 'Loading...')}
                        </span>
                        <button
                            class="refresh-btn glass-button"
                            zyx-click=${() => this.loadDashboardData()}
                            disabled=${this.loading}
                        >
                            ${this.loading.interp(v => v ? 'Refreshing...' : 'Refresh')}
                        </button>
                    </div>
                </header>

                <main class="dashboard-content">
                    <!-- Overview View -->
                    <div class="view" zyx-if=${[this.currentView, v => v === 'overview']}>
                        ${this.statsGrid}
                        <div class="overview-grid">
                            <div class="overview-section glass-panel">
                                <h2><span class="icon-activity">⚡</span> Recent Activity</h2>
                                ${this.activityFeed}
                            </div>
                        </div>
                    </div>

                    <!-- Users View -->
                    <div class="view" zyx-if=${[this.currentView, v => v === 'users']}>
                        <h2 class="view-title">User Management</h2>
                        ${this.userTable}
                    </div>

                    <!-- Rooms View -->
                    <div class="view" zyx-if=${[this.currentView, v => v === 'rooms']}>
                        <h2 class="view-title">Room Management</h2>
                        ${this.roomTable}
                    </div>

                    <!-- Queues View -->
                    <div class="view" zyx-if=${[this.currentView, v => v === 'queues']}>
                        <h2 class="view-title">Queue Management</h2>
                        ${this.queueTable}
                    </div>
                </main>
            </div>
        `.bind(this);
    }

    setView(view) {
        this.currentView.set(view);
    }

    async loadDashboardData() {
        this.loading.set(true);
        try {
            // Load all dashboard data in parallel
            const [statsRes, activityRes, usersRes, roomsRes, queuesRes] = await Promise.all([
                fetch('/dashboard/api/stats'),
                fetch('/dashboard/api/activity'),
                fetch('/dashboard/api/users'),
                fetch('/dashboard/api/rooms'),
                fetch('/dashboard/api/queues')
            ]);

            const [stats, activity, users, rooms, queues] = await Promise.all([
                statsRes.json(),
                activityRes.json(),
                usersRes.json(),
                roomsRes.json(),
                queuesRes.json()
            ]);

            // Update reactive state
            this.stats.set(stats);

            // Clear and repopulate LiveLists with model instances
            this.activity.splice(0, this.activity.length);
            activity.forEach(item => this.activity.push(new DashboardActivity(item)));

            this.users.splice(0, this.users.length);
            (users.users || []).forEach(userData => this.users.push(new DashboardUser(userData)));

            this.rooms.splice(0, this.rooms.length);
            (rooms.rooms || []).forEach(roomData => this.rooms.push(new DashboardRoom(roomData)));

            this.queues.splice(0, this.queues.length);
            (queues.queues || []).forEach(queueData => this.queues.push(new DashboardQueue(queueData)));

            this.lastUpdate.set(new Date().toLocaleTimeString());

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            this.loading.set(false);
        }
    }

    handleRealtimeUpdate(data) {
        // Handle real-time updates from the server
        console.log('Received real-time update:', data);

        if (data.type === 'stats') {
            this.stats.set(data.stats);
        } else if (data.type === 'activity') {
            // Prepend new activity to existing activity
            this.activity.unshift(new DashboardActivity(data.activity)); // Add to beginning
            if (this.activity.length > 50) {
                this.activity.splice(50, this.activity.length - 50); // Keep max 50 items
            }
        } else if (data.type === 'full_update') {
            // Full dashboard refresh
            this.loadDashboardData();
        }
    }

    startAutoRefresh() {
        // Refresh data every 30 seconds
        setInterval(() => {
            if (!this.loading.get()) {
                this.loadDashboardData();
            }
        }, 30000);
    }
}

css`
    .dashboard-app {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }

    .dashboard-header {
        margin: 1rem 2rem;
        padding: 1rem 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border: 1px solid var(--glass-border);
        border-radius: 100px; /* Pill shape */
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        position: sticky;
        top: 1rem;
        z-index: 100;
    }

    .header-brand h1 {
        margin: 0;
        color: var(--text-primary);
        font-size: 1.2rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .brand-accent {
        color: var(--accent-primary);
        font-weight: 300;
        opacity: 0.8;
    }

    .dashboard-nav {
        display: flex;
        gap: 0.5rem;
        background: rgba(255, 255, 255, 0.03);
        padding: 0.25rem;
        border-radius: 100px;
        border: 1px solid var(--glass-border);
    }

    .nav-btn {
        padding: 0.5rem 1.25rem;
        border: none;
        border-radius: 100px;
        font-size: 0.85rem;
        font-weight: 500;
    }

    .nav-btn.active {
        background: var(--accent-primary);
        color: #000;
        font-weight: 600;
        box-shadow: 0 0 15px rgba(0, 243, 255, 0.4);
    }

    .dashboard-status {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
    }

    .refresh-btn {
        padding: 0.4rem 1rem;
        font-size: 0.8rem;
        border-radius: 100px;
    }

    .refresh-btn:disabled {
        opacity: 0.5;
        cursor: wait;
    }

    .dashboard-content {
        flex: 1;
        padding: 2rem;
        max-width: 1600px;
        margin: 0 auto;
        width: 100%;
    }

    .view {
        animation: slideUpFade 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .view-title {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 1.5rem;
        background: linear-gradient(to right, #fff, #aaa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: -1px;
    }

    @keyframes slideUpFade {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .overview-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 2rem;
        margin-top: 2rem;
    }

    .overview-section {
        padding: 1.5rem;
    }

    .overview-section h2 {
        margin: 0 0 1.5rem 0;
        color: var(--text-primary);
        font-size: 1.1rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    @media (max-width: 1024px) {
        .dashboard-header {
            flex-direction: column;
            gap: 1rem;
            border-radius: var(--radius-md);
            position: static;
            margin: 1rem;
        }

        .dashboard-nav {
            width: 100%;
            justify-content: center;
            flex-wrap: wrap;
        }
    }
`;
