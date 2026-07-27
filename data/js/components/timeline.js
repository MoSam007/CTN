/**
 * components/timeline.js - Horizontal Anomaly/Alert Timeline Component
 * Displays events as scrollable cards with severity indicators
 */

//--------------------------------------------------
// Timeline Class
//--------------------------------------------------
export class Timeline {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) {
            console.error('Timeline container not found');
            return;
        }

        this.options = {
            events: options.events || [],
            maxEvents: options.maxEvents || 50,
            showTime: options.showTime !== false,
            showType: options.showType !== false,
            showDetails: options.showDetails !== false,
            clickable: options.clickable !== false,
            typeColors: options.typeColors || {
                'safe_arrival': '#43A047',
                'safe_departure': '#1E88E5',
                'route_deviation': '#FB8C00',
                'long_stop': '#8E24AA',
                'running': '#E53935',
                'wandering': '#FF8F00',
                'leaving_school': '#E53935',
                'leaving_safe_zone': '#E53935',
                'night_movement': '#5C6BC0',
                'repeated_movement': '#00ACC1',
                'unexpected_movement': '#FB8C00',
                'panic': '#C62828',
                'low_battery': '#FB8C00',
                'wifi_lost': '#757575',
                'gps_lost': '#757575',
                'default': '#757575'
            },
            typeLabels: options.typeLabels || {
                'safe_arrival': 'Safe Arrival',
                'safe_departure': 'Safe Departure',
                'route_deviation': 'Route Deviation',
                'long_stop': 'Long Stop',
                'running': 'Running',
                'wandering': 'Wandering',
                'leaving_school': 'Leaving School',
                'leaving_safe_zone': 'Leaving Safe Zone',
                'night_movement': 'Night Movement',
                'repeated_movement': 'Repeated Movement',
                'unexpected_movement': 'Unexpected Movement',
                'panic': 'Panic Button',
                'low_battery': 'Low Battery',
                'wifi_lost': 'WiFi Lost',
                'gps_lost': 'GPS Lost'
            },
            typeIcons: options.typeIcons || {
                'safe_arrival': '🏠',
                'safe_departure': '🚶',
                'route_deviation': '⚠️',
                'long_stop': '⏸️',
                'running': '🏃',
                'wandering': '🔄',
                'leaving_school': '🏫',
                'leaving_safe_zone': '📍',
                'night_movement': '🌙',
                'repeated_movement': '🔁',
                'unexpected_movement': '❓',
                'panic': '🚨',
                'low_battery': '🔋',
                'wifi_lost': '📶',
                'gps_lost': '📡'
            },
            ...options
        };

        this.events = [...this.options.events];
        this._createHTML();
        this.render();
    }

    _createHTML() {
        this.container.innerHTML = `
            <div class="timeline-container">
                <div class="timeline-track"></div>
                <div class="timeline-events" role="list" aria-label="Event timeline"></div>
            </div>
        `;

        this.track = this.container.querySelector('.timeline-track');
        this.eventsContainer = this.container.querySelector('.timeline-events');
    }

    //--------------------------------------------------
    // Public API
    //--------------------------------------------------
    addEvent(event) {
        // Ensure event has required fields
        const normalizedEvent = {
            id: event.id || Date.now() + Math.random(),
            type: event.type || 'default',
            timestamp: event.timestamp || Date.now(),
            message: event.message || '',
            details: event.details || '',
            location: event.location || null,
            read: event.read || false,
            ...event
        };

        this.events.unshift(normalizedEvent);

        // Limit events
        if (this.events.length > this.options.maxEvents) {
            this.events = this.events.slice(0, this.options.maxEvents);
        }

        this.render();
        return normalizedEvent;
    }

    removeEvent(eventId) {
        this.events = this.events.filter(e => e.id !== eventId);
        this.render();
    }

    clear() {
        this.events = [];
        this.render();
    }

    setEvents(events) {
        this.events = [...events].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        this.render();
    }

    getEvents() {
        return [...this.events];
    }

    //--------------------------------------------------
    // Rendering
    //--------------------------------------------------
    render() {
        if (!this.eventsContainer) return;

        if (this.events.length === 0) {
            this.eventsContainer.innerHTML = `
                <div class="timeline-empty">
                    <span class="timeline-empty-icon">📭</span>
                    <p>No events recorded</p>
                </div>
            `;
            return;
        }

        this.eventsContainer.innerHTML = this.events.map((event, index) => this._renderEvent(event, index)).join('');

        // Add click handlers if clickable
        if (this.options.clickable) {
            this.eventsContainer.querySelectorAll('.timeline-event').forEach((el, index) => {
                el.addEventListener('click', () => {
                    const event = this.events[index];
                    this.container.dispatchEvent(new CustomEvent('timeline-event-click', {
                        detail: { event, index },
                        bubbles: true
                    }));
                });
            });
        }
    }

    _renderEvent(event, index) {
        const color = this.options.typeColors[event.type] || this.options.typeColors.default;
        const label = this.options.typeLabels[event.type] || event.type;
        const icon = this.options.typeIcons[event.type] || '📌';
        const time = this._formatTime(event.timestamp);
        const date = this._formatDate(event.timestamp);
        const isUnread = !event.read;

        const detailsHtml = this.options.showDetails && event.details
            ? `<div class="timeline-event-details">${this._escapeHtml(event.details)}</div>`
            : '';

        const locationHtml = event.location
            ? `<div class="timeline-event-location">📍 ${event.location.lat?.toFixed(6)}, ${event.location.lng?.toFixed(6)}</div>`
            : '';

        return `
            <article class="timeline-event${isUnread ? ' unread' : ''}" data-event-id="${event.id}" data-index="${index}" role="listitem">
                <div class="timeline-event-marker" style="background: ${color};"></div>
                <div class="timeline-event-content">
                    <div class="timeline-event-header">
                        <span class="timeline-event-icon" title="${label}">${icon}</span>
                        <span class="timeline-event-type" style="color: ${color}">${label}</span>
                        ${this.options.showTime ? `
                            <time class="timeline-event-time" datetime="${new Date(event.timestamp).toISOString()}">${time}</time>
                        ` : ''}
                    </div>
                    <div class="timeline-event-message">${this._escapeHtml(event.message)}</div>
                    ${detailsHtml}
                    ${locationHtml}
                    ${this.options.showTime ? `<div class="timeline-event-date">${date}</div>` : ''}
                </div>
                ${isUnread ? '<div class="timeline-event-unread-dot" aria-hidden="true"></div>' : ''}
            </article>
        `;
    }

    _formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    _formatDate(timestamp) {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    //--------------------------------------------------
    // Mark as Read
    //--------------------------------------------------
    markAsRead(eventId) {
        const event = this.events.find(e => e.id === eventId);
        if (event) {
            event.read = true;
            this.render();
        }
    }

    markAllAsRead() {
        this.events.forEach(e => e.read = true);
        this.render();
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

//--------------------------------------------------
// Paginated Timeline (for large datasets)
//--------------------------------------------------
export class PaginatedTimeline extends Timeline {
    constructor(container, options = {}) {
        super(container, { ...options, clickable: true });
        this.pageSize = options.pageSize || 20;
        this.currentPage = 0;
        this.totalPages = 0;
        this._updatePagination();
    }

    _updatePagination() {
        this.totalPages = Math.ceil(this.events.length / this.pageSize);
    }

    getPageEvents(page = this.currentPage) {
        const start = page * this.pageSize;
        return this.events.slice(start, start + this.pageSize);
    }

    render(page = this.currentPage) {
        this.currentPage = Math.max(0, Math.min(page, this.totalPages - 1));
        const pageEvents = this.getPageEvents(this.currentPage);

        if (!this.eventsContainer) return;

        if (pageEvents.length === 0) {
            this.eventsContainer.innerHTML = `
                <div class="timeline-empty">
                    <span class="timeline-empty-icon">📭</span>
                    <p>No events on this page</p>
                </div>
                ${this._renderPagination()}
            `;
            return;
        }

        this.eventsContainer.innerHTML = pageEvents.map((event, index) => this._renderEvent(event, index)).join('') + this._renderPagination();

        // Add click handlers
        if (this.options.clickable) {
            this.eventsContainer.querySelectorAll('.timeline-event').forEach((el, index) => {
                el.addEventListener('click', () => {
                    const event = pageEvents[index];
                    this.container.dispatchEvent(new CustomEvent('timeline-event-click', {
                        detail: { event, index: this.currentPage * this.pageSize + index },
                        bubbles: true
                    }));
                });
            });
        }

        // Pagination click handlers
        this.eventsContainer.querySelectorAll('.timeline-page-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const page = parseInt(e.target.dataset.page, 10);
                if (!isNaN(page)) {
                    this.render(page);
                }
            });
        });
    }

    _renderPagination() {
        if (this.totalPages <= 1) return '';

        const pages = [];
        const current = this.currentPage;

        // Previous button
        pages.push(`<button class="timeline-page-btn ${current === 0 ? 'disabled' : ''}" data-page="${current - 1}" aria-label="Previous page">‹</button>`);

        // Page numbers
        const maxVisible = 5;
        let start = Math.max(0, current - Math.floor(maxVisible / 2));
        let end = Math.min(this.totalPages, start + maxVisible);

        if (end - start < maxVisible) {
            start = Math.max(0, end - maxVisible);
        }

        for (let i = start; i < end; i++) {
            pages.push(`<button class="timeline-page-btn ${i === current ? 'active' : ''}" data-page="${i}" aria-label="Page ${i + 1}">${i + 1}</button>`);
        }

        // Next button
        pages.push(`<button class="timeline-page-btn ${current >= this.totalPages - 1 ? 'disabled' : ''}" data-page="${current + 1}" aria-label="Next page">›</button>`);

        return `<div class="timeline-pagination">${pages.join('')}</div>`;
    }

    nextPage() {
        this.render(this.currentPage + 1);
    }

    prevPage() {
        this.render(this.currentPage - 1);
    }

    goToPage(page) {
        this.render(page);
    }
}

//--------------------------------------------------
// Factory Functions
//--------------------------------------------------
export function createTimeline(container, options) {
    return new Timeline(container, options);
}

export function createPaginatedTimeline(container, options) {
    return new PaginatedTimeline(container, options);
}

//--------------------------------------------------
// CSS Styles
//--------------------------------------------------
const timelineStyles = `
<style id="ctn-timeline-styles">
.timeline-container {
    position: relative;
    padding-left: 24px;
}
.timeline-track {
    position: absolute;
    left: 7px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: linear-gradient(180deg, var(--color-border, #E0E0E0) 0%, var(--color-border-light, #F5F5F5) 100%);
    border-radius: 1px;
}
.timeline-events {
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.timeline-event {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    background: var(--color-surface, #FFFFFF);
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 1px rgba(0,0,0,0.03);
    border: 1px solid var(--color-border, #E0E0E0);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    cursor: pointer;
}
.timeline-event:hover {
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04);
    border-color: var(--color-primary-light, #BBDEFB);
}
.timeline-event.unread {
    border-left: 3px solid var(--color-primary, #1E88E5);
}
.timeline-event-marker {
    position: absolute;
    left: -24px;
    top: 16px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 3px solid var(--color-surface, #FFFFFF);
    box-shadow: 0 0 0 2px currentColor;
    flex-shrink: 0;
    z-index: 1;
}
.timeline-event-content {
    flex: 1;
    min-width: 0;
}
.timeline-event-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
}
.timeline-event-icon {
    font-size: 16px;
    line-height: 1;
}
.timeline-event-type {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}
.timeline-event-time {
    font-size: 11px;
    color: var(--color-text-secondary, #757575);
    font-variant-numeric: tabular-nums;
    margin-left: auto;
}
.timeline-event-message {
    font-size: 14px;
    color: var(--color-text-primary, #212121);
    line-height: 1.4;
    margin-bottom: 4px;
}
.timeline-event-details {
    font-size: 12px;
    color: var(--color-text-secondary, #757575);
    line-height: 1.4;
    margin-bottom: 4px;
    padding: 8px 12px;
    background: var(--color-surface-variant, #F5F5F5);
    border-radius: 8px;
}
.timeline-event-location {
    font-size: 11px;
    color: var(--color-text-tertiary, #9E9E9E);
    font-family: monospace;
    margin-bottom: 4px;
}
.timeline-event-date {
    font-size: 10px;
    color: var(--color-text-tertiary, #9E9E9E);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.timeline-event-unread-dot {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 8px;
    background: var(--color-primary, #1E88E5);
    border-radius: 50%;
    flex-shrink: 0;
}
.timeline-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    color: var(--color-text-tertiary, #9E9E9E);
    text-align: center;
}
.timeline-empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
}
.timeline-empty p {
    margin: 0;
    font-size: 14px;
}
.timeline-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border, #E0E0E0);
}
.timeline-page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--color-border, #E0E0E0);
    border-radius: 8px;
    background: var(--color-surface, #FFFFFF);
    color: var(--color-text-primary, #212121);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}
.timeline-page-btn:hover:not(.disabled) {
    background: var(--color-primary-light, #E3F2FD);
    border-color: var(--color-primary, #1E88E5);
    color: var(--color-primary, #1E88E5);
}
.timeline-page-btn.active {
    background: var(--color-primary, #1E88E5);
    border-color: var(--color-primary, #1E88E5);
    color: white;
}
.timeline-page-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    :root[data-theme="dark"] .timeline-track {
        background: linear-gradient(180deg, var(--color-border, #424242) 0%, var(--color-border-light, #303030) 100%);
    }
    :root[data-theme="dark"] .timeline-event {
        background: var(--color-surface, #1E1E1E);
        border-color: var(--color-border, #333);
        box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.15);
    }
    :root[data-theme="dark"] .timeline-event:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2);
    }
    :root[data-theme="dark"] .timeline-event-marker {
        border-color: var(--color-surface, #1E1E1E);
    }
    :root[data-theme="dark"] .timeline-event-details {
        background: var(--color-surface-variant, #2A2A2A);
    }
    :root[data-theme="dark"] .timeline-page-btn {
        background: var(--color-surface, #1E1E1E);
        border-color: var(--color-border, #333);
        color: var(--color-text-primary, #E0E0E0);
    }
    :root[data-theme="dark"] .timeline-page-btn:hover:not(.disabled) {
        background: var(--color-primary-dark, #1565C0);
        border-color: var(--color-primary, #1E88E5);
    }
    :root[data-theme="dark"] .timeline-pagination {
        border-color: var(--color-border, #333);
    }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
    .timeline-event,
    .timeline-page-btn {
        transition: none;
    }
}
</style>
`;

if (!document.getElementById('ctn-timeline-styles')) {
    document.head.insertAdjacentHTML('beforeend', timelineStyles);
}