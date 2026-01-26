/**
 * Utility Functions
 */

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum time between calls in ms
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDate(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    // Less than a minute
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than an hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    }

    // Less than a day
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    // Less than a week
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    // Otherwise show date
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type: 'success', 'error', 'info', 'warning'
 * @param {number} duration - Duration in ms
 */
export function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
    });

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.addEventListener('transitionend', () => toast.remove());
    }, duration);
}

/**
 * Show a confirmation modal
 * @param {string} title - Modal title
 * @param {string} message - Modal message
 * @param {string} confirmText - Confirm button text
 * @param {string} cancelText - Cancel button text
 * @returns {Promise<boolean>} True if confirmed
 */
export function showConfirm(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        const container = document.getElementById('modal-container');

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${title}</h2>
        <p class="modal-message">${message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
          <button class="btn btn-danger" data-action="confirm">${confirmText}</button>
        </div>
      </div>
    `;

        const handleClick = (e) => {
            const action = e.target.dataset.action;
            if (action === 'confirm') {
                resolve(true);
                modal.remove();
            } else if (action === 'cancel') {
                resolve(false);
                modal.remove();
            }
        };

        modal.addEventListener('click', handleClick);
        container.appendChild(modal);

        // Focus the cancel button for safety
        modal.querySelector('[data-action="cancel"]').focus();
    });
}

/**
 * LocalStorage helpers with JSON support
 */
export const storage = {
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error('LocalStorage set error:', error);
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    }
};

/**
 * Create an HTML element with attributes and children
 * @param {string} tag - HTML tag
 * @param {Object} attrs - Attributes
 * @param {...(Node|string)} children - Child nodes or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, ...children) {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'dataset') {
            Object.assign(element.dataset, value);
        } else {
            element.setAttribute(key, value);
        }
    }

    for (const child of children) {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            element.appendChild(child);
        }
    }

    return element;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * File size formatter
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Validate file type
 * @param {File} file - File to validate
 * @returns {{valid: boolean, type: string|null, error: string|null}}
 */
export function validateScoreFile(file) {
    const name = file.name.toLowerCase();
    const validTypes = {
        '.pdf': 'pdf',
        '.musicxml': 'musicxml',
        '.xml': 'musicxml',
        '.mxl': 'mxl'
    };

    for (const [ext, type] of Object.entries(validTypes)) {
        if (name.endsWith(ext)) {
            return { valid: true, type, error: null };
        }
    }

    return {
        valid: false,
        type: null,
        error: 'Invalid file type. Supported formats: PDF, MusicXML (.musicxml, .xml), MXL'
    };
}

/**
 * Get file extension
 * @param {string} filename - Filename
 * @returns {string} Extension without dot
 */
export function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

/**
 * Clamp a number between min and max
 * @param {number} num - Number to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
}

/**
 * Calculate moving average
 * @param {number[]} values - Array of values
 * @param {number} windowSize - Window size
 * @returns {number} Average
 */
export function movingAverage(values, windowSize) {
    if (values.length === 0) return 0;
    const window = values.slice(-windowSize);
    return window.reduce((a, b) => a + b, 0) / window.length;
}

/**
 * Request fullscreen for an element
 * @param {HTMLElement} element - Element to fullscreen
 */
export function requestFullscreen(element) {
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
}

/**
 * Exit fullscreen
 */
export function exitFullscreen() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

/**
 * Check if currently in fullscreen
 * @returns {boolean}
 */
export function isFullscreen() {
    return !!(document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement);
}
