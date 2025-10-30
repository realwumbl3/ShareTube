// Lightweight logger usable from content scripts. Level is controlled via
// chrome.storage.sync key: newapp_log_level

// Supported verbosity levels mapped to numeric priorities
const LEVELS = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    trace: 5,
};

// Default level if storage has not been configured
let currentLevelName = 'warn';
let currentLevel = LEVELS[currentLevelName];

// Coerce input to a valid level key
function coerceLevel(name) {
    const k = String(name || '').toLowerCase();
    return LEVELS.hasOwnProperty(k) ? k : 'warn';
}

// Load persisted level from chrome.storage.sync
async function loadLevelFromStorage() {
    try {
        const { newapp_log_level } = await chrome.storage.sync.get(['newapp_log_level']);
        setLevelByName(newapp_log_level);
    } catch (e) {
        // Fallback remains
    }
}

// Set current level and cache numeric priority
function setLevelByName(name) {
    try {
        const lvlName = coerceLevel(name);
        currentLevelName = lvlName;
        currentLevel = LEVELS[lvlName];
    } catch (e) {
        // ignore
    }
}

// Keep level in sync across extension
// Keep level in sync across open extension contexts
try {
    chrome.storage.onChanged.addListener((changes, area) => {
        try {
            if (area === 'sync' && changes.newapp_log_level) {
                setLevelByName(changes.newapp_log_level.newValue);
            }
        } catch (e) {
            // ignore
        }
    });
} catch (e) {
    // ignore
}

// Prepend a standard tag to console output
function prefixArgs(args) {
    try {
        return ['[ShareTube]'].concat(Array.from(args));
    } catch (e) {
        return ['[ShareTube]'];
    }
}

// Logger facade matching console.* API with level filtering
export const logger = {
    get level() { return currentLevelName; },
    setLevelByName,
    error(...args) {
        if (currentLevel >= LEVELS.error) {
            try { console.error.apply(console, prefixArgs(args)); } catch (e) {}
        }
    },
    warn(...args) {
        if (currentLevel >= LEVELS.warn) {
            try { console.warn.apply(console, prefixArgs(args)); } catch (e) {}
        }
    },
    info(...args) {
        if (currentLevel >= LEVELS.info) {
            try { console.info.apply(console, prefixArgs(args)); } catch (e) {}
        }
    },
    debug(...args) {
        if (currentLevel >= LEVELS.debug) {
            try { console.debug.apply(console, prefixArgs(args)); } catch (e) {}
        }
    },
    trace(...args) {
        if (currentLevel >= LEVELS.trace) {
            try { console.debug.apply(console, prefixArgs(args)); } catch (e) {}
        }
    },
};

// Initialize from storage on import
loadLevelFromStorage();


