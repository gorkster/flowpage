// South Platte River Flow Tracker - Main Application Logic
import { STATIONS, SECTIONS } from './stations.js';
import { fetchAllStationData, loadFromCache } from './api.js';
import { renderSparklineSVG, InteractiveHydrograph } from './charts.js';
import { WatershedMap } from './map.js';

class FlowApp {
  constructor() {
    this.stations = [...STATIONS];
    this.activeSection = 'all';
    this.activeAgency = 'all';
    this.searchQuery = '';
    this.activeView = 'journey';
    this.sortBy = 'order';
    this.sortAsc = true;
    this.isRefreshing = false;
    this.selectedStation = null;
    this.activeModalHydrograph = null;
    this.activeModalHours = 48;
    this.mapManager = null;
    this.refreshInterval = null;

    this.init();
  }

  async init() {
    this.initTheme();
    this.bindEvents();
    this.renderSectionChips();

    // Check if we have cached data to render immediately
    const cached = loadFromCache();
    if (cached && cached.stations) {
      this.stations = cached.stations;
      this.updateSummaryBar();
      this.render();
      this.updateLastRefreshTime(new Date(cached.updatedAt));
    } else {
      this.render(); // Render skeleton/initial list
    }

    // Initialize Map
    this.mapManager = new WatershedMap('map-container', {
      onSelectStation: (id) => this.openModal(id)
    });

    // Fetch fresh live data
    await this.refreshData();

    // Auto-refresh every 15 minutes
    this.refreshInterval = setInterval(() => {
      this.refreshData();
    }, 15 * 60 * 1000);
  }

  initTheme() {
    const saved = localStorage.getItem('flow_theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('flow_theme', next);
  }

  bindEvents() {
    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', () => this.toggleTheme());

    // Refresh button
    const refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshData());

    // View tabs
    const viewTabs = document.querySelectorAll('.view-switcher .tab-btn');
    viewTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Search input
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear-btn');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (searchClear) {
          searchClear.classList.toggle('visible', this.searchQuery.length > 0);
        }
        this.render();
      });
    }

    if (searchClear && searchInput) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        searchClear.classList.remove('visible');
        this.render();
      });
    }

    // Agency filter
    const agencyPills = document.querySelectorAll('.agency-pill');
    agencyPills.forEach(pill => {
      pill.addEventListener('click', () => {
        agencyPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeAgency = pill.getAttribute('data-agency');
        this.render();
      });
    });

    // Modal close events
    const modal = document.getElementById('station-modal');
    const closeBtn = document.getElementById('btn-close-modal');
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.close());
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        const rect = modal.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) modal.close();
      });
    }

    // Modal time range buttons
    const rangeBtns = document.querySelectorAll('.modal-range-btn');
    rangeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        rangeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const hours = parseInt(btn.getAttribute('data-hours'), 10);
        this.activeModalHours = hours;
        if (this.activeModalHydrograph) {
          this.activeModalHydrograph.setHours(hours);
        }
      });
    });

    // Reset Map View button
    const btnResetMap = document.getElementById('btn-reset-map');
    if (btnResetMap) {
      btnResetMap.addEventListener('click', () => {
        if (this.mapManager) this.mapManager.fitBounds();
      });
    }
  }

  renderSectionChips() {
    const container = document.getElementById('section-filter-chips');
    if (!container) return;

    container.innerHTML = SECTIONS.map(sec => `
      <button type="button" class="chip-btn ${this.activeSection === sec.id ? 'active' : ''}" data-section="${sec.id}">
        ${sec.label}
      </button>
    `).join('');

    container.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeSection = btn.getAttribute('data-section');
        this.render();
      });
    });
  }

  switchView(view) {
    this.activeView = view;
    document.querySelectorAll('.view-switcher .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-view') === view);
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${view}`);
    });

    if (view === 'map' && this.mapManager) {
      this.mapManager.init(this.getFilteredStations());
      this.mapManager.invalidateSize();
    }
  }

  async refreshData() {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    const refreshBtn = document.getElementById('btn-refresh');
    const icon = refreshBtn?.querySelector('svg');
    if (icon) icon.classList.add('spin-icon');

    try {
      const payload = await fetchAllStationData(this.stations);
      if (payload && payload.stations) {
        this.stations = payload.stations;
        this.updateSummaryBar();
        this.render();
        this.updateLastRefreshTime(new Date(payload.updatedAt));

        if (this.mapManager) {
          this.mapManager.updateMarkers(this.stations);
        }

        // If modal is open, refresh its data
        if (this.selectedStation) {
          const fresh = this.stations.find(s => s.id === this.selectedStation.id);
          if (fresh) this.openModal(fresh.id, false);
        }
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      this.isRefreshing = false;
      if (icon) icon.classList.remove('spin-icon');
    }
  }

  updateLastRefreshTime(date) {
    const el = document.getElementById('last-updated');
    if (!el || !date) return;
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    el.textContent = `Updated ${timeStr}`;
  }

  updateSummaryBar() {
    // 1. Total Active Stations
    const activeCount = this.stations.filter(s => s.flow !== null && s.flow !== undefined).length;
    const totalEl = document.getElementById('stat-total-stations');
    if (totalEl) totalEl.textContent = `${activeCount}/${this.stations.length}`;

    // 2. Middle Fork Headwaters Flow (Prince or Alma)
    const mfStation = this.stations.find(s => s.id === 'MFKPRICO') || this.stations.find(s => s.id === 'MFKABMCO');
    const mfEl = document.getElementById('stat-headwaters-flow');
    if (mfEl && mfStation && mfStation.flow !== null) {
      mfEl.textContent = `${mfStation.flow.toLocaleString()}`;
    }

    // 3. Chatfield Reservoir Inflow (Waterton + Plum Creek Titan Rd)
    const waterton = this.stations.find(s => s.id === 'PLAWATCO');
    const plumCreek = this.stations.find(s => s.id === '06709530');
    const flowWaterton = waterton && waterton.flow !== null ? waterton.flow : 0;
    const flowPlum = plumCreek && plumCreek.flow !== null ? plumCreek.flow : 0;
    const totalInflow = flowWaterton + flowPlum;

    const inflowEl = document.getElementById('stat-chatfield-inflow');
    if (inflowEl) {
      inflowEl.textContent = `${totalInflow.toLocaleString()}`;
    }

    // 4. Chatfield Dam Outflow (PLACHACO)
    const outflowStation = this.stations.find(s => s.id === 'PLACHACO');
    const outflowEl = document.getElementById('stat-chatfield-outflow');
    if (outflowEl && outflowStation && outflowStation.flow !== null) {
      outflowEl.textContent = `${outflowStation.flow.toLocaleString()}`;
    }
  }

  getFilteredStations() {
    return this.stations.filter(station => {
      // Section filter
      if (this.activeSection !== 'all') {
        if (station.section !== this.activeSection) return false;
      }

      // Agency filter
      if (this.activeAgency !== 'all') {
        if (station.agency !== this.activeAgency) return false;
      }

      // Search query
      if (this.searchQuery) {
        const query = this.searchQuery;
        const matchName = station.name.toLowerCase().includes(query);
        const matchShort = station.shortName.toLowerCase().includes(query);
        const matchId = station.id.toLowerCase().includes(query);
        const matchStream = station.stream.toLowerCase().includes(query);
        const matchLocation = station.location.toLowerCase().includes(query);
        if (!matchName && !matchShort && !matchId && !matchStream && !matchLocation) {
          return false;
        }
      }

      return true;
    });
  }

  render() {
    const filtered = this.getFilteredStations();

    if (this.activeView === 'journey') {
      this.renderRiverJourney(filtered);
    } else if (this.activeView === 'table') {
      this.renderTable(filtered);
    } else if (this.activeView === 'map' && this.mapManager) {
      this.mapManager.updateMarkers(filtered);
    }
  }

  renderRiverJourney(stations) {
    const container = document.getElementById('journey-container');
    if (!container) return;

    if (!stations.length) {
      container.innerHTML = `
        <div class="chart-empty-state">
          <h3>No matching stations found</h3>
          <p>Try adjusting your search query or reach filters.</p>
        </div>
      `;
      return;
    }

    // Group stations into logical hydrological reaches
    const groups = [
      {
        id: 'headwaters',
        title: 'Continental Divide & South Park Headwaters',
        desc: 'Alma to Hartsel • High elevation snowmelt & reservoir system',
        icon: '🏔️',
        filter: s => s.section === 'headwaters'
      },
      {
        id: 'middle',
        title: 'Cheesman Canyon & Deckers Corridor',
        desc: 'Cheesman Lake to Deckers • World-class Gold Medal trout water',
        icon: '🎣',
        filter: s => s.section === 'middle'
      },
      {
        id: 'north_fork',
        title: 'North Fork South Platte & Roberts Tunnel',
        desc: 'Continental Divide transbasin diversion from Dillon Lake to Bailey',
        icon: '💧',
        filter: s => s.section === 'north_fork'
      },
      {
        id: 'lower',
        title: 'Waterton Canyon & Chatfield Reservoir',
        desc: 'Confluence through Strontia Springs and Chatfield Dam',
        icon: '🏞️',
        filter: s => s.section === 'lower'
      },
      {
        id: 'tributaries',
        title: 'Key Watershed Tributaries',
        desc: 'Tarryall Creek and Plum Creek drainage basins',
        icon: '🌿',
        filter: s => s.section === 'tributaries'
      }
    ];

    let html = '';

    for (const group of groups) {
      const groupStations = stations.filter(group.filter);
      if (!groupStations.length) continue;

      html += `
        <section class="journey-section">
          <header class="journey-section-header">
            <span class="journey-section-icon">${group.icon}</span>
            <div>
              <h2 class="journey-section-title">${group.title}</h2>
              <span class="journey-section-count">${groupStations.length} ${groupStations.length === 1 ? 'Station' : 'Stations'}</span>
            </div>
          </header>

          <div class="station-grid">
            ${groupStations.map(station => this.renderStationCard(station)).join('')}
          </div>
        </section>
      `;
    }

    container.innerHTML = html;

    // Attach card click handlers
    container.querySelectorAll('.station-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-station-id');
        this.openModal(id);
      });
    });
  }

  renderStationCard(station) {
    const hasFlow = station.flow !== null && station.flow !== undefined;
    const flowDisplay = hasFlow ? station.flow.toLocaleString() : '--';
    const stageDisplay = station.stage !== null && station.stage !== undefined 
      ? `Stage: <strong>${station.stage.toFixed(2)} ft</strong>` 
      : '';

    // Trend badge
    let trendBadge = '';
    if (station.trend === 'rising') {
      trendBadge = `<span class="trend-badge rising" title="Flow is rising in the last 6-24 hours">▲ +${station.change24h} cfs</span>`;
    } else if (station.trend === 'falling') {
      trendBadge = `<span class="trend-badge falling" title="Flow is decreasing in the last 6-24 hours">▼ ${station.change24h} cfs</span>`;
    } else if (station.trend === 'steady') {
      trendBadge = `<span class="trend-badge steady" title="Flow is steady">▶ Steady</span>`;
    }

    // Relative updated time
    let timeText = 'Unavailable';
    if (station.latestTime) {
      const ageMinutes = Math.round((Date.now() - new Date(station.latestTime).getTime()) / (60 * 1000));
      if (ageMinutes < 60) {
        timeText = `${Math.max(1, ageMinutes)}m ago`;
      } else if (ageMinutes < 24 * 60) {
        timeText = `${Math.round(ageMinutes / 60)}h ago`;
      } else {
        timeText = new Date(station.latestTime).toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
    }

    const agencyClass = station.agency.toLowerCase();
    const sparklineSvg = renderSparklineSVG(station.points, 130, 32);

    return `
      <article class="station-card" data-station-id="${station.id}" tabindex="0" role="button" aria-label="View flow details for ${station.shortName}">
        <div class="card-top">
          <div class="card-milestone-wrap">
            <span class="card-order-badge">#${station.order} • ${station.milestone}</span>
            <h3 class="card-title">${station.shortName}</h3>
            <div class="card-stream">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12c.6 0 1.2-.4 1.4-1 1.2-3 4-5 7.6-5 4.5 0 6 3 8 3 2.5 0 3-2 3-2"/></svg>
              <span>${station.stream}</span>
            </div>
          </div>
          <div class="card-badges">
            <span class="badge-agency ${agencyClass}">${station.agency}</span>
          </div>
        </div>

        <div class="card-flow-row">
          <div class="card-flow-val-wrap">
            <div class="card-flow-val">
              ${flowDisplay}<span class="card-flow-unit">cfs</span>
            </div>
            ${stageDisplay ? `<div class="card-stage-val">${stageDisplay}</div>` : ''}
          </div>
          ${trendBadge}
        </div>

        <div class="card-chart-row">
          <div class="card-sparkline-wrap">
            ${sparklineSvg}
          </div>
          <div class="card-chart-meta">
            ${station.min24h !== null ? `<div>Min: ${station.min24h}</div><div>Max: ${station.max24h}</div>` : ''}
          </div>
        </div>

        <div class="card-footer">
          <div class="card-time">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>${timeText}</span>
          </div>
          <span class="card-action-link">
            Details
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </span>
        </div>
      </article>
    `;
  }

  renderTable(stations) {
    const container = document.getElementById('table-container');
    if (!container) return;

    if (!stations.length) {
      container.innerHTML = `
        <div class="chart-empty-state">
          <p>No stations match current search and filter settings.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Station Name</th>
              <th scope="col">Waterway</th>
              <th scope="col">Agency</th>
              <th scope="col">Flow (cfs)</th>
              <th scope="col">Stage (ft)</th>
              <th scope="col">24h Trend</th>
              <th scope="col" class="table-sparkline-cell">48h Hydrograph</th>
              <th scope="col">Last Reading</th>
            </tr>
          </thead>
          <tbody>
            ${stations.map(s => {
              const flowText = s.flow !== null && s.flow !== undefined ? `${s.flow.toLocaleString()} cfs` : '--';
              const stageText = s.stage !== null && s.stage !== undefined ? `${s.stage.toFixed(2)} ft` : '--';
              const timeText = s.latestTime ? new Date(s.latestTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '--';
              const sparkline = renderSparklineSVG(s.points, 110, 24);

              let trendHtml = '<span class="trend-badge steady">Steady</span>';
              if (s.trend === 'rising') {
                trendHtml = `<span class="trend-badge rising">▲ +${s.change24h}</span>`;
              } else if (s.trend === 'falling') {
                trendHtml = `<span class="trend-badge falling">▼ ${s.change24h}</span>`;
              }

              return `
                <tr data-station-id="${s.id}">
                  <td><strong>${s.order}</strong></td>
                  <td>
                    <div><strong>${s.shortName}</strong></div>
                    <div style="font-size: 0.72rem; color: var(--text-dim);">${s.id} • ${s.location}</div>
                  </td>
                  <td>${s.stream}</td>
                  <td><span class="badge-agency ${s.agency.toLowerCase()}">${s.agency}</span></td>
                  <td class="table-flow-cell">${flowText}</td>
                  <td>${stageText}</td>
                  <td>${trendHtml}</td>
                  <td>${sparkline}</td>
                  <td style="color: var(--text-muted); font-size: 0.78rem;">${timeText}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('tbody tr').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-station-id');
        this.openModal(id);
      });
    });
  }

  openModal(stationId, shouldShowModal = true) {
    const station = this.stations.find(s => s.id === stationId);
    if (!station) return;
    this.selectedStation = station;

    const modal = document.getElementById('station-modal');
    if (!modal) return;

    // Header info
    document.getElementById('modal-title').textContent = station.name;
    document.getElementById('modal-milestone').textContent = `#${station.order} • ${station.milestone}`;
    document.getElementById('modal-agency-badge').textContent = station.agency;
    document.getElementById('modal-agency-badge').className = `badge-agency ${station.agency.toLowerCase()}`;

    // Description
    const descBox = document.getElementById('modal-station-desc');
    if (descBox) descBox.textContent = station.desc;

    // Metadata Grid
    document.getElementById('modal-meta-location').textContent = station.location;
    document.getElementById('modal-meta-county').textContent = station.county;
    document.getElementById('modal-meta-elev').textContent = station.elevation || '--';
    document.getElementById('modal-meta-typical').textContent = station.typicalRange || 'Varies';
    document.getElementById('modal-meta-coords').textContent = `${station.lat.toFixed(4)}, ${station.lon.toFixed(4)}`;

    // Agency link
    const agencyLink = document.getElementById('modal-agency-link');
    if (agencyLink) {
      if (station.agency === 'CDWR') {
        agencyLink.href = `https://dwr.state.co.us/Tools/Stations/${station.id}`;
        agencyLink.textContent = `View on Colorado DWR Portal (${station.id})`;
      } else {
        agencyLink.href = `https://waterdata.usgs.gov/monitoring-location/${station.id}/`;
        agencyLink.textContent = `View on USGS WaterData (${station.id})`;
      }
    }

    // Google Maps directions link
    const mapsLink = document.getElementById('modal-maps-link');
    if (mapsLink) {
      mapsLink.href = `https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lon}`;
    }

    // Render interactive hydrograph
    const chartContainer = document.getElementById('modal-chart-mount');
    if (chartContainer) {
      this.activeModalHydrograph = new InteractiveHydrograph(chartContainer, station.points, {
        hours: this.activeModalHours
      });
    }

    if (shouldShowModal && typeof modal.showModal === 'function') {
      modal.showModal();
    }
  }
}

// Boot application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.flowApp = new FlowApp();
});
