// Pure SVG Sparkline and Interactive Hydrograph Chart Generator
// Lightweight, responsive, zero external chart dependencies

export function renderSparklineSVG(points, width = 120, height = 32, options = {}) {
  if (!points || points.length < 2) {
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg empty" aria-hidden="true">
        <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="var(--border-color)" stroke-dasharray="3,3" />
      </svg>
    `;
  }

  // Filter to last 24-48 hours
  const now = new Date(points[points.length - 1].time).getTime();
  const cutoff = now - (options.hours || 48) * 3600 * 1000;
  const filtered = points.filter(p => new Date(p.time).getTime() >= cutoff);
  const activePoints = filtered.length >= 2 ? filtered : points.slice(-30);

  const values = activePoints.map(p => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;

  const padY = 4;
  const usableHeight = height - padY * 2;
  const usableWidth = width - 4;

  const coords = activePoints.map((p, idx) => {
    const x = 2 + (idx / (activePoints.length - 1)) * usableWidth;
    const y = range === 0 
      ? height / 2 
      : height - padY - ((p.value - minVal) / range) * usableHeight;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const pathD = coords.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
  }, '');

  const areaD = `${pathD} L ${coords[coords.length - 1].x},${height} L ${coords[0].x},${height} Z`;

  const strokeColor = options.color || 'var(--river-blue)';
  const gradId = `spark-grad-${Math.random().toString(36).substring(2, 9)}`;

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="sparkline-svg" aria-label="Recent flow hydrograph" role="img">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3" />
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#${gradId})" />
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${coords[coords.length - 1].x}" cy="${coords[coords.length - 1].y}" r="2.5" fill="${strokeColor}" />
    </svg>
  `;
}

export class InteractiveHydrograph {
  constructor(container, points, options = {}) {
    this.container = container;
    this.rawPoints = points || [];
    this.options = options;
    this.selectedHours = options.hours || 48;
    this.render();
  }

  setHours(hours) {
    this.selectedHours = hours;
    this.render();
  }

  render() {
    if (!this.rawPoints.length) {
      this.container.innerHTML = `
        <div class="chart-empty-state">
          <p>No historical telemetry available for this time window.</p>
        </div>
      `;
      return;
    }

    const now = new Date(this.rawPoints[this.rawPoints.length - 1].time).getTime();
    const cutoff = now - this.selectedHours * 3600 * 1000;
    const points = this.rawPoints.filter(p => new Date(p.time).getTime() >= cutoff);

    if (points.length < 2) {
      this.container.innerHTML = `
        <div class="chart-empty-state">
          <p>Insufficient recent data points for the selected range.</p>
        </div>
      `;
      return;
    }

    const values = points.map(p => p.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const valRange = maxVal - minVal;

    // ViewBox dimensions
    const width = 640;
    const height = 260;
    const padLeft = 54;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 34;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Y Axis scaling with headroom
    const yMin = Math.max(0, minVal - (valRange === 0 ? 5 : valRange * 0.1));
    const yMax = maxVal + (valRange === 0 ? 5 : valRange * 0.15);
    const yRange = yMax - yMin;

    const tMin = new Date(points[0].time).getTime();
    const tMax = new Date(points[points.length - 1].time).getTime();
    const tRange = tMax - tMin || 1;

    const coords = points.map(p => {
      const t = new Date(p.time).getTime();
      const x = padLeft + ((t - tMin) / tRange) * plotW;
      const y = padTop + plotH - ((p.value - yMin) / yRange) * plotH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), time: p.time, value: p.value };
    });

    const pathD = coords.reduce((acc, pt, i) => {
      return i === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
    }, '');

    const areaD = `${pathD} L ${padLeft + plotW},${padTop + plotH} L ${padLeft},${padTop + plotH} Z`;

    // Horizontal grid lines (4-5 levels)
    const gridCount = 4;
    const yTicks = [];
    for (let i = 0; i <= gridCount; i++) {
      const val = yMin + (yRange / gridCount) * i;
      const yPos = padTop + plotH - (i / gridCount) * plotH;
      yTicks.push({ val: val.toFixed(val >= 10 ? 0 : 1), y: yPos });
    }

    // Time ticks (X axis)
    const xTicks = [];
    const xCount = 4;
    for (let i = 0; i <= xCount; i++) {
      const t = tMin + (tRange / xCount) * i;
      const xPos = padLeft + (i / xCount) * plotW;
      const d = new Date(t);
      const timeStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + 
                      d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      xTicks.push({ label: timeStr, x: xPos });
    }

    const strokeColor = 'var(--river-blue)';
    const gradId = `hydro-grad-${Math.random().toString(36).substring(2, 9)}`;

    this.container.innerHTML = `
      <div class="chart-wrapper">
        <div class="chart-header-stats">
          <div class="stat-pill"><span class="lbl">Current:</span> <strong>${points[points.length - 1].value.toLocaleString()} cfs</strong></div>
          <div class="stat-pill"><span class="lbl">Max:</span> <strong>${maxVal.toLocaleString()} cfs</strong></div>
          <div class="stat-pill"><span class="lbl">Min:</span> <strong>${minVal.toLocaleString()} cfs</strong></div>
          <div class="stat-pill"><span class="lbl">Avg:</span> <strong>${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)} cfs</strong></div>
        </div>

        <div class="svg-container">
          <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="hydrograph-svg" aria-label="Detailed streamflow hydrograph" role="img">
            <defs>
              <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.38" />
                <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.02" />
              </linearGradient>
            </defs>

            <!-- Grid Lines and Y-Axis Labels -->
            ${yTicks.map(t => `
              <line x1="${padLeft}" y1="${t.y}" x2="${width - padRight}" y2="${t.y}" stroke="var(--chart-grid)" stroke-width="1" stroke-dasharray="2,2" />
              <text x="${padLeft - 8}" y="${t.y + 4}" text-anchor="end" class="chart-axis-text">${t.val}</text>
            `).join('')}

            <!-- X-Axis Labels -->
            ${xTicks.map((t, idx) => `
              <line x1="${t.x}" y1="${padTop + plotH}" x2="${t.x}" y2="${padTop + plotH + 5}" stroke="var(--chart-axis)" stroke-width="1" />
              <text x="${t.x}" y="${padTop + plotH + 18}" text-anchor="${idx === 0 ? 'start' : idx === xTicks.length - 1 ? 'end' : 'middle'}" class="chart-axis-text">${t.label}</text>
            `).join('')}

            <!-- Axis baseline -->
            <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="var(--chart-axis)" stroke-width="1.5" />
            <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${padTop + plotH}" stroke="var(--chart-axis)" stroke-width="1.5" />

            <!-- Y Axis Title -->
            <text x="14" y="${padTop + plotH / 2}" transform="rotate(-90 14 ${padTop + plotH / 2})" text-anchor="middle" class="chart-axis-title">Discharge (cfs)</text>

            <!-- Flow Area & Path -->
            <path d="${areaD}" fill="url(#${gradId})" />
            <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

            <!-- Interactive Crosshair Elements -->
            <line id="crosshair-v" x1="0" y1="${padTop}" x2="0" y2="${padTop + plotH}" stroke="var(--river-cyan)" stroke-width="1.5" stroke-dasharray="3,3" opacity="0" />
            <circle id="crosshair-dot" cx="0" cy="0" r="5" fill="var(--river-cyan)" stroke="var(--bg-card)" stroke-width="2" opacity="0" />
          </svg>

          <!-- Floating Tooltip Box -->
          <div id="chart-tooltip" class="chart-tooltip" style="display: none;">
            <div class="tooltip-time"></div>
            <div class="tooltip-value"></div>
          </div>
        </div>
      </div>
    `;

    this.attachInteractiveCrosshair(coords, padLeft, padRight, width);
  }

  attachInteractiveCrosshair(coords, padLeft, padRight, svgWidth) {
    const svg = this.container.querySelector('.hydrograph-svg');
    const vLine = this.container.querySelector('#crosshair-v');
    const dot = this.container.querySelector('#crosshair-dot');
    const tooltip = this.container.querySelector('#chart-tooltip');
    const wrapper = this.container.querySelector('.svg-container');

    if (!svg || !vLine || !dot || !tooltip) return;

    const onPointerMove = (e) => {
      const rect = svg.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      if (clientX < rect.left || clientX > rect.right) {
        hide();
        return;
      }

      const svgX = ((clientX - rect.left) / rect.width) * svgWidth;

      // Find nearest data point
      let nearest = coords[0];
      let minDiff = Math.abs(coords[0].x - svgX);

      for (let i = 1; i < coords.length; i++) {
        const diff = Math.abs(coords[i].x - svgX);
        if (diff < minDiff) {
          minDiff = diff;
          nearest = coords[i];
        }
      }

      if (!nearest) return;

      vLine.setAttribute('x1', nearest.x);
      vLine.setAttribute('x2', nearest.x);
      vLine.setAttribute('opacity', '1');

      dot.setAttribute('cx', nearest.x);
      dot.setAttribute('cy', nearest.y);
      dot.setAttribute('opacity', '1');

      const dateObj = new Date(nearest.time);
      const timeFmt = dateObj.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + 
                      dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

      tooltip.querySelector('.tooltip-time').textContent = timeFmt;
      tooltip.querySelector('.tooltip-value').textContent = `${nearest.value.toLocaleString()} cfs`;
      tooltip.style.display = 'block';

      // Tooltip positioning relative to wrapper
      const pixelX = ((nearest.x) / svgWidth) * rect.width;
      const pixelY = ((nearest.y) / 260) * rect.height;

      const tooltipWidth = tooltip.offsetWidth || 110;
      let left = pixelX - tooltipWidth / 2;
      if (left < 10) left = 10;
      if (left + tooltipWidth > rect.width - 10) left = rect.width - tooltipWidth - 10;

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(10, pixelY - 48)}px`;
    };

    const hide = () => {
      vLine.setAttribute('opacity', '0');
      dot.setAttribute('opacity', '0');
      tooltip.style.display = 'none';
    };

    svg.addEventListener('mousemove', onPointerMove);
    svg.addEventListener('mouseleave', hide);
    svg.addEventListener('touchstart', onPointerMove, { passive: true });
    svg.addEventListener('touchmove', onPointerMove, { passive: true });
    svg.addEventListener('touchend', hide);
  }
}
