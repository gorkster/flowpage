// Leaflet Map Manager for South Platte Watershed
// Handles map rendering, custom station markers, river flow polylines, and popups

export class WatershedMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.onSelectStation = options.onSelectStation || (() => {});
    this.map = null;
    this.markers = {};
    this.polylines = [];
    this.stations = [];
  }

  init(stations) {
    this.stations = stations;
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Check if Leaflet is available
    if (typeof L === 'undefined') {
      container.innerHTML = `
        <div class="map-fallback">
          <p>Leaflet map library could not be loaded.</p>
        </div>
      `;
      return;
    }

    if (this.map) {
      this.updateMarkers(stations);
      return;
    }

    // Centered around Bailey / Deckers / South Park
    this.map = L.map(this.containerId, {
      zoomControl: true,
      scrollWheelZoom: true,
      maxZoom: 18,
      minZoom: 7
    });

    // Clean modern vector-like raster tiles (CartoDB Positron / OSM)
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const tileUrl = isDark
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

    L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.drawRiverBranches();
    this.updateMarkers(stations);
    this.fitBounds();

    // Invalidate size when map tab becomes visible
    window.addEventListener('resize', () => {
      if (this.map) this.map.invalidateSize();
    });
  }

  drawRiverBranches() {
    // Conceptual river branch coordinates showing hydrology from headwaters to Chatfield
    const middleForkTrace = [
      [39.356488, -106.082841], // Montgomery abv
      [39.352071, -106.069368], // Montgomery blw
      [39.284, -106.002],       // Fairplay
      [39.109746, -105.890472], // Prince
      [39.058242, -105.816156], // Santa Maria
      [38.996808, -105.680618]  // Confluence near Spinney abv
    ];

    const southForkTrace = [
      [39.070705, -105.97343],  // Antero abv
      [38.993886, -105.894583], // Antero blw
      [38.996808, -105.680618]  // Confluence near Spinney abv
    ];

    const mainStemUpperTrace = [
      [38.996808, -105.680618], // Spinney abv
      [38.967805, -105.581544], // Elevenmile abv (Dream stream)
      [38.905278, -105.473338], // Lake George (Elevenmile canyon)
      [39.162778, -105.309722], // Cheesman abv
      [39.209275, -105.268136], // Cheesman blw
      [39.259990, -105.221938], // Trumbull / Deckers
      [39.408870, -105.169876]  // South Platte Confluence
    ];

    const northForkTrace = [
      [39.461630, -105.676696], // Roberts Tunnel
      [39.458018, -105.659179], // Grant
      [39.404767, -105.473828], // Bailey
      [39.408870, -105.169876]  // Confluence at South Platte
    ];

    const mainStemLowerTrace = [
      [39.408870, -105.169876], // Confluence
      [39.435068, -105.123774], // Strontia Springs blw
      [39.488332, -105.092773], // Waterton (Chatfield Inflow)
      [39.537, -105.074],       // Chatfield Reservoir pool
      [39.562682, -105.059753]  // Chatfield Dam blw
    ];

    const plumCreekTrace = [
      [39.438316, -104.983067], // Sedalia
      [39.507369, -105.024467], // Titan Rd (Chatfield Inflow)
      [39.537, -105.074]        // Chatfield Reservoir pool
    ];

    const riverStyle = {
      color: '#0284c7',
      weight: 3.5,
      opacity: 0.65,
      lineCap: 'round',
      lineJoin: 'round',
      dashArray: null
    };

    const tributaryStyle = {
      color: '#38bdf8',
      weight: 2.5,
      opacity: 0.5,
      dashArray: '4, 4'
    };

    this.polylines.push(L.polyline(middleForkTrace, riverStyle).addTo(this.map));
    this.polylines.push(L.polyline(southForkTrace, tributaryStyle).addTo(this.map));
    this.polylines.push(L.polyline(mainStemUpperTrace, riverStyle).addTo(this.map));
    this.polylines.push(L.polyline(northForkTrace, riverStyle).addTo(this.map));
    this.polylines.push(L.polyline(mainStemLowerTrace, { ...riverStyle, weight: 4 }).addTo(this.map));
    this.polylines.push(L.polyline(plumCreekTrace, tributaryStyle).addTo(this.map));
  }

  updateMarkers(stations) {
    if (!this.map) return;
    this.stations = stations;

    // Clear existing markers
    Object.values(this.markers).forEach(m => m.remove());
    this.markers = {};

    stations.forEach(station => {
      const flowText = station.flow !== null && station.flow !== undefined
        ? `${Math.round(station.flow)}`
        : '--';

      const agencyClass = station.agency === 'CDWR' ? 'marker-cdwr' : 'marker-usgs';

      const customIcon = L.divIcon({
        className: 'station-map-pin',
        html: `
          <div class="pin-badge ${agencyClass}">
            <span class="pin-order">${station.order}</span>
            <span class="pin-flow">${flowText}<span class="pin-cfs">cfs</span></span>
          </div>
        `,
        iconSize: [68, 28],
        iconAnchor: [34, 14],
        popupAnchor: [0, -16]
      });

      const marker = L.marker([station.lat, station.lon], { icon: customIcon });

      const flowDisplay = station.flow !== null && station.flow !== undefined
        ? `<strong>${station.flow.toLocaleString()} cfs</strong>`
        : '<em>Unavailable</em>';

      const stageDisplay = station.stage !== null && station.stage !== undefined
        ? `<div class="popup-meta">Stage: <strong>${station.stage.toFixed(2)} ft</strong></div>`
        : '';

      const popupContent = `
        <div class="station-map-popup">
          <div class="popup-header">
            <span class="popup-badge ${agencyClass}">${station.agency}</span>
            <span class="popup-order">#${station.order}</span>
          </div>
          <h4 class="popup-title">${station.shortName}</h4>
          <div class="popup-milestone">${station.milestone}</div>
          <div class="popup-flow">${flowDisplay}</div>
          ${stageDisplay}
          <div class="popup-stream">${station.stream}</div>
          <button type="button" class="btn-popup-details" data-station-id="${station.id}">
            View Hydrograph & Info
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 260, className: 'custom-leaflet-popup' });
      marker.addTo(this.map);
      this.markers[station.id] = marker;
    });

    // Delegate detail button clicks inside Leaflet popups
    if (!this._popupDelegated) {
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-popup-details');
        if (btn) {
          const stationId = btn.getAttribute('data-station-id');
          if (stationId) this.onSelectStation(stationId);
        }
      });
      this._popupDelegated = true;
    }
  }

  highlightStation(stationId) {
    if (!this.map || !this.markers[stationId]) return;
    const marker = this.markers[stationId];
    this.map.setView(marker.getLatLng(), 12, { animate: true });
    marker.openPopup();
  }

  fitBounds() {
    if (!this.map || !this.stations.length) return;
    const latLngs = this.stations.map(s => [s.lat, s.lon]);
    this.map.fitBounds(latLngs, { padding: [40, 40] });
  }

  invalidateSize() {
    if (this.map) {
      setTimeout(() => this.map.invalidateSize(), 100);
    }
  }
}
