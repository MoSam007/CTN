/**
 * components/gauge.js - SVG Radial Gauge Component for Risk Score
 * Animated, accessible, themeable gauge with color bands
 */

//--------------------------------------------------
// Gauge Class
//--------------------------------------------------
export class RadialGauge {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) {
            console.error('Gauge container not found');
            return;
        }

        this.options = {
            min: options.min || 0,
            max: options.max || 100,
            startAngle: options.startAngle || -135,
            endAngle: options.endAngle || 135,
            size: options.size || 200,
            strokeWidth: options.strokeWidth || 16,
            showValue: options.showValue !== false,
            showLabel: options.showLabel !== false,
            label: options.label || 'RISK SCORE',
            animate: options.animate !== false,
            animateDuration: options.animateDuration || 1000,
            colorBands: options.colorBands || [
                { from: 0, to: 30, color: '#43A047', label: 'SAFE' },
                { from: 30, to: 50, color: '#1E88E5', label: 'WATCH' },
                { from: 50, to: 70, color: '#FB8C00', label: 'WARNING' },
                { from: 70, to: 100, color: '#E53935', label: 'EMERGENCY' }
            ],
            ...options
        };

        this.currentValue = this.options.min;
        this.targetValue = this.options.min;
        this.animationFrame = null;

        this._createSVG();
        this._createColorBands();
        this._createNeedle();
        this._createLabels();

        // Initial render
        this.setValue(this.options.min, false);
    }

    _createSVG() {
        const { size, strokeWidth } = this.options;
        const radius = (size - strokeWidth) / 2;

        this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svg.setAttribute('width', size);
        this.svg.setAttribute('height', size);
        this.svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        this.svg.style.cssText = 'display:block; margin:0 auto;';

        // Background track
        this.track = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this.track.setAttribute('fill', 'none');
        this.track.setAttribute('stroke', 'var(--color-border, #E0E0E0)');
        this.track.setAttribute('stroke-width', strokeWidth);
        this.track.setAttribute('stroke-linecap', 'round');
        this.svg.appendChild(this.track);

        this.container.appendChild(this.svg);
        this.container.style.width = `${size}px`;
        this.container.style.height = `${size}px`;
    }

    _createColorBands() {
        const { size, strokeWidth, startAngle, endAngle, colorBands } = this.options;
        const radius = (size - strokeWidth) / 2;
        const center = size / 2;

        this.bandPaths = [];

        colorBands.forEach((band, index) => {
            const bandStart = this._valueToAngle(band.from);
            const bandEnd = this._valueToAngle(band.to);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', band.color);
            path.setAttribute('stroke-width', strokeWidth);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('opacity', '0.3');
            path.setAttribute('data-band-index', index);

            const d = this._arcPath(center, center, radius, bandStart, bandEnd);
            path.setAttribute('d', d);

            this.svg.insertBefore(path, this.track);
            this.bandPaths.push(path);
        });
    }

    _createNeedle() {
        const { size, strokeWidth } = this.options;
        const radius = (size - strokeWidth) / 2;
        const center = size / 2;
        const needleLength = radius * 0.85;

        // Needle group
        this.needleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.needleGroup.setAttribute('class', 'gauge-needle');
        this.needleGroup.style.transformOrigin = `${center}px ${center}px`;
        this.needleGroup.style.transition = this.options.animate
            ? `transform ${this.options.animateDuration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
            : 'none';

        // Needle line
        this.needle = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.needle.setAttribute('x1', center);
        this.needle.setAttribute('y1', center);
        this.needle.setAttribute('x2', center);
        this.needle.setAttribute('y2', center - needleLength);
        this.needle.setAttribute('stroke', 'var(--color-text-primary, #212121)');
        this.needle.setAttribute('stroke-width', 3);
        this.needle.setAttribute('stroke-linecap', 'round');

        // Needle base circle
        this.needleBase = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.needleBase.setAttribute('cx', center);
        this.needleBase.setAttribute('cy', center);
        this.needleBase.setAttribute('r', strokeWidth / 2 + 2);
        this.needleBase.setAttribute('fill', 'var(--color-text-primary, #212121)');

        this.needleGroup.appendChild(this.needle);
        this.needleGroup.appendChild(this.needleBase);
        this.svg.appendChild(this.needleGroup);
    }

    _createLabels() {
        const { size, min, max, colorBands, label } = this.options;
        const center = size / 2;
        const radius = (size - this.options.strokeWidth) / 2;

        // Center value label
        if (this.options.showValue) {
            this.valueText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            this.valueText.setAttribute('x', center);
            this.valueText.setAttribute('y', center + radius * 0.1);
            this.valueText.setAttribute('text-anchor', 'middle');
            this.valueText.setAttribute('dominant-baseline', 'middle');
            this.valueText.setAttribute('font-size', radius * 0.35);
            this.valueText.setAttribute('font-weight', '700');
            this.valueText.setAttribute('fill', 'var(--color-text-primary, #212121)');
            this.valueText.textContent = this.currentValue;
            this.svg.appendChild(this.valueText);
        }

        // Label below value
        if (this.options.showLabel) {
            this.labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            this.labelText.setAttribute('x', center);
            this.labelText.setAttribute('y', center + radius * 0.45);
            this.labelText.setAttribute('text-anchor', 'middle');
            this.labelText.setAttribute('dominant-baseline', 'middle');
            this.labelText.setAttribute('font-size', radius * 0.12);
            this.labelText.setAttribute('font-weight', '500');
            this.labelText.setAttribute('fill', 'var(--color-text-secondary, #757575)');
            this.labelText.setAttribute('text-transform', 'uppercase');
            this.labelText.setAttribute('letter-spacing', '1px');
            this.labelText.textContent = label;
            this.svg.appendChild(this.labelText);
        }

        // Band labels (optional - show at edges)
        this.bandLabelTexts = colorBands.map((band, i) => {
            if (i === 0 || i === colorBands.length - 1) {
                const angle = this._valueToAngle(i === 0 ? band.from : band.to);
                const labelRadius = radius * 1.25;
                const x = center + labelRadius * Math.cos(angle * Math.PI / 180);
                const y = center + labelRadius * Math.sin(angle * Math.PI / 180);

                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', x);
                text.setAttribute('y', y);
                text.setAttribute('text-anchor', i === 0 ? 'start' : 'end');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('font-size', radius * 0.08);
                text.setAttribute('fill', band.color);
                text.setAttribute('font-weight', '600');
                text.textContent = band.label;
                this.svg.appendChild(text);
                return text;
            }
            return null;
        }).filter(Boolean);
    }

    _arcPath(cx, cy, radius, startAngle, endAngle) {
        const start = this._polarToCartesian(cx, cy, radius, startAngle);
        const end = this._polarToCartesian(cx, cy, radius, endAngle);

        const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

        return [
            'M', start.x, start.y,
            'A', radius, radius, 0, largeArcFlag, 1, end.x, end.y
        ].join(' ');
    }

    _polarToCartesian(cx, cy, radius, angle) {
        return {
            x: cx + radius * Math.cos(angle * Math.PI / 180),
            y: cy + radius * Math.sin(angle * Math.PI / 180)
        };
    }

    _valueToAngle(value) {
        const { startAngle, endAngle, min, max } = this.options;
        const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
        return startAngle + normalized * (endAngle - startAngle);
    }

    //--------------------------------------------------
    // Public API
    //--------------------------------------------------
    setValue(value, animate = true) {
        this.targetValue = Math.max(this.options.min, Math.min(this.options.max, value));

        if (animate && this.options.animate) {
            this._animateToTarget();
        } else {
            this.currentValue = this.targetValue;
            this._updateNeedle();
            this._updateValueDisplay();
            this._updateBandHighlight();
        }
    }

    _animateToTarget() {
        const start = this.currentValue;
        const end = this.targetValue;
        const duration = this.options.animateDuration;
        const startTime = performance.now();

        const animate = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);

            // Easing: ease-out elastic
            const eased = progress === 1 ? 1 :
                1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);

            this.currentValue = start + (end - start) * eased;
            this._updateNeedle();
            this._updateValueDisplay();
            this._updateBandHighlight();

            if (progress < 1) {
                this.animationFrame = requestAnimationFrame(animate);
            }
        };

        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = requestAnimationFrame(animate);
    }

    _updateNeedle() {
        const angle = this._valueToAngle(this.currentValue);
        this.needleGroup.style.transform = `rotate(${angle}deg)`;
    }

    _updateValueDisplay() {
        if (this.valueText) {
            this.valueText.textContent = Math.round(this.currentValue);
            // Color the value based on current band
            const band = this._getCurrentBand();
            if (band) {
                this.valueText.setAttribute('fill', band.color);
            }
        }
    }

    _updateBandHighlight() {
        const currentBand = this._getCurrentBand();

        this.bandPaths.forEach((path, index) => {
            if (currentBand && index === currentBand.index) {
                path.setAttribute('opacity', '1');
                path.setAttribute('stroke-width', this.options.strokeWidth + 4);
            } else {
                path.setAttribute('opacity', '0.3');
                path.setAttribute('stroke-width', this.options.strokeWidth);
            }
        });
    }

    _getCurrentBand() {
        for (let i = 0; i < this.options.colorBands.length; i++) {
            const band = this.options.colorBands[i];
            if (this.currentValue >= band.from && this.currentValue < band.to) {
                return { ...band, index: i };
            }
        }
        // Handle max value
        if (this.currentValue >= this.options.max) {
            const lastBand = this.options.colorBands[this.options.colorBands.length - 1];
            return { ...lastBand, index: this.options.colorBands.length - 1 };
        }
        return null;
    }

    setOptions(options) {
        Object.assign(this.options, options);
        // Re-render would be needed for structural changes
    }

    destroy() {
        cancelAnimationFrame(this.animationFrame);
        if (this.svg && this.svg.parentNode) {
            this.svg.parentNode.removeChild(this.svg);
        }
    }
}

//--------------------------------------------------
// Linear Gauge (Horizontal Progress Bar Style)
//--------------------------------------------------
export class LinearGauge {
    constructor(container, options = {}) {
        this.container = typeof container === 'string' ? document.getElementById(container) : container;
        if (!this.container) return;

        this.options = {
            min: options.min || 0,
            max: options.max || 100,
            height: options.height || 20,
            showLabels: options.showLabels !== false,
            colorBands: options.colorBands || [
                { from: 0, to: 30, color: '#43A047' },
                { from: 30, to: 50, color: '#1E88E5' },
                { from: 50, to: 70, color: '#FB8C00' },
                { from: 70, to: 100, color: '#E53935' }
            ],
            ...options
        };

        this.currentValue = this.options.min;
        this._createHTML();
    }

    _createHTML() {
        this.container.innerHTML = `
            <div class="linear-gauge" style="height: ${this.options.height}px;">
                <div class="gauge-track" style="background: var(--color-border, #E0E0E0);">
                    <div class="gauge-fill" style="width: 0%; height: 100%; transition: width 0.5s ease-out;"></div>
                </div>
                ${this.options.showLabels ? '<div class="gauge-labels"></div>' : ''}
            </div>
        `;

        this.track = this.container.querySelector('.gauge-track');
        this.fill = this.container.querySelector('.gauge-fill');
        this.labels = this.container.querySelector('.gauge-labels');

        this._createColorBands();
        this._createLabels();
    }

    _createColorBands() {
        this.options.colorBands.forEach(band => {
            const bandEl = document.createElement('div');
            bandEl.className = 'gauge-band';
            bandEl.style.cssText = `
                position: absolute;
                top: 0;
                left: ${this._valueToPercent(band.from)}%;
                width: ${this._valueToPercent(band.to) - this._valueToPercent(band.from)}%;
                height: 100%;
                background: ${band.color};
                opacity: 0.3;
                pointer-events: none;
            `;
            this.track.appendChild(bandEl);
        });
    }

    _createLabels() {
        if (!this.labels) return;

        this.labels.innerHTML = this.options.colorBands.map(band => `
            <span style="
                position: absolute;
                left: ${this._valueToPercent(band.from)}%;
                transform: translateX(-50%);
                font-size: 10px;
                color: ${band.color};
                font-weight: 600;
                white-space: nowrap;
            ">${band.label || band.from}</span>
        `).join('');
    }

    _valueToPercent(value) {
        return ((value - this.options.min) / (this.options.max - this.options.min)) * 100;
    }

    setValue(value, animate = true) {
        this.currentValue = Math.max(this.options.min, Math.min(this.options.max, value));
        const percent = this._valueToPercent(this.currentValue);

        if (animate) {
            this.fill.style.transition = 'width 0.5s ease-out';
        } else {
            this.fill.style.transition = 'none';
        }

        this.fill.style.width = `${percent}%`;

        // Update fill color based on current band
        const band = this.options.colorBands.find(b =>
            this.currentValue >= b.from && this.currentValue < b.to
        ) || this.options.colorBands[this.options.colorBands.length - 1];

        this.fill.style.background = band.color;
    }

    destroy() {
        this.container.innerHTML = '';
    }
}

//--------------------------------------------------
// Factory Functions
//--------------------------------------------------
export function createRadialGauge(container, options) {
    return new RadialGauge(container, options);
}

export function createLinearGauge(container, options) {
    return new LinearGauge(container, options);
}

//--------------------------------------------------
// CSS Styles
//--------------------------------------------------
const gaugeStyles = `
<style id="ctn-gauge-styles">
.linear-gauge {
    position: relative;
    width: 100%;
    border-radius: 999px;
    overflow: hidden;
}
.gauge-track {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    overflow: hidden;
}
.gauge-fill {
    border-radius: inherit;
    box-shadow: inset 0 -2px 4px rgba(0,0,0,0.1);
}
.gauge-bands {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
.gauge-band {
    border-radius: inherit;
}
.gauge-labels {
    position: relative;
    height: 20px;
    margin-top: 4px;
    pointer-events: none;
}
.gauge-labels span {
    position: absolute;
    top: 0;
}
</style>
`;

if (!document.getElementById('ctn-gauge-styles')) {
    document.head.insertAdjacentHTML('beforeend', gaugeStyles);
}