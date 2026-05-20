
	/**
	 * Callback executed when Google Maps API is fully loaded and ready
	 * Sets a global flag indicating Google Maps availability
	 */
	function initGoogleMapsCallback() {
	  window.__gmReady = true;
	  console.info('Google Maps API loaded successfully');
	}

	// ============================================================
	// SITE NAME UTILITIES
	// ============================================================
	
	/**
	 * Sanitize site name by trimming whitespace
	 * @param {string} s - Raw site name input
	 * @returns {string} Trimmed site name
	 */
	function sanitizeName(s) { 
	  return String(s || '').trim(); 
	}

	/**
	 * Update site name in all UI elements (input field, header, memory)
	 * @param {string} name - New site name to set
	 */
	function setSiteNameUI(name) {
	  const clean = sanitizeName(name);
	  // Update input box
	  const input = document.getElementById('siteName');
	  if (input) {
		input.value = clean;
		// Fire input event to trigger any listeners
		input.dispatchEvent(new Event('input', { bubbles: true }));
	  }
	  // Update header text
	  const hdr = document.getElementById('mapSiteName');
	  if (hdr) {
		hdr.dataset.site = clean;
		hdr.textContent = clean;
	  }
	  // Store in global variable for file downloads
	  window.__currentSiteName = clean;
	}

	/**
	 * Extract site name from filename using standard naming patterns
	 * Supports: sitingPlanData_[NAME].json and siting_sensors_[NAME].json
	 * @param {string} fname - Filename to parse
	 * @returns {string|null} Extracted site name or null if not found
	 */
	function siteNameFromFilename(fname) {
	  let m = /^sitingPlanData_(.+)\.json$/i.exec(fname || '');
	  if (m) return m[1];
	  m = /^siting_sensors_(.+)\.json$/i.exec(fname || '');
	  if (m) return m[1];
	  return null;
	}

	/**
	 * Shuffle array using Fisher-Yates algorithm (creates new array, doesn't modify original)
	 * @param {Array} array - Array to shuffle
	 * @returns {Array} New shuffled array
	 */
	function shuffleArray(array) {
	  const shuffled = [...array];
	  for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	  }
	  return shuffled;
	}


(async function(){
  // ============================================================
  // CONSTANTS - Centralized Configuration
  // ============================================================
  
  // Color palette for UI elements
  const COLORS = {
    BLUE: "#2b6cb0",      // Emission source pins
    RED: "#e53935",       // Low coverage (<20%)
    AMBER: "#f59e0b",     // Medium coverage (20-60%)
    GREEN: "#34a853",     // High coverage (>60%)
  };
  
  // Legacy color constants for backward compatibility
  const BLUE = COLORS.BLUE;
  const RED = COLORS.RED;
  const AMB = COLORS.AMBER;
  const GREEN = COLORS.GREEN;
  
  // Wind speed bins for visualization (m/s)
  const SPEED_COLS = ["#1f77b4", "#f59e0b", "#34a853", "#e53935"];  // 0–2, 2–4, 4–6, ≥6 m/s
  
  // Wind direction configuration
  const DIR_BINS = 16;                    // Number of direction bins
  const BIN_DEG = 360 / DIR_BINS;        // Degrees per bin (22.5°)
  const ANGLE_TOLERANCE = 20;            // Angular tolerance for wind alignment (degrees)
  const TOL = ANGLE_TOLERANCE;           // Legacy alias
  
  // Sensor detection ranges (meters) by emission rate (kg/h) — fallback values if lookup unavailable
	const DETECTION_RANGES = {
		'1PPM_Sensor': {1:  56, 2:  98, 5: 166, 10: 207, 15: 300, 100: 300},
  };

	window.__DETECTION_RANGES = DETECTION_RANGES;

  const Sensor_1PPM_R = DETECTION_RANGES['1PPM_Sensor'];

  // Custom sensor slots (up to 2 user-defined sensors)
  const MAX_CUSTOM_SENSORS = 2;
  const CUSTOM_SENSOR_COLORS = ['#8b5cf6', '#f97316'];
  const customSensors = [null, null];

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  /**
   * Get z-index offset for layer ordering on map
   * @param {string} role - Sensor or source role type
   * @returns {number} Z-index offset (higher values drawn on top)
   */
  function getZIndexForRole(role){
    switch(role){
      case 'Sensor':   return 3000;
      case 'Custom0':  return 2000;  // Custom sensor slot 0
      case 'Custom1':  return 2100;  // Custom sensor slot 1
      case 'Source':   return -1000; // Sources drawn at back
      default:         return 0;
    }
  }

  // ============================================================
  // GOOGLE MUTANT PLUGIN LOADER
  // ============================================================
  
  const GOOGLE_MUTANT_CDNS = [
    'https://cdn.jsdelivr.net/npm/leaflet.gridlayer.googlemutant@latest/dist/Leaflet.GoogleMutant.js',
    'https://unpkg.com/leaflet.gridlayer.googlemutant@latest/dist/Leaflet.GoogleMutant.js',
    'https://cdn.jsdelivr.net/npm/leaflet.gridlayer.googlemutant/Leaflet.GoogleMutant.min.js'
  ];

  /**
   * Attempt to load Leaflet GoogleMutant plugin from multiple CDN sources
   * Tries each CDN URL in sequence until successful or all fail
   * @returns {Promise<boolean>} True if plugin loaded successfully, false otherwise
   */
  async function loadGoogleMutant(){
    // Check if plugin is already available
    if (window.L && window.L.gridLayer && typeof L.gridLayer.googleMutant === 'function'){
      console.info('google-mutant already loaded');
      return true;
    }

    // Try each CDN URL in sequence
    for (const url of GOOGLE_MUTANT_CDNS){
      try{
        // Dynamically load script
        await new Promise((resolve,reject)=>{
          const script = document.createElement('script'); 
          script.src = url; 
          script.async = false;  // Load synchronously for reliability
          script.onload = ()=> resolve(); 
          script.onerror = ()=> reject(new Error('Failed to load '+url));
          document.head.appendChild(script);
        });
        // Give plugin time to register with Leaflet
        await new Promise(resolve=>setTimeout(resolve,100));
        
        // Verify plugin is now available
        if (window.L && window.L.gridLayer && typeof L.gridLayer.googleMutant === 'function'){
          console.info('google-mutant loaded from', url); 
          return true;
        } else {
          console.warn('Script loaded but google-mutant factory not registered by', url);
        }
      }catch(err){ 
        console.warn('Error loading google-mutant from', url, err); 
      }
    }
    return false;
  }

  // Attempt to load plugin before map initialization
  try{ await loadGoogleMutant(); }catch(e){ console.warn('google-mutant load attempt failed', e); }

  // Wind data (updated after fetch)
  let dirProbs = new Array(DIR_BINS).fill(1/DIR_BINS);
  // last fetched raw wind samples (dirs/speeds + metadata) — exported with download
  let lastWindSamples = null;
	// convenient arrays used by timing/detection features
	let windDirs = [];
	let windSpeeds = [];
	let shortwave = [];

  // ===== UI refs =====
  const statusEl   = document.getElementById('status');
  const mapEl      = document.getElementById('map');
  const mapCard    = document.getElementById('mapCard');
  const covScoreEl = document.getElementById('covScore');
  const windBasisBadgeEl = document.getElementById('windBasisBadge');
  const emSel      = document.getElementById('emRate');

  const startEl    = document.getElementById('startDate');
  const endEl      = document.getElementById('endDate');
	const windDataStatusEl = document.getElementById('windDataStatus');
  const siteNameEl = document.getElementById('siteName');
  const cbColor    = document.getElementById('colorByCov');
  const cbSensorDiscs = document.getElementById('toggleSensorDiscs');
  const cbMinimize = document.getElementById('minimizeSources');
  const sensorRangeLabel = document.getElementById('sensorRangeLabel');

  /**
   * Update status message in the UI
   * @param {string} t - Status message text (empty string clears status)
   */
  function setStatus(t){ statusEl.textContent = t || ''; }

  // ============================================================
  // MAP INITIALIZATION AND SIZING
  // ============================================================
  
  /**
   * Size the map element to be square, fitting within viewport constraints
   * Uses 75% of window height to allow room for controls
   */
  function sizeMapSquare(){
    const w = mapCard.clientWidth - 2*12;  // Account for padding
    const h = Math.floor(window.innerHeight*0.75);
    const side = Math.min(w,h);
    mapEl.style.height = side+"px";
  }
  sizeMapSquare();
  let userResizedMap = false;
  window.addEventListener('resize', () => { if (!userResizedMap) sizeMapSquare(); });

  // Vertical resize handle between the top cards and the tables card
  const resizeHandle = document.getElementById('resizeHandle');
  let resizeDragging = false, resizeStartY = 0, resizeStartHeight = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    resizeDragging = true;
    resizeStartY = e.clientY;
    resizeStartHeight = mapEl.offsetHeight;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ns-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizeDragging) return;
    const delta = e.clientY - resizeStartY;
    mapEl.style.height = Math.max(200, resizeStartHeight + delta) + 'px';
    userResizedMap = true;
  });

  document.addEventListener('mouseup', () => {
    if (!resizeDragging) return;
    resizeDragging = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    map.invalidateSize();
  });

  const map = L.map('map', { 
    zoomControl:true, 
    doubleClickZoom:false,
    tap: false,  // Disable tap handler that can cause jumping on touch devices
    tapTolerance: 15,  // Reduce tap tolerance
    trackResize: true,
    boxZoom: true,
    keyboard: true,
    scrollWheelZoom: true,
    dragging: true,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 120,
    inertia: false  // Disable inertial dragging which can cause jumping
  });
  window.map = map;   // expose the real Leaflet map to DevTools and helpers
  
  // Prevent map from panning on mousedown/click - more comprehensive fix
  const mapContainer = map.getContainer();
  mapContainer.style.touchAction = 'none';
  
  // Stop any running animations when clicking
  map.on('mousedown', function(e) {
    map.stop();
    // Prevent default to stop jump
    if (e.originalEvent) {
      e.originalEvent.preventDefault();
    }
  });
  
  // Fix initial jump by invalidating size after a short delay
  setTimeout(() => {
    map.invalidateSize({pan: false, animate: false});
  }, 100);

  // ============================================================
  // BASEMAP LAYER MANAGEMENT
  // ============================================================
  
  const basemapSelect = document.getElementById('basemapSelect');
  let currentBaseLayer = null;
  let googleMapsRetryCount = 0;
  const MAX_GOOGLE_RETRIES = 20;  // ~10 seconds total (20 * 500ms)
  
  /**
   * Initialize basemap layer based on user choice (Google Satellite or Esri)
   * For Google Maps, retries up to 10 seconds if API/plugin not yet loaded
   * @param {string} choice - Basemap choice: 'google' or 'esri'
   */
  function initBasemapForChoice(choice) {
    // Remove previous raster baselayer (keeps markers/overlays)
    if (window.map) {
      map.eachLayer(layer => {
        if ((layer instanceof L.TileLayer) || layer._tiles) {
          map.removeLayer(layer);
        }
      });
    }

    // --- Google Satellite basemap ---
    if (choice === 'google') {
      // Check if Google Maps API script failed to load
      if (window.__gmFailed) {
        console.warn('Google Maps API failed to load from script tag');
        return;
      }

      // Check if both Google API and GoogleMutant plugin are ready
      const googleApiReady = window.__gmReady && window.google && window.google.maps;
      const mutantReady = typeof L?.gridLayer?.googleMutant === 'function';
      const googleReady = googleApiReady && mutantReady;

      if (googleReady) {
        // Initialize Google Satellite layer
        currentBaseLayer = L.gridLayer.googleMutant({ 
          type: 'satellite',
          maxZoom: 21
        })
        .on('tileerror', e => {
          // Suppress repeated tile errors to avoid console spam
          if (!window.__googleTileErrorShown) {
            console.warn('[Google Maps] Tile loading failed - may be due to CORS restrictions');
            window.__googleTileErrorShown = true;
          }
        })
        .on('tileload', () => {
          // Reset error flag when tiles load successfully
          window.__googleTileErrorShown = false;
        })
        .addTo(map);
        
        // Suppress console errors from Google Maps tile requests
        const originalError = console.error;
        console.error = function(...args) {
          const message = args[0]?.toString() || '';
          if (message.includes('khms') || message.includes('google.com/kh')) {
            return; // Suppress Google Maps tile errors
          }
          originalError.apply(console, args);
        };
        
        googleMapsRetryCount = 0;
        return;
      }

      // Not ready yet: retry for up to ~10 seconds
      if (googleMapsRetryCount < MAX_GOOGLE_RETRIES) {
        googleMapsRetryCount++;
        setTimeout(() => initBasemapForChoice('google'), 500);
        return;
      }

      // After retries, give up
      console.warn('Google Maps initialization timed out after 10 seconds');
      return;
    }

    // --- Esri World Imagery basemap (fallback/default) ---
    currentBaseLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }
    ).addTo(map);
  }

  // Wire up basemap selector change event
  if (basemapSelect){ 
    basemapSelect.addEventListener('change', ()=>{ 
      initBasemapForChoice(basemapSelect.value); 
    }); 
  }

  // Initialize basemap using selector's value (defaults to Google)
  initBasemapForChoice(basemapSelect ? basemapSelect.value : 'google');
  map.setView([0,0], 2);
  
  // Wait for map to fully load before allowing interactions (prevents jump)
  let mapReady = false;
  map.whenReady(() => {
    setTimeout(() => {
      mapReady = true;
      map.invalidateSize({pan: false, animate: false});
    }, 200);
  });
  
  // ============================================================
  // AUTO-SWITCH TO GOOGLE MAPS
  // ============================================================
  
  /**
   * Automatically switch to Google Satellite basemap when it becomes available
   * Polls every 500ms for up to 10 seconds after page load
   * Only switches if user has selected Google basemap
   */
  (function autoSwitchToGoogle(){
    let retries = 0;
    const MAX_RETRIES = 20;  // 20 * 500ms = 10 seconds
    const checkInterval = setInterval(() => {
      const userWantsGoogle = (basemapSelect ? basemapSelect.value : 'google') === 'google';
      const googleReady = !!(window.google && window.google.maps) &&
                          typeof L?.gridLayer?.googleMutant === 'function';
      
      if (userWantsGoogle && googleReady) {
        initBasemapForChoice('google');   // Replace Esri with Google
        clearInterval(checkInterval);
      }
      
      if (++retries > MAX_RETRIES) {
        clearInterval(checkInterval); // Stop after ~10s
      }
    }, 500);
  })();

  // ============================================================
  // MAP LAYERS AND MARKERS
  // ============================================================
  
  const sourcesLayer = L.featureGroup().addTo(map);
  const devicesLayer = L.featureGroup().addTo(map);

  /**
   * Create a colored pin icon for emission sources
   * @param {string} color - Hex color code for the pin
   * @returns {L.DivIcon} Leaflet icon for map marker
   */
  function pinIcon(color){
    const svg = `
      <svg width="18" height="24" viewBox="0 0 18 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 0C4.03 0 0 4.03 0 9c0 6.75 9 15 9 15s9-8.25 9-15C18 4.03 13.97 0 9 0z"
              fill="${color}" stroke="#333" stroke-width="0.5"/>
        <circle cx="9" cy="9" r="4" fill="#fff" opacity="0.7"/>
      </svg>`;
    return L.divIcon({ className:"pin", html:svg, iconSize:[18,24], iconAnchor:[9,23] });
  }
  
  // Minimized pin icon for compact source display
  const pinMini = L.divIcon({ className:'pinMini', iconSize:[10,10], iconAnchor:[5,5] });

  // Sensor device icons for map markers
  const sensorIcon = L.divIcon({ html:'<div class="dot"></div>', iconSize:[16,16], iconAnchor:[8,8], className:'' });
  const customIcons = [
    L.divIcon({ html:'<div class="dotCustom0"></div>', iconSize:[16,16], iconAnchor:[8,8], className:'' }),
    L.divIcon({ html:'<div class="dotCustom1"></div>', iconSize:[16,16], iconAnchor:[8,8], className:'' }),
  ];

  // Application state arrays
  const sources = [];  // Emission sources: {lat, lon, label, typ, marker, coverage}
  const devices = [];  // Sensor devices: {role, handle, inner, outer, labelLayer?}

  // ============================================================
  // SENSOR DEVICE MANAGEMENT
  // ============================================================
  
  /**
   * Add a sensor device to the map with detection radius visualization
   * Creates draggable marker with inner and outer detection circles
   * Double-click to remove the device
   * @param {number} lat - Latitude position
   * @param {number} lon - Longitude position
   * @param {string} role - Sensor type: 'Sensor', 'Custom0', or 'Custom1'
   * @returns {Object} The device object that was added to the devices array
   */
  function addDevice(lat, lon, role){
    let color = GREEN, icon = sensorIcon, outerRadius = 150, innerRadius = 5;

    // Configure sensor-specific properties
    if (role === 'Sensor') {
      icon = sensorIcon; color = GREEN;
      const nominalProfile = (typeof getNominalProfileForRate === 'function')
        ? getNominalProfileForRate(+emSel.value)
        : { windSpeed: 3 };
      outerRadius = getDetectionRadiusFor1PPM_Sensor(+emSel.value, 1, nominalProfile.windSpeed) || Sensor_1PPM_R[+emSel.value] || 150;
    }
    if (role === 'Custom0' || role === 'Custom1') {
      const idx = role === 'Custom0' ? 0 : 1;
      const cs = customSensors[idx];
      icon = customIcons[idx];
      color = CUSTOM_SENSOR_COLORS[idx];
      const nominalProfile = (typeof getNominalProfileForRate === 'function')
        ? getNominalProfileForRate(+emSel.value)
        : { deltaH: 0, windSpeed: 3 };
      const r = cs ? getDetectionRadiusForCustom(idx, +emSel.value, 1, nominalProfile.windSpeed) : null;
      outerRadius = (r != null && r > 0) ? r : 80;
    }

    // Create draggable marker
    const handle = L.marker([lat, lon], { 
      draggable: true, 
      icon, 
      zIndexOffset: getZIndexForRole(role) 
    }).addTo(devicesLayer);
    
    // Create inner circle (placeholder for inner radius, kept invisible by default)
    const inner = L.circle([lat, lon], { radius: 5, color, weight: 1, fill: true, fillOpacity: 0.22, opacity: 0 });
    
    // Create outer detection radius circle
    const outer = L.circle([lat, lon], { 
      radius: outerRadius, 
      color, 
      weight: 1, 
      fill: true, 
      fillOpacity: 0.12, 
      opacity: 0.9, 
      dashArray: "4,4" 
    });
    
    inner.addTo(devicesLayer); 
    outer.addTo(devicesLayer);
    
    // Ensure marker stays on top of circles
    handle.on('add', () => { 
      try { handle.setZIndexOffset(getZIndexForRole(role)); } catch(e) {} 
    });
  
    /**
     * Synchronize circle positions with marker and update coverage
     */
    function syncCirclesWithMarker(){
      const latlng = handle.getLatLng();
      inner.setLatLng(latlng); 
      outer.setLatLng(latlng);
      setStatus(`${role} @ ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`);
      // Only recompute if enabled (optimization: skip during bulk placement)
      if (window.recomputeCoverageEnabled !== false) {
        recomputeCoverage();
        recomputeTiming();
      }
    }

    handle.on('drag', syncCirclesWithMarker);
    handle.on('dragend', syncCirclesWithMarker);

    // Double-click to delete device
    handle.on('dblclick', () => {
      devicesLayer.removeLayer(handle); 
      devicesLayer.removeLayer(inner); 
      devicesLayer.removeLayer(outer);
      
      const device = devices.find(d => d.handle === handle);
      if (device && device.labelLayer) map.removeLayer(device.labelLayer);
      
      const index = devices.findIndex(d => d.handle === handle); 
      if (index >= 0) devices.splice(index, 1);
      
      // Only recompute if enabled (optimization: skip during bulk operations)
      if (window.recomputeCoverageEnabled !== false) {
        recomputeCoverage();
      }
    });

    const device = {role, handle, inner, outer};
    devices.push(device);
    applyDiscsVisible();
    syncCirclesWithMarker();
    updateCoordTables();
    
    return device; // Return the device object for potential modification
  }

  // ============================================================
  // EMISSION SOURCE MANAGEMENT
  // ============================================================

  let pendingSourceLatLng = null;
  let editingSource = null;

  function addEmissionSource(lat, lon, label, typ, height, makeDraggable) {
    const m = L.marker([lat, lon], {
      icon: pinIcon(BLUE),
      zIndexOffset: getZIndexForRole('Source'),
      draggable: !!makeDraggable,
    }).bindTooltip(typ ? `${label} (${typ})` : label).addTo(sourcesLayer);

    const src = { lat, lon, label, typ, marker: m, coverage: 0, height: height != null ? Number(height) : null };
    sources.push(src);

    if (makeDraggable) {
      m.on('drag', () => {
        const ll = m.getLatLng();
        src.lat = ll.lat;
        src.lon = ll.lng;
        if (window.recomputeCoverageEnabled !== false) {
          recomputeCoverage();
          recomputeTiming();
          updateCoordTables();
        }
      });
    }

    m.on('click', () => openSourceModal(src));
    return src;
  }

  function openSourceModal(source) {
    editingSource = source;
    const modal = document.getElementById('sourceModal');
    const title = document.getElementById('sourceModalTitle');
    const deleteBtn = document.getElementById('sourceModalDelete');
    document.getElementById('sourceModalTyp').value = source ? (source.typ || '') : '';
    document.getElementById('sourceModalLabel').value = source ? (source.label || '') : '';
    const unitSel = document.getElementById('sourceModalHeightUnit');
    const unit = unitSel ? unitSel.value : 'm';
    const heightMeters = source && source.height != null ? source.height : 1;
    document.getElementById('sourceModalHeight').value = unit === 'ft' ? (heightMeters * 3.28084).toFixed(2) : heightMeters;
    title.textContent = source ? 'Edit Emission Source' : 'Add Emission Source';
    deleteBtn.style.display = source ? '' : 'none';
    modal.style.display = 'flex';
  }

  function closeSourceModal() {
    document.getElementById('sourceModal').style.display = 'none';
    editingSource = null;
    pendingSourceLatLng = null;
  }

  document.getElementById('sourceModalCancel').addEventListener('click', closeSourceModal);

  document.getElementById('sourceModalConfirm').addEventListener('click', () => {
    const typ = document.getElementById('sourceModalTyp').value.trim();
    const label = document.getElementById('sourceModalLabel').value.trim() || 'Source';
    const heightRaw = parseFloat(document.getElementById('sourceModalHeight').value);
    const unitSel = document.getElementById('sourceModalHeightUnit');
    const unit = unitSel ? unitSel.value : 'm';
    const height = unit === 'ft' ? heightRaw / 3.28084 : heightRaw;
    if (editingSource) {
      // Update existing source
      editingSource.typ = typ;
      editingSource.label = label;
      editingSource.height = isNaN(height) ? null : height;
      editingSource.marker.setTooltipContent(typ ? `${label} (${typ})` : label);
    } else if (pendingSourceLatLng) {
      // Add new source
      addEmissionSource(pendingSourceLatLng.lat, pendingSourceLatLng.lng, label, typ, isNaN(height) ? null : height, true);
      addMode = 'Source'; // stay in source add mode
    }
    closeSourceModal();
    updateCoordTables();
    recomputeCoverage();
    recomputeTiming();
  });

  document.getElementById('sourceModalDelete').addEventListener('click', () => {
    if (!editingSource) return;
    sourcesLayer.removeLayer(editingSource.marker);
    const idx = sources.indexOf(editingSource);
    if (idx >= 0) sources.splice(idx, 1);
    closeSourceModal();
    updateCoordTables();
    recomputeCoverage();
    recomputeTiming();
    setStatus('Emission source deleted.');
  });

  document.getElementById('sourceModalHeightUnit').addEventListener('change', function() {
    const heightInput = document.getElementById('sourceModalHeight');
    const val = parseFloat(heightInput.value);
    if (!isNaN(val)) {
      heightInput.value = this.value === 'ft' ? (val * 3.28084).toFixed(2) : (val / 3.28084).toFixed(2);
    }
  });

  // ============================================================
  // SENSOR TYPE CHANGE MODAL
  // ============================================================

  let sensorTypeTargetMarker = null;

  function openSensorTypeModal(markerLayer) {
    if (addMode) return; // don't interfere when placing sensors
    const device = devices.find(d => d.handle === markerLayer);
    if (!device) return;
    sensorTypeTargetMarker = markerLayer;

    const sel = document.getElementById('sensorTypeSelect');
    sel.innerHTML = '<option value="Sensor">0.3ppm Sensor</option>';
    if (customSensors[0]) {
      const opt = document.createElement('option');
      opt.value = 'Custom0';
      opt.textContent = customSensors[0].name;
      sel.appendChild(opt);
    }
    if (customSensors[1]) {
      const opt = document.createElement('option');
      opt.value = 'Custom1';
      opt.textContent = customSensors[1].name;
      sel.appendChild(opt);
    }
    sel.value = device.role;
    document.getElementById('sensorTypeModal').style.display = 'flex';
  }

  document.getElementById('sensorTypeCancel').addEventListener('click', () => {
    document.getElementById('sensorTypeModal').style.display = 'none';
    sensorTypeTargetMarker = null;
  });

  document.getElementById('sensorTypeConfirm').addEventListener('click', () => {
    const modal = document.getElementById('sensorTypeModal');
    const newRole = document.getElementById('sensorTypeSelect').value;
    modal.style.display = 'none';

    if (!sensorTypeTargetMarker) return;
    const device = devices.find(d => d.handle === sensorTypeTargetMarker);
    sensorTypeTargetMarker = null;
    if (!device || device.role === newRole) return;

    const ll = device.handle.getLatLng();
    // Remove old device
    devicesLayer.removeLayer(device.handle);
    devicesLayer.removeLayer(device.inner);
    devicesLayer.removeLayer(device.outer);
    if (device.labelLayer) map.removeLayer(device.labelLayer);
    const idx = devices.indexOf(device);
    if (idx >= 0) devices.splice(idx, 1);
    // Add new device at same location
    addDevice(ll.lat, ll.lng, newRole);
  });

  // ============================================================
  // USER INTERACTION MODES
  // ============================================================
  
  let addMode = null;  // Current add mode: 'Sensor' | 'Source'

  // Button handlers to enter sensor placement modes
  document.getElementById('addSensor').onclick = () => {
    addMode = 'Sensor';
    setStatus('Click map to place sensor');
  };
  document.getElementById('addSource').onclick = () => {
    addMode = 'Source';
    setStatus('Click map to place emission source');
  };

  // Custom sensor button handlers
  let pendingCustomSlotIdx = null;

  function openCustomSensorModal(slotIdx) {
    pendingCustomSlotIdx = slotIdx;
    document.getElementById('customSensorModalTitle').textContent = `Define Custom Sensor ${slotIdx + 1}`;
    document.getElementById('customSensorName').value = '';
    document.getElementById('customSensorMDL').value = '';
    document.getElementById('customSensorModal').style.display = 'flex';
    document.getElementById('customSensorName').focus();
  }

  document.getElementById('createCustom0').onclick = () => openCustomSensorModal(0);
  document.getElementById('createCustom1').onclick = () => openCustomSensorModal(1);

  document.getElementById('customSensorModalCancel').onclick = () => {
    document.getElementById('customSensorModal').style.display = 'none';
    pendingCustomSlotIdx = null;
  };

  document.getElementById('customSensorModalConfirm').onclick = () => {
    const name = document.getElementById('customSensorName').value.trim();
    const mdl = parseFloat(document.getElementById('customSensorMDL').value);
    if (!name) { alert('Please enter a sensor name.'); return; }
    if (!Number.isFinite(mdl) || mdl <= 0) { alert('Please enter a valid MDL > 0 ppm.'); return; }
    document.getElementById('customSensorModal').style.display = 'none';
    const slotIdx = pendingCustomSlotIdx;
    pendingCustomSlotIdx = null;
    // Show building status, then run sync computation after paint
    setStatus(`Building lookup table for "${name}"…`);
    setTimeout(() => {
      createCustomSensor(slotIdx, name, mdl);
      setStatus(`Custom sensor "${name}" ready — click Place to add to map.`);
    }, 0);
  };

  document.getElementById('deleteCustom0').onclick = () => removeCustomSensor(0);
  document.getElementById('deleteCustom1').onclick = () => removeCustomSensor(1);

  document.getElementById('placeCustom0').onclick = () => {
    if (!customSensors[0]) { setStatus('Define Custom Sensor 1 first.'); return; }
    addMode = 'Custom0';
    setStatus(`Click map to add ${customSensors[0].name}`);
  };
  document.getElementById('placeCustom1').onclick = () => {
    if (!customSensors[1]) { setStatus('Define Custom Sensor 2 first.'); return; }
    addMode = 'Custom1';
    setStatus(`Click map to add ${customSensors[1].name}`);
  };

  // Auto-recompute toggle
  document.getElementById('autoRecomputeToggle').addEventListener('change', function() {
    window.recomputeCoverageEnabled = this.checked;
    if (this.checked) {
      recomputeCoverage();
      updateCoordTables();
      setStatus('Auto-recompute enabled — recomputing now.');
    } else {
      setStatus('Auto-recompute paused. Re-enable to update coverage.');
    }
  });

  // Map click handler for sensor and source placement
  map.on('click', e => {
    if (!addMode) return;
    if (addMode === 'Source') {
      pendingSourceLatLng = e.latlng;
      openSourceModal(null);
      return;
    }
    addDevice(e.latlng.lat, e.latlng.lng, addMode);
  });

  // Escape key cancels any active add mode
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && addMode) {
      addMode = null;
      setStatus('');
    }
  });

  // Intercept clicks on device markers to open the sensor type modal
  const originalAddLayer = devicesLayer.addLayer.bind(devicesLayer);
  devicesLayer.addLayer = function(layer){
    originalAddLayer(layer);
    if (layer instanceof L.Marker){
      layer.on('click', () => { openSensorTypeModal(layer); });
    }
    return this;
  };

  // ============================================================
  // UI VISIBILITY TOGGLES
  // ============================================================
  
  cbMinimize.addEventListener('change', applyMinimize);

  /**
   * Apply minimize mode to emission sources
   * When minimized: shows small pins with type labels
   * When expanded: shows larger colored pins based on coverage
   */
  function applyMinimize() {
    const minimize = cbMinimize.checked;
    sources.forEach(source => {
      // Remove existing label if any
      if (source.nameLabel) { 
        map.removeLayer(source.nameLabel); 
        source.nameLabel = null; 
      }

      if (minimize) {
        source.marker.setIcon(pinMini);

        // Add type label for minimized sources
        if (source.typ) {
          source.nameLabel = L.divIcon({
            html: `<div style="color:#555; font-size:11px; font-weight:600; text-shadow:1px 1px 2px rgba(255,255,255,0.8); transform: translate(6px, 3px);">${source.typ}</div>`,
            className: 'sourceLabel',
            iconAnchor: [0, 0]
          });
          const latlng = source.marker.getLatLng();
          // Keep source labels at the back (same priority as sources)
          const label = L.marker(latlng, { 
            icon: source.nameLabel, 
            interactive: false, 
            zIndexOffset: getZIndexForRole('Source') + 50 
          });
          label.addTo(map);
          source.nameLabel = label;
        }
      } else {
        // Show regular colored pin based on coverage
        const coveragePercent = (source.coverage || 0) * 100;
        const color = cbColor.checked ? covColor(coveragePercent) : "#777";
        source.marker.setIcon(pinIcon(color));
      }
    });
  }

  /**
   * Toggle visibility of detection radius circles by sensor type
   */
  function applyDiscsVisible(){
		const sensorVisible = cbSensorDiscs.checked;
		const customDiscsCb = document.getElementById('toggleCustomDiscs');
		const customVisible = customDiscsCb ? customDiscsCb.checked : true;

		devices.forEach(device => {
			let outerVisible = false;
			if (device.role === 'Sensor') outerVisible = sensorVisible;
			else if (device.role === 'Custom0' || device.role === 'Custom1') outerVisible = customVisible;
			device.inner.setStyle({opacity: 0, fillOpacity: 0});
			device.outer.setStyle({opacity: outerVisible ? 0.9 : 0, fillOpacity: outerVisible ? 0.12 : 0});
		});
  }
  cbSensorDiscs.addEventListener('change', applyDiscsVisible);
  const cbCustomDiscs = document.getElementById('toggleCustomDiscs');
  if (cbCustomDiscs) cbCustomDiscs.addEventListener('change', applyDiscsVisible);

  /**
   * Update detection ranges based on selected emission rate.
   * Adjusts circle radii and updates range labels in the UI
   * using physics-based lookup at ws=3, deltaH=1.
   */
  function applyRanges(){
		const emissionRate = +emSel.value;
		const nominalProfile = (typeof getNominalProfileForRate === 'function')
			? getNominalProfileForRate(emissionRate)
			: { deltaH: 0, windSpeed: 3 };
		const displayDeltaH = 1;
		const sensorRange = getDetectionRadiusFor1PPM_Sensor(emissionRate, displayDeltaH, nominalProfile.windSpeed)
			|| Sensor_1PPM_R[emissionRate] || 150;
		const sensorRangeRounded = Math.round(sensorRange);
		sensorRangeLabel.textContent = sensorRangeRounded >= DETECTION_MAX_RADIUS ? `>${DETECTION_MAX_RADIUS} m` : `${sensorRangeRounded} m`;

		devices.forEach(device => {
			if (device.role === 'Sensor') {
				device.outer.setRadius(sensorRange);
			}
		});

		for (let i = 0; i < MAX_CUSTOM_SENSORS; i++) {
			const cs = customSensors[i];
			if (!cs) continue;
			const r = getDetectionRadiusForCustom(i, emissionRate, displayDeltaH, nominalProfile.windSpeed);
			const rangeLabel = document.getElementById(`customRangeLabel${i}`);
			if (rangeLabel) {
				if (r != null) {
					const rRounded = Math.round(r);
					rangeLabel.textContent = rRounded >= DETECTION_MAX_RADIUS ? `>${DETECTION_MAX_RADIUS} m` : `${rRounded} m`;
				} else {
					rangeLabel.textContent = '— m';
				}
			}
			if (r == null) continue;
			const role = `Custom${i}`;
			devices.forEach(device => {
				if (device.role === role) device.outer.setRadius(r);
			});
		}

		recomputeCoverage();
		if (detectionEvents.length > 0) {
			computeDetectionEvents();
			computeDetectionMatrix();
			updateTimingMetrics();
		}
	}
  emSel.addEventListener('change', applyRanges);

  // ============================================================
  // COVERAGE COMPUTATION
  // ============================================================
  
  /**
   * Calculate bearing (compass direction) from point 1 to point 2
   * @param {number} lat1 - Latitude of origin point (degrees)
   * @param {number} lon1 - Longitude of origin point (degrees)
   * @param {number} lat2 - Latitude of destination point (degrees)
   * @param {number} lon2 - Longitude of destination point (degrees)
   * @returns {number} Bearing in degrees (0-360)
   */
  function bearingDeg(lat1,lon1,lat2,lon2){
    const φ1=lat1*Math.PI/180, φ2=lat2*Math.PI/180, Δλ=(lon2-lon1)*Math.PI/180;
    const y=Math.sin(Δλ)*Math.cos(φ2);
    const x=Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
    return (Math.atan2(y,x)*180/Math.PI+360)%360;
  }
  
  /**
   * Calculate angular difference between two bearings
   * @param {number} a - First angle (degrees)
   * @param {number} b - Second angle (degrees)
   * @returns {number} Smallest angular difference (0-180)
   */
  const angDiff=(a,b)=> Math.abs(((a-b+180)%360)-180);
  
  /**
   * Get color for coverage percentage
   * @param {number} pct - Coverage percentage (0-100)
   * @returns {string} Hex color code
   */
  const covColor=(pct)=> pct<20?RED: pct<60?AMB:GREEN;

	let windDataOrigin = 'empty';
	let windControlSignatureAtLoad = null;

	function getWindControlSignature() {
		return `openmeteo|${startEl?.value || ''}|${endEl?.value || ''}`;
	}

	function inferWindDataOriginFromProvider(provider) {
		const p = String(provider || '').toLowerCase();
		if (p === 'import') return 'imported';
		if (p === 'openmeteo') return 'fetched';
		return 'stale';
	}

	function updateWindDataStatus() {
		if (!windDataStatusEl) return;

		const sampleCount = Array.isArray(windDirs) ? windDirs.length : 0;
		const hasSamples = sampleCount > 0;
		const providerOrigin = inferWindDataOriginFromProvider(lastWindSamples?.provider);
		if (providerOrigin === 'imported' || providerOrigin === 'fetched') {
			windDataOrigin = providerOrigin;
		}

		let state = 'empty';
		let label = 'Wind data: empty';

		if (hasSamples) {
			const currentSignature = getWindControlSignature();
			const controlsChanged = !!windControlSignatureAtLoad && currentSignature !== windControlSignatureAtLoad;
			if (controlsChanged) {
				state = 'stale';
				label = 'Wind data: stale (controls changed)';
			} else if (windDataOrigin === 'imported') {
				state = 'imported';
				label = 'Wind data: imported from siting file';
			} else if (windDataOrigin === 'fetched') {
				state = 'fetched';
				label = 'Wind data: fetched';
			} else {
				state = 'stale';
				label = 'Wind data: stale (unknown origin)';
			}
		}

		windDataStatusEl.className = `windDataStatus is-${state}`;
		windDataStatusEl.dataset.state = state;
		windDataStatusEl.textContent = label;
		updateCoverageBadge();
	}

	function updateCoverageBadge() {
		if (!windBasisBadgeEl) return;
		const hasSamples = Array.isArray(windDirs) && windDirs.length > 0;
		if (!hasSamples) {
			windBasisBadgeEl.className = 'wind-basis-badge wind-basis-empty';
			windBasisBadgeEl.title = 'No wind data — fetch weather data to enable accurate coverage';
			windBasisBadgeEl.textContent = '⚠ No wind data';
		} else {
			const currentSignature = getWindControlSignature();
			const stale = !!windControlSignatureAtLoad && currentSignature !== windControlSignatureAtLoad;
			if (stale) {
				windBasisBadgeEl.className = 'wind-basis-badge wind-basis-stale';
				windBasisBadgeEl.title = 'Wind data may be stale — controls changed since last fetch';
				windBasisBadgeEl.textContent = '⚠ Stale wind';
			} else {
				windBasisBadgeEl.className = 'wind-basis-badge wind-basis-fetched';
				windBasisBadgeEl.title = 'Coverage based on fetched wind data';
				windBasisBadgeEl.textContent = '✓ Wind fetched';
			}
		}
	}

	function markWindDataLoaded(origin, signatureOverride) {
		windDataOrigin = origin;
		windControlSignatureAtLoad = signatureOverride || getWindControlSignature();
		updateWindDataStatus();
		updateCoverageBadge();
	}

	/**
	 * Keep internal wind/timing variables in sync when external code assigns to
	 * window.* references (e.g. Playwright tests or debug scripts).
	 */
	function syncPublicTimingState() {
		if (Array.isArray(window.windDirs) && window.windDirs !== windDirs) {
			if (window.windDirs.length > 0 || windDirs.length === 0) windDirs = window.windDirs;
			else window.windDirs = windDirs;
		}
		if (Array.isArray(window.windSpeeds) && window.windSpeeds !== windSpeeds) {
			if (window.windSpeeds.length > 0 || windSpeeds.length === 0) windSpeeds = window.windSpeeds;
			else window.windSpeeds = windSpeeds;
		}
		if (Array.isArray(window.shortwave) && window.shortwave !== shortwave) {
			if (window.shortwave.length > 0 || shortwave.length === 0) shortwave = window.shortwave;
			else window.shortwave = shortwave;
		}
		if (window.lastWindSamples && window.lastWindSamples !== lastWindSamples) {
			const windowCount = Array.isArray(window.lastWindSamples.dirs) ? window.lastWindSamples.dirs.length : 0;
			const localCount = Array.isArray(lastWindSamples?.dirs) ? lastWindSamples.dirs.length : 0;
			if (windowCount > 0 || localCount === 0) lastWindSamples = window.lastWindSamples;
			else window.lastWindSamples = lastWindSamples;
		}
		updateWindDataStatus();
	}

  /**
   * Recompute coverage for all sources based on current sensor placement and wind data
   * Updates UI elements (tooltips, markers, coverage score)
   */
  function recomputeCoverage(){
	syncPublicTimingState();
    const er = +emSel.value;
    const dirCenters = Array.from({length:DIR_BINS}, (_,i)=> i*BIN_DEG);
    let total=0;

    sources.forEach(s=>{
      const S = L.latLng(s.lat, s.lon);
      // precompute device distances & bearings
      const info = devices.map(d=>{
        const ll = d.handle.getLatLng();
        return { role:d.role, d:S.distanceTo(ll), b:bearingDeg(s.lat,s.lon, ll.lat,ll.lng) };
      });

       const sensorPositions = devices.map(d => {
         const ll = d.handle.getLatLng();
         return { lat: ll.lat, lng: ll.lng, role: d.role };
       });
       const p = calculateSourceCoverage(s, sensorPositions);
 
      s.coverage = p; total += p;
      const pct = p*100;
      const tt = `${s.label}${s.typ?` (${s.typ})`:""} • coverage ${pct.toFixed(1)}%`;
      if (s.marker) {
        s.marker.setTooltipContent(tt);
        s.marker.setIcon( cbColor.checked ? pinIcon(covColor(pct)) : pinIcon("#777") );
        if (s.marker.setZIndexOffset) s.marker.setZIndexOffset(getZIndexForRole('Source'));
      }
    });

		// Coverage score uses average source coverage (no minimum-weight blending)
    if (sources.length > 0) {
      const coverages = sources.map(s => s.coverage || 0);
      const avgCoverage = total / sources.length;
      const minCoverage = Math.min(...coverages);
			const coverageScore = avgCoverage;
      
      // Debug logging to help diagnose UI/console mismatches
      console.log(`[recomputeCoverage] Avg: ${(avgCoverage*100).toFixed(1)}%, Min: ${(minCoverage*100).toFixed(1)}%, Score: ${(coverageScore*100).toFixed(1)}%`);
      
      covScoreEl.textContent = (coverageScore * 100).toFixed(1) + "%";
    } else {
      covScoreEl.textContent = "0.0%";
    }
	
	if (document.getElementById('minimizeSources').checked) {
	applyMinimize();
	}
	
	updateCoordTables();

  }
  cbColor.addEventListener('change', recomputeCoverage);

  function recomputeTiming() {
    if (!windDirs || windDirs.length === 0) return;
    computeDetectionEvents();
    computeDetectionMatrix();
    updateTimingMetrics();
  }

	/**
	 * Calculate source coverage using raw hourly wind samples (high precision)
	 * Uses measured wind data only (no uniform blending)
	 * @param {Object} source - Source with lat, lon properties
	 * @param {Array<{lat: number, lng: number, role: string}>} sensorPositions - Array of sensor positions
	 * @returns {number} Coverage probability (0-1)
	 */
  function calculateSourceCoverageSampleBased(source, sensorPositions) {
		// Use the fetched hourly wind arrays so this matches coverage chart calculations.
		if (!windDirs || windDirs.length === 0 || !windSpeeds || windSpeeds.length !== windDirs.length) {
			return null; // Signal to use histogram fallback when hourly data is unavailable
		}
    
		const emRateSelect = document.getElementById('emRate');
		const er = emRateSelect ? +emRateSelect.value : 5;
		const S = L.latLng(source.lat, source.lon);
		// Patch: ensure deltaH is defined from source
		const deltaH = getSourceDeltaH(source);

		// Pre-calculate sensor info once
		const sensorInfo = sensorPositions.map(sensor => {
			const sensorLL = L.latLng(sensor.lat, sensor.lng);
			const distance = S.distanceTo(sensorLL);
			const bearing = bearingDeg(source.lat, source.lon, sensorLL.lat, sensorLL.lng);
			return {
				role: sensor.role,
				distance,
				bearing,
			};
		});

		if (sensorInfo.length === 0) return 0;

		// --- MEASURED WIND SAMPLES ---
		let detectedHoursMeasured = 0;
		for (let h = 0; h < windDirs.length; h++) {
			const windDir = windDirs[h];
			const windSpeed = windSpeeds[h];

			if (!isFinite(windDir) || !isFinite(windSpeed) || windSpeed < DETECTION_MIN_WIND) continue;

			const downwind = (windDir + 180) % 360;
			let hourDetected = false;

			for (const sensor of sensorInfo) {
				let inRange = false;
				if (sensor.role === 'Sensor') {
					const sensorRange = getDetectionRadiusFor1PPM_Sensor(er, deltaH, windSpeed);
					const minR = getMinDetectionRadiusFor0_3PPM_Sensor(er, deltaH, windSpeed);
					inRange = sensorRange != null && sensor.distance <= sensorRange && sensor.distance >= (minR ?? 0);
				} else if (sensor.role === 'Custom0' || sensor.role === 'Custom1') {
					const idx = sensor.role === 'Custom0' ? 0 : 1;
					const customR = getDetectionRadiusForCustom(idx, er, deltaH, windSpeed);
					const minR = getMinDetectionRadiusForCustom(idx, er, deltaH, windSpeed);
					inRange = customR != null && sensor.distance <= customR && sensor.distance >= (minR ?? 0);
				}

				if (inRange && angDiff(sensor.bearing, downwind) <= TOL) {
					hourDetected = true;
					break;
				}
			}

			if (hourDetected) detectedHoursMeasured++;
		}
		const pMeasured = detectedHoursMeasured / windDirs.length;
		return pMeasured;
  }

  // ===== Upload / Download / Ingest =====
  
  /**
   * Import sensor and source data from GeoJSON FeatureCollection
   * Clears existing data and loads sources, devices, and wind samples from the feature collection
   * @param {Object} fc - GeoJSON FeatureCollection with sources and sensors
   */
	function ingestFeatureCollection(fc){
	  // Remove any device number labels added previously
	  try {
		devices.forEach(d => {
		  if (d && d.labelLayer) { map.removeLayer(d.labelLayer); d.labelLayer = null; }
		});
	  } catch(e) { console.warn('Label cleanup issue', e); }

	  // Clear map layers + arrays
	  sourcesLayer.clearLayers();
	  devicesLayer.clearLayers();
	  sources.length = 0;
	  devices.length = 0;

    // Siting upload always requires a fresh weather fetch — do not restore wind from file.
    // Clear any previously loaded wind data so the user is prompted to fetch.
    try{
      windDirs.length = 0;
      windSpeeds.length = 0;
      shortwave.length = 0;
      window.windDirs = windDirs;
      window.windSpeeds = windSpeeds;
      window.shortwave = shortwave;
      lastWindSamples = null;
      window.lastWindSamples = null;
      windDataOrigin = null;
      windControlSignatureAtLoad = null;
      updateWindDataStatus();
      setStatus('Siting loaded — please fetch wind data before computing coverage');
    }catch(e){ console.warn('Failed to reset wind on siting upload', e); }

	 // Restore site name only if the file actually provides a non-default name
	try{
	  const sRaw = fc?.properties?.site ?? fc?.properties?.siteName ?? fc?.properties?.Site;
	  const s = (typeof sRaw === 'string') ? sRaw.trim() : '';
	  // Only set if it's a real name (not empty and not the default "Site")
	  if (s && s.toLowerCase() !== 'site') {
		setSiteNameUI(s); // uses your helper to update input + header consistently
	  }
	}catch(e){ console.warn('Failed to restore site name from file', e); }

    // Restore custom sensors before ingesting device features so Custom0/Custom1 roles work
    try {
      const savedCS = fc?.properties?.customSensors;
      if (Array.isArray(savedCS)) {
        savedCS.forEach((cs, idx) => {
          if (cs && typeof cs.name === 'string' && typeof cs.mdl === 'number') {
            createCustomSensor(idx, cs.name, cs.mdl);
          }
        });
      }
    } catch(e) { console.warn('Failed to restore custom sensors from file', e); }

    (fc.features||[]).forEach(f=>{
      if (!f || !f.geometry || f.geometry.type!=='Point') return;
      const [lon,lat] = f.geometry.coordinates||[];
      if (!Number.isFinite(lat)||!Number.isFinite(lon)) return;
      const p = f.properties||{};
      const role  = (p.role || p.Role || 'Source');
      const label = (p.label ?? p.Label ?? 'Source');
      const typ   = (p.type  ?? p.CustomType ?? '');

      if (role==='Source'){
        const h = p.height || p.Height || (p.Location?.Height) || null;
        addEmissionSource(lat, lon, label, typ, h, false);
      } else if ((role === 'Custom0' || role === 'Custom1') && !customSensors[role === 'Custom0' ? 0 : 1]) {
        console.warn(`Skipping ${role} device — custom sensor not defined in file`);
      } else {
        addDevice(lat,lon, role);
      }
    });

    // Fit
    const hasBBox = Array.isArray(fc.bbox)&&fc.bbox.length===4&&fc.bbox.every(v=>typeof v==='number');
    if (hasBBox){
      const b=L.latLngBounds([fc.bbox[1],fc.bbox[0]],[fc.bbox[3],fc.bbox[2]]);
      if (b.isValid()) map.fitBounds(b,{padding:[20,20],maxZoom:19});
    } else {
      const sb = sourcesLayer.getBounds().isValid()? sourcesLayer.getBounds() : devicesLayer.getBounds();
      if (sb && sb.isValid()) map.fitBounds(sb,{padding:[20,20],maxZoom:19}); else map.setView([0,0],2);
    }

    recomputeCoverage();
    recomputeTiming();
	updateCoordTables();

  }

  /**
   * Convert legacy siting plan format to GeoJSON FeatureCollection
   * @param {Object} plan - Siting plan with PotentialEmissionSources array
   * @returns {Object} GeoJSON FeatureCollection
   */
  function convertSitingPlanToFC(plan){
    if (plan && plan.type==='FeatureCollection') return plan;
    const feats=[];
    const srcs=(plan && plan.PotentialEmissionSources)||[];
    for (const s of srcs){
      const loc=s?.Location||{}, lat=Number(loc.Latitude), lon=Number(loc.Longitude);
      if (!Number.isFinite(lat)||!Number.isFinite(lon)) continue;
      feats.push({
	  type:"Feature",
	  geometry:{ type:"Point", coordinates:[lon,lat] },
	  properties:{
		role:"Source",
		label:s.Label || "Source",
		type:s.CustomType || "",
		height: (s.Height != null ? Number(s.Height) : (s.Location?.Height != null ? Number(s.Location.Height) : null))
	  }
	});

    }
    let bbox;
    if (plan?.SiteBoundingBox?.NE && plan?.SiteBoundingBox?.SW){
      const NE=plan.SiteBoundingBox.NE, SW=plan.SiteBoundingBox.SW;
      const vals=[Number(SW.Longitude),Number(SW.Latitude),Number(NE.Longitude),Number(NE.Latitude)];
      if (vals.every(Number.isFinite)) bbox=vals;
    }
    return { type:"FeatureCollection", properties:{site: plan?.SiteName||"Site"}, ...(bbox?{bbox}:{}), features:feats };
  }

	/**
	 * Handle file upload for emission sources or complete siting data.
	 * Auto-detects format: FeatureCollection (full siting) vs SitingPlanData (sources only).
	 * @param {File} file - Uploaded file object
	 */
	function handleUpload(file) {
	  const reader = new FileReader();
	  reader.onload = e => {
		const json = JSON.parse(e.target.result);

		// --- 1) Try filename-based site name ---
		if (file && file.name) {
			let nameFromFile = file.name
			  .replace(/^sitingPlanData[\s_-]*/i, "")
			  .replace(/^siting[\s_-]*sensors[\s_-]*/i, "")
			  .replace(/\.json$/i, "")
			  .replace(/[\s_-]+/g, " ")
			  .trim();
		  if (nameFromFile) setSiteNameUI(nameFromFile);
		}

		// --- 2) Fallback: if JSON has a site name, use it ---
		if (json && typeof json.SiteName === 'string' && json.SiteName.trim()) {
		  setSiteNameUI(json.SiteName.trim());
		} else if (json?.properties?.site) {
		  setSiteNameUI(String(json.properties.site));
		} else if (json?.properties?.siteName) {
		  setSiteNameUI(String(json.properties.siteName));
		} else if (json?.properties?.Site) {
		  setSiteNameUI(String(json.properties.Site));
		}

		// --- 3) Ingest: convertSitingPlanToFC handles both formats transparently ---
		const fc = convertSitingPlanToFC(json);
		ingestFeatureCollection(fc);
	  };
	  reader.readAsText(file);
	}


  document.getElementById('uploadBtn').onclick = () => {
    const inp = document.getElementById('fileJson');
    inp.value = '';
    inp.onchange = ev => { const f = ev.target.files[0]; if (f) handleUpload(f); };
    inp.click();
  };
	document.getElementById('downloadBtn').onclick = async ()=>{
	  // 1) Build a FeatureCollection from current map state
	  const feats = [];

	  // Sources → GeoJSON points
	  sources.forEach(s=>{
		feats.push({
		  type: "Feature",
		  geometry: { type: "Point", coordinates: [s.lon, s.lat] },
		  properties: {
			role: "Source",
			label: s.label || "Source",
			type:  s.typ   || "",
			height: (s.height != null ? Number(s.height) : null)
		  }
		});
	  });

	  // Devices → GeoJSON points
	  devices.forEach(d=>{
		const ll = d.handle.getLatLng();
		feats.push({
		  type: "Feature",
		  geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
		  properties: {
			role: d.role,
			name: d.name || d.role
		  }
		});
	  });

	  // Include wind samples if present
	  const props = {
		site: (document.getElementById('siteName')?.value || 'Site').trim(),
	  };
	  if (lastWindSamples && Array.isArray(lastWindSamples.dirs) && Array.isArray(lastWindSamples.speeds)) {
		props.windSamples = {
		  dirs: lastWindSamples.dirs,
		  speeds: lastWindSamples.speeds,
		  provider: lastWindSamples.provider || 'manual',
		  start: lastWindSamples.start || null,
		  end: lastWindSamples.end || null
		};
	  }

	  props.customSensors = customSensors.map(cs => cs ? { name: cs.name, mdl: cs.mdl } : null);
  const fc = { type: "FeatureCollection", properties: props, features: feats };
	  const json = JSON.stringify(fc, null, 2);
	  const jsonBlob = new Blob([json], {type: "application/json"});

	  // 2) Generate KML for sensors only (devices)
	  const kmlContent = generateKML(devices, props.site);
	  const kmlBlob = new Blob([kmlContent], {type: "application/vnd.google-earth.kml+xml"});

	  // 3) Name = siting_sensors_[SITE].json/.kml
	  const siteRaw = props.site || 'Site';
	  const siteSlug = siteRaw.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g,'');
	  const jsonFileName = `siting_sensors_${siteSlug}.json`;
	  const kmlFileName = `siting_sensors_${siteSlug}.kml`;

	  // 4) Download JSON file
	  try {
		if (window.showSaveFilePicker) {
		  const handle = await window.showSaveFilePicker({
			suggestedName: jsonFileName,
			types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
		  });
		  const writable = await handle.createWritable();
		  await writable.write(jsonBlob);
		  await writable.close();
		} else {
		  const a = document.createElement('a');
		  a.href = URL.createObjectURL(jsonBlob);
		  a.download = jsonFileName;
		  document.body.appendChild(a);
		  a.click();
		  a.remove();
		  URL.revokeObjectURL(a.href);
		}
	  } catch(e) {
		console.warn('JSON save canceled or failed:', e);
	  }

	  // 5) Download KML file (small delay to allow first download to start)
	  setTimeout(async () => {
		try {
		  if (window.showSaveFilePicker) {
			const handle = await window.showSaveFilePicker({
			  suggestedName: kmlFileName,
			  types: [{ description: "KML", accept: { "application/vnd.google-earth.kml+xml": [".kml"] } }]
			});
			const writable = await handle.createWritable();
			await writable.write(kmlBlob);
			await writable.close();
		  } else {
			const a = document.createElement('a');
			a.href = URL.createObjectURL(kmlBlob);
			a.download = kmlFileName;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(a.href);
		  }
		} catch(e) {
		  console.warn('KML save canceled or failed:', e);
		}
	  }, 500);
	};

	// Helper function to generate KML from sensors
	/**
	 * Generate KML file content from sensor devices
	 * @param {Array} devices - Array of sensor device objects
	 * @param {string} siteName - Name of the site for KML document
	 * @returns {string} KML XML string
	 */
	function generateKML(devices, siteName) {
	  const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${siteName || 'Site'} - Sensor Siting</name>
    <description>Sensors to be installed</description>
`;

	  const placemarks = devices.map(d => {
		const ll = d.handle.getLatLng();
		const name = d.name || d.role;
		const role = d.role;
		return `    <Placemark>
      <name>${name}</name>
      <description>Type: ${role}</description>
      <Point>
        <coordinates>${ll.lng},${ll.lat},0</coordinates>
      </Point>
    </Placemark>`;
	  }).join('\n');

	  const footer = `
  </Document>
</kml>`;

	  return header + placemarks + footer;
	}



  // ===== Wind rose drawing + fetch (Open-Meteo ERA5) =====
  
  /**
   * Generate SVG path for a circular arc segment (wind rose wedge)
   * @param {number} r0 - Inner radius
   * @param {number} r1 - Outer radius
   * @param {number} a0 - Start angle (radians)
   * @param {number} a1 - End angle (radians)
   * @returns {string} SVG path data
   */
  function arcPath(r0,r1,a0,a1){
    var x0 = r0*Math.cos(a0), y0 = r0*Math.sin(a0);
    var x1 = r1*Math.cos(a0), y1 = r1*Math.sin(a0);
    var x2 = r1*Math.cos(a1), y2 = r1*Math.sin(a1);
    var x3 = r0*Math.cos(a1), y3 = r0*Math.sin(a1);
    var laf = (a1-a0) > Math.PI ? 1 : 0;
    return "M "+x1+" "+y1+" A "+r1+" "+r1+" 0 "+laf+" 1 "+x2+" "+y2+" L "+x3+" "+y3+" A "+r0+" "+r0+" 0 "+laf+" 0 "+x0+" "+y0+" Z";
  }
  
  /**
   * Draw wind rose diagram showing wind direction and speed distribution
   * @param {Array<Array<number>>} pct - 2D array of percentages [direction][speed_bin]
   */
  function drawRoseDeg(pct){
    var wrap=document.getElementById('roseWrap'); wrap.innerHTML='';
    var size=340,pad=16,Rr=(size/2)-pad,ns="http://www.w3.org/2000/svg";
    var svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox",(-size/2)+" "+(-size/2)+" "+size+" "+size);
    svg.setAttribute("width",size); svg.setAttribute("height",size); wrap.appendChild(svg);
    var grid=document.createElementNS(ns,"g"); grid.setAttribute("stroke","#ccc"); grid.setAttribute("fill","none"); svg.appendChild(grid);
    var wedges=document.createElementNS(ns,"g"); svg.appendChild(wedges);
    var labels=document.createElementNS(ns,"g"); labels.setAttribute("fill","#444"); labels.setAttribute("font-size","10"); svg.appendChild(labels);
    var totals=pct.map(r=> r.reduce((a,b)=>a+b,0)); var maxPct=Math.max(1e-6, Math.max.apply(null,totals)); var niceMax=Math.ceil(maxPct/10)*10;
    var rings=4, LAB=-25*Math.PI/180;
    for (var i=1;i<=rings;i++){
      var val=(niceMax*i/rings), rr=Rr*(val/niceMax);
      var c=document.createElementNS(ns,"circle"); c.setAttribute("r",rr); grid.appendChild(c);
      var lx=Math.cos(LAB)*rr, ly=Math.sin(LAB)*rr;
      var t=document.createElementNS(ns,"text"); t.setAttribute("x",lx); t.setAttribute("y",ly);
      t.setAttribute("dominant-baseline","middle"); t.setAttribute("transform","rotate("+(-25)+", "+lx+", "+ly+")");
      t.textContent=val.toFixed(0)+"%"; labels.appendChild(t);
    }
    for (var d=0; d<360; d+=45){
      var a=(d-90)*Math.PI/180, x=Math.cos(a)*(Rr+12), y=Math.sin(a)*(Rr+12);
      var tt=document.createElementNS(ns,"text"); tt.setAttribute("x",x); tt.setAttribute("y",y); tt.setAttribute("text-anchor","middle");
      tt.textContent=d+"°"; labels.appendChild(tt);
    }
    var dirCount=pct.length, bins=(pct[0]||[]).length, ang=2*Math.PI/dirCount;
    for (var i2=0;i2<dirCount;i2++){
      var acc=0;
      for (var j=0;j<bins;j++){
        var v=pct[i2][j];
        var r0=Rr*(acc/niceMax), r1=Rr*((acc+v)/niceMax); acc+=v;
        var a0=-Math.PI/2+i2*ang-ang/2, a1=a0+ang;
        var p=document.createElementNS(ns,"path");
        p.setAttribute("d",arcPath(r0,r1,a0,a1));
        p.setAttribute("fill",SPEED_COLS[j]);
        p.setAttribute("stroke","#222"); p.setAttribute("stroke-width","0.25");
        wedges.appendChild(p);
      }
    }
  }
  
  /**
   * Bin wind data into direction and speed categories for wind rose visualization
   * @param {Array<number>} dirs - Array of wind directions (degrees)
   * @param {Array<number>} speeds - Array of wind speeds (m/s)
   * @returns {Array<Array<number>>} 2D array of percentages [direction][speed_bin]
   */
  function computeBins(dirs,speeds){
    var counts=Array.from({length:DIR_BINS},()=>[0,0,0,0]);
    // normalize direction into a bin index
    var dIdx = d => Math.floor((((d % 360) + 360) % 360 + BIN_DEG/2) / BIN_DEG) % DIR_BINS;
    var sIdx=v=> v<2?0 : v<4?1 : v<6?2 : 3;
    for (var i=0;i<dirs.length;i++){
      var d=+dirs[i], s=+speeds[i]; if (!isFinite(d)||!isFinite(s)) continue;
      counts[dIdx(d)][sIdx(s)]++;
    }
    var N=Math.max(1,dirs.length);
    var pct=counts.map(row=> row.map(v=> v*100/N));
    var perDir=counts.map(r=> r.reduce((a,b)=>a+b,0)), sum=Math.max(1, perDir.reduce((a,b)=>a+b,0));
    dirProbs = perDir.map(v=> v/sum);
    return pct;
  }

  /**
   * Fetch historical wind data from Open-Meteo ERA5 archive
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @param {string} start - Start date (YYYY-MM-DD)
   * @param {string} end - End date (YYYY-MM-DD)
   * @returns {Promise<{dirs: number[], speeds: number[]}>} Wind directions and speeds
   */
  async function fetchOpenMeteo(lat,lon, start,end){
		const url = "https://archive-api.open-meteo.com/v1/era5"
			+ "?latitude="+lat+"&longitude="+lon
			+ "&start_date="+start+"&end_date="+end
			+ "&hourly=winddirection_10m,windspeed_10m,shortwave_radiation"
			+ "&timezone=UTC&windspeed_unit=ms";
    const r=await fetch(url); if(!r.ok) throw new Error("Open-Meteo HTTP "+r.status);
    const j=await r.json(), hh=j.hourly||{};
		return { 
			dirs: (hh.winddirection_10m || []).map(Number), 
			speeds: (hh.windspeed_10m || []).map(Number),
			radiation: (hh.shortwave_radiation || []).map(Number)
		};
  }
  
  document.getElementById('fetchWind').onclick = async ()=>{
    try{
      if(!sources.length){ alert('Load sources first (Upload Siting Plan or Upload JSON).'); return; }
      const lat = sources.reduce((a,s)=>a+s.lat,0)/sources.length;
      const lon = sources.reduce((a,s)=>a+s.lon,0)/sources.length;
      const s = startEl.value || new Date(Date.now()-30*864e5).toISOString().slice(0,10);
      const e = endEl.value   || new Date().toISOString().slice(0,10);
      const data = await fetchOpenMeteo(lat,lon,s,e);
			const pct=computeBins(data.dirs||[], data.speeds||[]);
			drawRoseDeg(pct);
			// Populate convenience arrays for timing calculations without replacing references.
			windDirs.length = 0;
			windSpeeds.length = 0;
			shortwave.length = 0;
			windDirs.push(...((data.dirs || []).map(Number)));
			windSpeeds.push(...((data.speeds || []).map(Number)));
			shortwave.push(...((data.radiation || []).map(Number)));
			window.windDirs = windDirs;
			window.windSpeeds = windSpeeds;
			window.shortwave = shortwave;
			setStatus(`Wind loaded • samples ${(data.dirs||[]).length}`);
			// remember raw wind samples so we can export/import them
			lastWindSamples = { dirs: (data.dirs||[]), speeds: (data.speeds||[]), radiation: (data.radiation||[]), provider: 'openmeteo', start: s, end: e };
			window.lastWindSamples = lastWindSamples;
			markWindDataLoaded('fetched', `openmeteo|${s}|${e}`);
			recomputeCoverage();
			recomputeTiming();
    }catch(err){ console.error(err); alert('Wind fetch error: '+err.message); }
  };

	if (startEl) {
		startEl.addEventListener('input', updateWindDataStatus);
		startEl.addEventListener('change', updateWindDataStatus);
	}
	if (endEl) {
		endEl.addEventListener('input', updateWindDataStatus);
		endEl.addEventListener('change', updateWindDataStatus);
	}

  // ===== Sources quick add by uploading; color toggle =====
  document.getElementById('colorByCov').addEventListener('change', recomputeCoverage);

	// ===== Detection radius lookup =====
	const DETECTION_SENSOR_HEIGHT = 1.5; // height of deployed sensors (m)
	const DETECTION_MIN_WIND = 1;      // minimum wind speed captured in lookup
	const DETECTION_MAX_DELTA_H = 20;
	const DETECTION_MAX_RADIUS = 300;  // lookup horizon; limit-hit entries are capped to this radius
	const NOMINAL_PROFILE_DEFAULT = { deltaH: 2, windSpeed: 3 };
	const NOMINAL_PROFILE_BY_RATE = {
		1: { deltaH: 2, windSpeed: 3 },
		2: { deltaH: 3, windSpeed: 3 },
		5: { deltaH: 5.5, windSpeed: 3 },
		10: { deltaH: 9, windSpeed: 3 },
		15: { deltaH: 11, windSpeed: 3 },
		100: { deltaH: 20, windSpeed: 3 }
	};

	window.__NOMINAL_PROFILE_BY_RATE = NOMINAL_PROFILE_BY_RATE;

	const detectionLookup = buildCustomLookup(0.3);
	let detectionEvents = [];

	function getSourceDeltaH(src) {
		const height = Number(src?.height);
		if (!Number.isFinite(height)) return 0;
		return Math.min(DETECTION_MAX_DELTA_H, Math.max(0, height - DETECTION_SENSOR_HEIGHT));
	}

	function getRadiusForDelta(cmdEntry, deltaKey, windSpeed, field = 'xdetect') {
		const deltaData = cmdEntry?.[String(deltaKey)];
		if (!deltaData) return undefined;
		const toRadius = (entry) => {
			if (!entry) return undefined;
			return entry[field] ?? null;
		};
		const speeds = Object.keys(deltaData)
			.map(val => Number(val))
			.filter(v => Number.isFinite(v))
			.sort((a, b) => a - b);
		if (!speeds.length) return undefined;
		if (windSpeed < speeds[0]) return null;
		const clampedSpeed = Math.min(windSpeed, speeds[speeds.length - 1]);
		let lowerIdx = 0;
		while (lowerIdx < speeds.length - 1 && speeds[lowerIdx + 1] <= clampedSpeed) {
			lowerIdx++;
		}
		const upperIdx = lowerIdx === speeds.length - 1 ? lowerIdx : lowerIdx + 1;
		const lowerSpeed = speeds[lowerIdx];
		const upperSpeed = speeds[upperIdx];
		const lowerEntry = deltaData?.[String(lowerSpeed)];
		const upperEntry = deltaData?.[String(upperSpeed)];
		const lowerRadius = toRadius(lowerEntry);
		const upperRadius = toRadius(upperEntry);
		if (lowerRadius === null && upperRadius === null) return null;
		if (lowerIdx === upperIdx || upperSpeed === lowerSpeed) return lowerRadius ?? upperRadius;
		if (lowerRadius === null) return upperRadius;
		if (upperRadius === null) return lowerRadius;
		const ratio = (Math.min(clampedSpeed, upperSpeed) - lowerSpeed) / (upperSpeed - lowerSpeed);
		return lowerRadius + (upperRadius - lowerRadius) * ratio;
	}

	function interpolateDetectionRadius(cmdEntry, deltaH, windSpeed, field = 'xdetect') {
		const deltaLo = Math.floor(deltaH);
		const deltaHi = Math.min(DETECTION_MAX_DELTA_H, Math.ceil(deltaH));
		const weight = deltaH - deltaLo;
		const radiusLo = getRadiusForDelta(cmdEntry, deltaLo, windSpeed, field);
		const radiusHi = (deltaHi === deltaLo)
			? radiusLo
			: getRadiusForDelta(cmdEntry, deltaHi, windSpeed, field);
		if (radiusLo === undefined && radiusHi === undefined) return undefined;
		if (radiusLo === null && radiusHi === null) return null;
		if (weight <= 0 || radiusHi === undefined) return radiusLo ?? radiusHi;
		if (radiusLo === undefined) return radiusHi;
		if (radiusLo === null) return radiusHi;
		if (radiusHi === null) return radiusLo;
		return radiusLo + (radiusHi - radiusLo) * weight;
	}

	function getDetectionRadiusFromLookup(emissionRate, deltaH, windSpeed) {
		const qrefKey = String(Math.round(emissionRate * 1000));
		const cmdEntry = detectionLookup[qrefKey];
		if (!cmdEntry) return undefined;
		return interpolateDetectionRadius(cmdEntry, deltaH, windSpeed);
	}

	function getDetectionRadiusFor1PPM_Sensor(emissionRate, deltaH, windSpeed) {
		const r = getDetectionRadiusFromLookup(emissionRate, deltaH, windSpeed);
		if (r !== undefined) return r;
		return Sensor_1PPM_R[emissionRate] || 150;
	}

	// ===== Custom Sensor State =====
	function getMinDetectionRadiusFromLookup(emissionRate, deltaH, windSpeed) {
		const qrefKey = String(Math.round(emissionRate * 1000));
		const cmdEntry = detectionLookup[qrefKey];
		if (!cmdEntry) return undefined;
		return interpolateDetectionRadius(cmdEntry, deltaH, windSpeed, 'xdetect_min');
	}

	function getMinDetectionRadiusFor0_3PPM_Sensor(emissionRate, deltaH, windSpeed) {
		const r = getMinDetectionRadiusFromLookup(emissionRate, deltaH, windSpeed);
		return r !== undefined ? r : 0;
	}

	function getMinDetectionRadiusForCustom(sensorIdx, emissionRate, deltaH, windSpeed) {
		const cs = customSensors[sensorIdx];
		if (!cs || !cs.lookup) return undefined;
		const qrefKey = String(Math.round(emissionRate * 1000));
		const cmdEntry = cs.lookup[qrefKey];
		if (!cmdEntry) return undefined;
		return interpolateDetectionRadius(cmdEntry, deltaH, windSpeed, 'xdetect_min');
	}

	/**
	 * Build a detection lookup table for a custom sensor MDL using the Gaussian plume model.
	 * Structure: lookup[qrefKey][deltaHKey][wsKey] = { xdetect, xdetect_min, limit_hit }
	 * @param {number} mdlPpm - Minimum detection limit in ppm
	 * @returns {Object} Lookup table
	 */
	function buildCustomLookup(mdlPpm) {
		const Zs = 1.5;       // sensor height (m)
		const z0 = 0.05;      // roughness length
		const k = 0.4;        // von Karman constant
		const step = 0.1;     // x step size (m)
		const max_x = 300.0;
		const QREFS = [1000, 2000, 5000, 10000, 15000, 100000];
		const WIND_SPEEDS = [1, 2, 3, 5, 10];

		const lookup = {};

		for (const Qref of QREFS) {
			const qrefKey = String(Qref);
			lookup[qrefKey] = {};
			const Qgps = Qref / 3600.0;
			const Srate = Qgps * (24.45 * 1000.0) / 16.04;

			for (let delta_H = 0; delta_H <= 20; delta_H++) {
				const deltaHKey = String(delta_H);
				lookup[qrefKey][deltaHKey] = {};
				const H = Zs + delta_H;

				for (const U of WIND_SPEEDS) {
					const ustar = U * k / Math.log(H / z0);
					const sigma_v = 2.5 * ustar;
					const sigma_w = 1.3 * ustar;
					const TLy = 3 * H / ustar;
					const TLz = 0.33 * H / sigma_w;

					let prev_c = null;
					let prev_x = null;
					let rising_cross = null;
					let falling_cross = null;
					let c_at_limit = null;

					const num_steps = Math.floor((max_x - 0.5) / step) + 1;
					for (let i = 0; i < num_steps; i++) {
						const x = 0.5 + i * step;
						const t = x / U;
						const sigma_y = (TLy > 0) ? sigma_v * t / (1 + Math.sqrt(t / TLy)) : Infinity;
						const sigma_z = (TLz > 0) ? sigma_w * t / (1 + Math.sqrt(t / (2 * TLz))) : Infinity;
						if (sigma_y <= 0 || sigma_z <= 0 || !isFinite(sigma_y) || !isFinite(sigma_z)) { prev_c = null; prev_x = x; continue; }

						const exp_term =
							Math.exp(-((Zs - H) ** 2) / (2 * sigma_z ** 2)) +
							Math.exp(-((Zs + H) ** 2) / (2 * sigma_z ** 2));
						const C = Srate / (2 * Math.PI * U * sigma_y * sigma_z) * exp_term;
						c_at_limit = C;

						if (prev_c !== null) {
							if (prev_c < mdlPpm && C >= mdlPpm && rising_cross === null) {
								const ratio = (C !== prev_c) ? (mdlPpm - prev_c) / (C - prev_c) : 0;
								rising_cross = prev_x + ratio * (x - prev_x);
							}
							if (prev_c >= mdlPpm && C <= mdlPpm && falling_cross === null) {
								const ratio = (prev_c !== C) ? (prev_c - mdlPpm) / (prev_c - C) : 0;
								falling_cross = prev_x + ratio * (x - prev_x);
							}
						}
						prev_c = C;
						prev_x = x;
					}

					const limit_hit = (c_at_limit !== null && c_at_limit >= mdlPpm);
					let xdetect = falling_cross;
					if (xdetect === null && limit_hit) xdetect = max_x;
					if (xdetect !== null) xdetect = Math.min(xdetect, max_x);

					let xdetect_min = null;
					if (rising_cross !== null) {
						xdetect_min = Math.round(Math.min(rising_cross, max_x) * 1000) / 1000;
					} else if (limit_hit) {
						xdetect_min = 0; // concentration starts above MDL — no lower bound
					}
					lookup[qrefKey][deltaHKey][String(U)] = { xdetect, xdetect_min, limit_hit };
				}
			}
		}
		return lookup;
	}

	function getDetectionRadiusForCustom(sensorIdx, emissionRate, deltaH, windSpeed) {
		const cs = customSensors[sensorIdx];
		if (!cs || !cs.lookup) return undefined;
		const qrefKey = String(Math.round(emissionRate * 1000));
		const qEntry = cs.lookup[qrefKey];
		if (!qEntry) return undefined;
		return interpolateDetectionRadius(qEntry, deltaH, windSpeed);
	}

	/**
	 * Update the slot UI for a given custom sensor slot (0 or 1).
	 * Shows empty state or active state depending on customSensors[slotIdx].
	 */
	function updateCustomSlotUI(slotIdx) {
		const cs = customSensors[slotIdx];
		const emptyEl = document.getElementById(`customSlot${slotIdx}Empty`);
		const activeEl = document.getElementById(`customSlot${slotIdx}Active`);
		const labelEl = document.getElementById(`customSlot${slotIdx}Label`);
		const legendEl = document.getElementById(`legendCustom${slotIdx}`);
		const legendLabelEl = document.getElementById(`legendCustom${slotIdx}Label`);

		if (cs) {
			if (emptyEl) emptyEl.style.display = 'none';
			if (activeEl) activeEl.style.display = 'flex';
			if (labelEl) labelEl.textContent = `${cs.name} (${cs.mdl} ppm)`;
			if (legendEl) legendEl.style.display = '';
			if (legendLabelEl) legendLabelEl.textContent = `${cs.name} (${cs.mdl} ppm)`;
		} else {
			if (emptyEl) emptyEl.style.display = 'flex';
			if (activeEl) activeEl.style.display = 'none';
			if (legendEl) legendEl.style.display = 'none';
		}
	}

	/**
	 * Create (or replace) a custom sensor in slot slotIdx.
	 * Builds the lookup table synchronously then refreshes map state.
	 * @param {number} slotIdx - 0 or 1
	 * @param {string} name - Sensor name
	 * @param {number} mdlPpm - MDL in ppm
	 */
	function createCustomSensor(slotIdx, name, mdlPpm) {
		const lookup = buildCustomLookup(mdlPpm);
		customSensors[slotIdx] = {
			name,
			mdl: mdlPpm,
			color: CUSTOM_SENSOR_COLORS[slotIdx],
			lookup,
		};
		updateCustomSlotUI(slotIdx);
		applyRanges();
	}

	/**
	 * Remove a custom sensor slot: nulls state, removes placed devices, refreshes.
	 * @param {number} slotIdx - 0 or 1
	 */
	function removeCustomSensor(slotIdx) {
		customSensors[slotIdx] = null;
		const role = `Custom${slotIdx}`;
		const toRemove = devices.filter(d => d.role === role);
		toRemove.forEach(d => {
			devicesLayer.removeLayer(d.handle);
			devicesLayer.removeLayer(d.inner);
			devicesLayer.removeLayer(d.outer);
			if (d.labelLayer) map.removeLayer(d.labelLayer);
		});
		for (let i = devices.length - 1; i >= 0; i--) {
			if (devices[i].role === role) devices.splice(i, 1);
		}
		updateCustomSlotUI(slotIdx);
		updateCoordTables();
		applyRanges();
	}

	function getNominalProfileForRate(emissionRate) {
		return NOMINAL_PROFILE_BY_RATE[emissionRate] ?? NOMINAL_PROFILE_DEFAULT;
	}

	window.__getNominalProfileForRate = getNominalProfileForRate;

	function getNominalSensorRadius(emissionRate = +emSel.value || 1) {
		const nominalProfile = getNominalProfileForRate(emissionRate);
		return getDetectionRadiusFor1PPM_Sensor(emissionRate, nominalProfile.deltaH, nominalProfile.windSpeed);
	}

	window.__getNominalSensorRadius = getNominalSensorRadius;

	function roundDetectionHours(value) {
		if (value === null || value === undefined || !Number.isFinite(value)) return null;
		return Math.max(0, Math.round(value));
	}



	// detectionMatrix: [sourceIndex][startHour] -> hours to detection (or null)
	let detectionMatrix = [];

	function computeDetectionEvents() {
		syncPublicTimingState();
		if (!windDirs || windDirs.length === 0) {
			alert("Please fetch wind data first.");
			return;
		}
		const HOURS = windDirs.length;
		detectionEvents = sources.map(() => new Array(HOURS).fill(null));
		const emissionRate = +emSel.value;
		sources.forEach((src, sIdx) => {
			const deltaH = getSourceDeltaH(src);
			const S = L.latLng(src.lat, src.lon);
			for (let h = 0; h < HOURS; h++) {
				const dir = windDirs[h];
				const speed = windSpeeds[h];
				if (!Number.isFinite(dir) || !Number.isFinite(speed) || speed < DETECTION_MIN_WIND) continue;
				const downwind = (dir + 180) % 360;
				let best = detectionEvents[sIdx][h];
				if (!Number.isFinite(best)) best = Infinity;
				devices.forEach(dev => {
					const ll = dev.handle.getLatLng();
					const d = S.distanceTo(ll);
					if (dev.role === 'Sensor') {
						const radius = getDetectionRadiusFor1PPM_Sensor(emissionRate, deltaH, speed);
						if (radius == null) return;
						const minR = getMinDetectionRadiusFor0_3PPM_Sensor(emissionRate, deltaH, speed);
						if (d <= radius && d >= (minR ?? 0)) {
							const bearingSD = bearingDeg(src.lat, src.lon, ll.lat, ll.lng);
							const diff = angDiff(bearingSD, downwind);
							if (diff <= TOL) {
								const dt = d / (speed * 3600);
								if (dt < best) best = dt;
							}
						}
					}
					if (dev.role === 'Custom0' || dev.role === 'Custom1') {
						const idx = dev.role === 'Custom0' ? 0 : 1;
						const customRadius = getDetectionRadiusForCustom(idx, emissionRate, deltaH, speed);
						if (customRadius == null) return;
						const minR = getMinDetectionRadiusForCustom(idx, emissionRate, deltaH, speed);
						if (d <= customRadius && d >= (minR ?? 0)) {
							const bearingSD = bearingDeg(src.lat, src.lon, ll.lat, ll.lng);
							const diff = angDiff(bearingSD, downwind);
							if (diff <= TOL) {
								const dt = d / (speed * 3600);
								if (dt < best) best = dt;
							}
						}
					}
				});
				detectionEvents[sIdx][h] = Number.isFinite(best) && best !== Infinity ? best : null;
			}
		});
	}

	function computeDetectionMatrix() {
		syncPublicTimingState();
		const HOURS = windDirs.length;
		detectionMatrix = sources.map(() => new Array(HOURS).fill(null));
		detectionEvents.forEach((eventArr, sIdx) => {
			let nextHour = null;
			let nextOffset = null;
			for (let h = HOURS - 1; h >= 0; h--) {
				const offset = eventArr[h];
				if (offset !== null && offset !== undefined) {
					nextHour = h;
					nextOffset = offset;
				}
				if (nextHour !== null) {
					const hoursToDetection = (nextHour - h) + (nextOffset || 0);
					detectionMatrix[sIdx][h] = roundDetectionHours(hoursToDetection);
				}
			}
		});
		window.detectionMatrix = detectionMatrix;
	}

	function updateTimingMetrics() {
		const HOURS = windDirs.length;
		let sumOfHours = 0;
		let detectedAtAllCount = 0;
		const allDetectionTimes = [];
		let emptyCells = 0;
		const totalCells = detectionMatrix.length * HOURS;

		detectionMatrix.forEach(row => {
			row.forEach(v => {
				const roundedValue = roundDetectionHours(v);
				if (roundedValue === null) {
					emptyCells++;
					return;
				}
				sumOfHours += roundedValue;
				detectedAtAllCount++;
				allDetectionTimes.push(roundedValue);
			});
		});

		const mean = detectedAtAllCount > 0 ? sumOfHours / detectedAtAllCount : 0;
		document.getElementById('meanDetect').textContent = detectedAtAllCount > 0 ? Math.round(mean) + ' h' : 'N/A';

		allDetectionTimes.sort((a, b) => a - b);
		const medianValue = allDetectionTimes.length > 0 ?
			(allDetectionTimes.length % 2 === 0 ?
				(allDetectionTimes[allDetectionTimes.length / 2 - 1] + allDetectionTimes[allDetectionTimes.length / 2]) / 2 :
				allDetectionTimes[Math.floor(allDetectionTimes.length / 2)]) :
			0;
		document.getElementById('medianDetect').textContent = allDetectionTimes.length > 0 ? Math.round(medianValue) + ' h' : 'N/A';

		const p90Idx = Math.floor(0.9 * allDetectionTimes.length);
		const p90Value = allDetectionTimes.length > 0 ? allDetectionTimes[p90Idx] : 0;
		document.getElementById('p90Detect').textContent = allDetectionTimes.length > 0 ? Math.round(p90Value) + ' h' : 'N/A';

		const emptyEl = document.getElementById('emptyCellsPct');
		if (emptyEl) {
			if (sources.length > 0) {
				const undetectedCount = detectionMatrix.filter(row => row.every(v => v === null)).length;
				emptyEl.textContent = `${undetectedCount} of ${sources.length}`;
				emptyEl.style.color = undetectedCount === 0 ? '#16a34a' : '#dc2626';
			} else {
				emptyEl.textContent = 'N/A';
				emptyEl.style.color = '';
			}
		}
		updateCoordTables();
	}

	function openDataExplorer() {
		const HOURS = windDirs.length;
		const emissionRate = +emSel.value;
		const siteName = siteNameEl.value || 'Site';

		// Build per-cell detection info: which sensors detected each source each hour
		const cellInfo = sources.map((src, sIdx) => {
			const S = L.latLng(src.lat, src.lon);
			const deltaH = getSourceDeltaH(src);
			return Array.from({ length: HOURS }, (_, h) => {
				const dir = windDirs[h];
				const speed = windSpeeds[h];
				if (!Number.isFinite(dir) || !Number.isFinite(speed)) {
					return { detectedBy: [], windDir: dir, windSpeed: speed };
				}
				const downwind = (dir + 180) % 360;
				const detectedBy = [];
				devices.forEach((dev, dIdx) => {
					const ll = dev.handle.getLatLng();
					const d = S.distanceTo(ll);
					const roleLabel = dev.role === 'Sensor' ? '0.3ppm Sensor'
						: dev.role;
					const label = `${roleLabel} #${dIdx + 1}`;
					if (dev.role === 'Sensor') {
						const radius = getDetectionRadiusFor1PPM_Sensor(emissionRate, deltaH, speed);
						const minR = getMinDetectionRadiusFor0_3PPM_Sensor(emissionRate, deltaH, speed);
						if (radius != null && d <= radius && d >= (minR ?? 0)) {
							const b = bearingDeg(src.lat, src.lon, ll.lat, ll.lng);
							if (angDiff(b, downwind) <= TOL) detectedBy.push(label);
						}
					} else if (dev.role === 'Custom0' || dev.role === 'Custom1') {
						const idx = dev.role === 'Custom0' ? 0 : 1;
						const cs = customSensors[idx];
						const devLabel = cs ? `${cs.name} #${dIdx + 1}` : label;
						const customRadius = getDetectionRadiusForCustom(idx, emissionRate, deltaH, speed);
						const minR = getMinDetectionRadiusForCustom(idx, emissionRate, deltaH, speed);
						if (customRadius != null && d <= customRadius && d >= (minR ?? 0)) {
							const b = bearingDeg(src.lat, src.lon, ll.lat, ll.lng);
							if (angDiff(b, downwind) <= TOL) detectedBy.push(devLabel);
						}
					}
				});
				return { detectedBy, windDir: dir, windSpeed: speed };
			});
		});

		// Compute per-source stats
		const sourceStats = detectionMatrix.map((row) => {
			const validTTDs = row.filter(v => v !== null && Number.isFinite(v));
			const zeroCount = row.filter(v => v === 0).length;
			const coverage = HOURS > 0 ? zeroCount / HOURS : 0;
			if (validTTDs.length === 0) return { coverage, mean: null, median: null, p90: null };
			const sorted = [...validTTDs].sort((a, b) => a - b);
			const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
			const mid = Math.floor(sorted.length / 2);
			const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
			const p90Idx = Math.ceil(sorted.length * 0.9) - 1;
			const p90 = sorted[Math.max(0, p90Idx)];
			return { coverage, mean, median, p90 };
		});

		const payload = {
			siteName,
			emissionRate,
			hours: HOURS,
			startDate: lastWindSamples?.start || null,
			sourceLabels: sources.map((s, i) => s.label || `Source_${i}`),
			windDirs: Array.from(windDirs),
			windSpeeds: Array.from(windSpeeds),
			detectionMatrix: detectionMatrix.map(row => Array.from(row)),
			cellInfo,
			sourceStats,
		};

		const win = window.open('', '_blank');
		if (!win) { alert('Please allow pop-ups for this site to use Explore Data.'); return; }
		win.document.write(buildExplorerHTML(payload));
		win.document.close();
	}

	function buildExplorerHTML(p) {
		const fmt1 = v => (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(1);
		const fmtPct = v => (v == null || !Number.isFinite(v)) ? '—' : (v * 100).toFixed(1) + '%';

		// Build table header — stat columns first
		let headerCells = '<th>Source</th>';
		headerCells += '<th>Coverage</th><th>Mean TTD (h)</th><th>Median TTD (h)</th><th>P90 TTD (h)</th>';
		for (let h = 0; h < p.hours; h++) headerCells += `<th>H${h}</th>`;

		// Build table rows
		const rows = p.sourceLabels.map((label, sIdx) => {
			const matRow = p.detectionMatrix[sIdx];
			const info = p.cellInfo[sIdx];
			const stats = p.sourceStats[sIdx];

			let cells = `<td class="src-label">${label}</td>`;
			cells += `<td class="stat">${fmtPct(stats.coverage)}</td>`;
			cells += `<td class="stat">${fmt1(stats.mean)}</td>`;
			cells += `<td class="stat">${fmt1(stats.median)}</td>`;
			cells += `<td class="stat">${fmt1(stats.p90)}</td>`;

			for (let h = 0; h < p.hours; h++) {
				const ttd = matRow[h];
				const ci = info[h];
				const hasVal = ttd !== null && Number.isFinite(ttd);
				let cls = 'cell-none';
				if (hasVal) {
					cls = ttd === 0 ? 'cell-zero' : 'cell-detected';
				}
				const display = hasVal ? ttd : '';

				let hourTimestamp = 'N/A';
				if (p.startDate) {
					const startDate = new Date(p.startDate + 'T00:00:00Z');
					const hourDate = new Date(startDate.getTime() + h * 3600000);
					const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
					const month = months[hourDate.getUTCMonth()];
					const day = String(hourDate.getUTCDate()).padStart(2, '0');
					const hour = String(hourDate.getUTCHours()).padStart(2, '0');
					hourTimestamp = `${month}-${day} ${hour}h UTC`;
				}
				const wd = Number.isFinite(ci.windDir) ? ci.windDir.toFixed(0) + '°' : 'N/A';
				const ws = Number.isFinite(ci.windSpeed) ? ci.windSpeed.toFixed(1) + ' m/s' : 'N/A';
				const sensors = ci.detectedBy.length > 0 ? ci.detectedBy.join(', ') : 'None';

				const tipLines = [
					`Hour: ${hourTimestamp}`,
					`Wind Dir: ${wd}`,
					`Wind Speed: ${ws}`,
					`Detected by: ${sensors}`,
				].join('&#10;');

				cells += `<td class="${cls}" data-tip="${tipLines}">${display}</td>`;
			}

			return `<tr>${cells}</tr>`;
		}).join('');

		// Build per-hour timestamps for CSV
		const hourTimestamps = Array.from({ length: p.hours }, (_, h) => {
			if (!p.startDate) return `H${h}`;
			const startDate = new Date(p.startDate + 'T00:00:00Z');
			const hourDate = new Date(startDate.getTime() + h * 3600000);
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const month = months[hourDate.getUTCMonth()];
			const day = String(hourDate.getUTCDate()).padStart(2, '0');
			const hour = String(hourDate.getUTCHours()).padStart(2, '0');
			return `${month}-${day} ${hour}h UTC`;
		});

		// Build CSV content
		const csvRows = [];
		const csvHeader = ['Source', 'Coverage', 'Mean TTD (h)', 'Median TTD (h)', 'P90 TTD (h)',
			...Array.from({ length: p.hours }, (_, h) => `H${h}`)];
		csvRows.push(csvHeader.join(','));
		// Timestamp row
		const timestampRow = ['Timestamp', '', '', '', '', ...hourTimestamps];
		csvRows.push(timestampRow.join(','));
		p.sourceLabels.forEach((label, sIdx) => {
			const matRow = p.detectionMatrix[sIdx];
			const stats = p.sourceStats[sIdx];
			const row = [
				JSON.stringify(label),
				stats.coverage != null ? (stats.coverage * 100).toFixed(1) + '%' : '',
				stats.mean != null ? stats.mean.toFixed(1) : '',
				stats.median != null ? stats.median.toFixed(1) : '',
				stats.p90 != null ? stats.p90.toFixed(1) : '',
				...matRow.map(v => (v !== null && Number.isFinite(v)) ? v : ''),
			];
			csvRows.push(row.join(','));
		});
		// Weather rows
		const windDirRow = ['Wind Direction (°)', '', '', '', '',
			...p.windDirs.map(v => Number.isFinite(v) ? v.toFixed(0) : '')];
		csvRows.push(windDirRow.join(','));
		const windSpeedRow = ['Wind Speed (m/s)', '', '', '', '',
			...p.windSpeeds.map(v => Number.isFinite(v) ? v.toFixed(1) : '')];
		csvRows.push(windSpeedRow.join(','));
		const csvContent = JSON.stringify(csvRows.join('\n'));

		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Data Explorer — ${p.siteName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; font-size: 12px; background: #f5f5f5; color: #222; }
  h1 { padding: 12px 16px; font-size: 16px; background: #1e293b; color: #f8fafc; }
  h1 span { font-weight: normal; font-size: 13px; opacity: 0.75; margin-left: 8px; }
  .toolbar { padding: 6px 12px; background: #fff; border-bottom: 1px solid #e2e8f0; display: flex; gap: 8px; align-items: center; }
  .toolbar button { padding: 4px 12px; font-size: 12px; border-radius: 4px; border: 1px solid #cbd5e1; background: #f1f5f9; cursor: pointer; }
  .toolbar button:hover { background: #e2e8f0; }
  .scroll-wrap { overflow: auto; max-height: calc(100vh - 96px); padding: 12px; }
  table { border-collapse: collapse; white-space: nowrap; }
  th, td { border: 1px solid #d1d5db; padding: 3px 6px; text-align: center; }
  th { background: #1e293b; color: #f8fafc; position: sticky; top: 0; z-index: 2; font-weight: 600; }
  th:first-child { left: 0; z-index: 3; }
  td.src-label { background: #f1f5f9; font-weight: 600; text-align: left; position: sticky; left: 0; z-index: 1; }
  td.cell-zero { background: #bbf7d0; }
  td.cell-detected { background: #fef9c3; }
  td.cell-none { background: #fff; color: #9ca3af; }
  td.stat { background: #e0e7ef; font-weight: 600; }
  /* Tooltip */
  [data-tip] { cursor: default; position: relative; }
  [data-tip]:hover::after {
    content: attr(data-tip);
    white-space: pre;
    position: fixed;
    background: rgba(15,23,42,0.95);
    color: #f8fafc;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 11px;
    line-height: 1.6;
    pointer-events: none;
    z-index: 9999;
    max-width: 260px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    top: var(--ty, auto);
    left: var(--tx, auto);
  }
  .legend { display: flex; gap: 16px; padding: 8px 16px; font-size: 11px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #d1d5db; }
</style>
</head>
<body>
<h1>Data Explorer<span>— ${p.siteName} &nbsp;|&nbsp; Emission rate: ${p.emissionRate} kg/h &nbsp;|&nbsp; ${p.hours} hours</span></h1>
<div class="toolbar">
  <button id="csvBtn">⬇ Download CSV</button>
</div>
<div class="legend">
  <div class="legend-item"><div class="legend-swatch" style="background:#bbf7d0"></div>TTD = 0 h (immediate detection)</div>
  <div class="legend-item"><div class="legend-swatch" style="background:#fef9c3"></div>TTD &gt; 0 h</div>
  <div class="legend-item"><div class="legend-swatch" style="background:#fff; color:#9ca3af">—</div>Not detected</div>
</div>
<div class="scroll-wrap">
<table>
<thead><tr>${headerCells}</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>
<script>
document.addEventListener('mousemove', e => {
  const tx = Math.min(e.clientX + 14, window.innerWidth - 270);
  const ty = Math.min(e.clientY + 14, window.innerHeight - 160);
  document.documentElement.style.setProperty('--tx', tx + 'px');
  document.documentElement.style.setProperty('--ty', ty + 'px');
});
document.getElementById('csvBtn').addEventListener('click', () => {
  const csv = ${csvContent};
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ${JSON.stringify(p.siteName.replace(/[^a-z0-9_-]/gi, '_') + '_detection.csv')};
  a.click();
  URL.revokeObjectURL(url);
});
</script>
</body>
</html>`;
	}

	const recomputeBtn = document.getElementById('recomputeTiming');
	if (recomputeBtn) {
		recomputeBtn.addEventListener('click', () => {
			recomputeCoverage();
			computeDetectionEvents();
			computeDetectionMatrix();
			updateTimingMetrics();
			const csvBtn = document.getElementById('exploreData');
			if (csvBtn) csvBtn.disabled = false;
		});
	}
	const exportCsvBtn = document.getElementById('exploreData');
	if (exportCsvBtn) exportCsvBtn.addEventListener('click', openDataExplorer);


	// ===== Auto-populate wind-rose date range (previous 12 full months) =====
	(function setDefaultWindDates() {
	  const today = new Date();

	  // Start: first day of same month, previous year
	  const start = new Date(today.getFullYear() - 1, today.getMonth(), 1);

	  // End: last day of previous month (so if today = Oct 8, end = Sept 30)
	  const end = new Date(today.getFullYear(), today.getMonth(), 0);

	  // Format YYYY-MM-DD (preserves leading zeros)
	  const fmt = d => {
		const y = d.getFullYear();
		const m = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${m}-${day}`;
	  };

	  const startField = document.getElementById("startDate");
	  const endField = document.getElementById("endDate");
	  if (startField && endField) {
		startField.value = fmt(start);
		endField.value = fmt(end);
		updateWindDataStatus();
	  }
	})();
  applyRanges();

	// ===== Per-source TTD stats from detectionMatrix =====
	function getSourceTTDStats(sIdx) {
		if (!detectionMatrix || !detectionMatrix[sIdx]) return { p50: null, p90: null };
		const row = detectionMatrix[sIdx];
		const validTTDs = row.filter(v => v !== null && Number.isFinite(v));
		if (validTTDs.length === 0) return { p50: null, p90: null };
		const sorted = [...validTTDs].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		const p50 = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
		const p90Idx = Math.ceil(sorted.length * 0.9) - 1;
		const p90 = sorted[Math.max(0, p90Idx)];
		return { p50, p90 };
	}

		// ===== Compact coordinate tables =====
	function updateCoordTables() {
	  const srcBody = document.querySelector('#srcTable tbody');
	  const devBody = document.querySelector('#devTable tbody');
	  const srcCountEl = document.getElementById('srcCount');
	  const devCountEl = document.getElementById('devCount');
	  if (!srcBody || !devBody) return;

	  srcBody.innerHTML = '';
	  devBody.innerHTML = '';

	  // emission sources
	  for (let sIdx = 0; sIdx < sources.length; sIdx++) {
		const s = sources[sIdx];
		const tr = document.createElement('tr');
		const sourceLL = L.latLng(s.lat, s.lon);
		const nearestDistance = devices.length > 0
		  ? devices.reduce((minDist, d) => {
			  const dLL = d.handle.getLatLng();
			  const dist = sourceLL.distanceTo(dLL);
			  return Math.min(minDist, dist);
		    }, Number.POSITIVE_INFINITY)
		  : null;
		const fmtCov = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
		const fmtTTD = v => (v == null || !Number.isFinite(v)) ? '—' : v.toFixed(1);
		const fmtDist = v => (v == null || !Number.isFinite(v)) ? '—' : Math.round(v).toString();
		const covPct = (s.coverage != null) ? fmtCov(s.coverage) : '—';
		const ttdStats = getSourceTTDStats(sIdx);
		tr.innerHTML =
		  `<td style="padding:2px;">${s.typ || '-'}</td>` +
		  `<td style="padding:2px;">${s.label || '-'}</td>` +
		  `<td style="padding:2px;" align="right" data-col="height" data-meters="${s.height != null ? s.height : ''}">
		    ${s.height != null ? s.height.toFixed(2) : '-'}
		  </td>` +
		  `<td style="padding:2px;" align="right">${covPct}</td>` +
		  `<td style="padding:2px;" align="right">${fmtTTD(ttdStats.p50)}</td>` +
		  `<td style="padding:2px;" align="right">${fmtTTD(ttdStats.p90)}</td>` +
		  `<td style="padding:2px;" align="right">${fmtDist(nearestDistance)}</td>`;

		srcBody.appendChild(tr);
	  }

	  // sensors / devices
		// sort sensors NW → SE (lat desc, lon asc)
		const typeOrder = ["Sensor", "Custom0", "Custom1"];
		const sortedDevices = [...devices].sort((a, b) => {
		  const orderA = typeOrder.indexOf(a.role);
		  const orderB = typeOrder.indexOf(b.role);
		  if (orderA !== orderB) return orderA - orderB;

		  // within same type, order by NW→SE
		  const llA = a.handle.getLatLng();
		  const llB = b.handle.getLatLng();
		  return llB.lat - llA.lat || llA.lng - llB.lng;
		});

		// track numbering per sensor type
		const typeCounters = { Sensor: 0, Custom0: 0, Custom1: 0 };

		sortedDevices.forEach(d => {
		  const ll = d.handle.getLatLng();
		  let base, color;
		  if (d.role === 'Sensor') { base = '0.3ppm'; color = '#19a355'; }
		  else if (d.role === 'Custom0' || d.role === 'Custom1') {
		    const idx = d.role === 'Custom0' ? 0 : 1;
		    const cs = customSensors[idx];
		    base = cs ? cs.name : d.role;
		    color = CUSTOM_SENSOR_COLORS[idx];
		  } else { base = 'Device'; color = '#444'; }

		  typeCounters[d.role] = (typeCounters[d.role] || 0) + 1;
		  d.name = `${base} ${typeCounters[d.role]}`;

		  if (d.labelLayer) map.removeLayer(d.labelLayer);
            const labelNum = typeCounters[d.role];
			const lbl = L.marker(ll, {
			  icon: L.divIcon({
				html: `<div style="color:${color};font-size:11px;font-weight:600;text-shadow:1px 1px 2px rgba(255,255,255,0.8);transform:translate(16px,8px);">${labelNum}</div>`,
			  className: "",
			}),
			interactive: false,
			zIndexOffset: getZIndexForRole(d.role) + 500,
		  }).addTo(map);
          if (lbl && lbl.setZIndexOffset) lbl.setZIndexOffset(getZIndexForRole(d.role) + 500);
          d.labelLayer = lbl;
		});

      sortedDevices.forEach(d => {
        const ll = d.handle.getLatLng();
        const tr = document.createElement('tr');
        const mdlVal = d.role === 'Sensor' ? '0.3'
          : d.role === 'Custom0' ? (customSensors[0]?.mdl ?? '—')
          : d.role === 'Custom1' ? (customSensors[1]?.mdl ?? '—')
          : '—';
        tr.innerHTML =
          `<td style="padding:2px;">${d.name || d.role}</td>` +
          `<td style="padding:2px;" align="right">${mdlVal}</td>` +
          `<td style="padding:2px;" align="right">${ll.lat.toFixed(5)}</td>` +
          `<td style="padding:2px;" align="right">${ll.lng.toFixed(5)}</td>`;
        devBody.appendChild(tr);
      });

	  if (srcCountEl) srcCountEl.textContent = sources.length;

	  if (devCountEl) {
		const total = devices.length;
		const sensorCount = devices.filter(d => d.role === 'Sensor').length;
		const custom = devices.filter(d => d.role === 'Custom0' || d.role === 'Custom1').length;
		let countText = `Total: ${total}; 0.3ppm: ${sensorCount}`;
		if (custom > 0) countText += `; Custom: ${custom}`;
		devCountEl.textContent = countText;
	  }
	  
	  const heightUnitSel = document.getElementById('heightUnit');
		if (heightUnitSel) {
		  heightUnitSel.addEventListener('change', () => {
			const unit = heightUnitSel.value;
			document.querySelectorAll('#srcTable tbody tr').forEach(tr => {
			  const td = tr.querySelector('[data-col="height"]');
			  if (!td) return;
			  const val = parseFloat(td.dataset.meters);
			  if (isNaN(val)) return;
			  td.textContent = unit === 'ft' ? (val * 3.28084).toFixed(2) : val.toFixed(2);
			});
		  });
		}

	}



	// ===== Export PDF button — shows card-selection dialog =====
	const exportBtn = document.getElementById('exportPdf');
	const printModal = document.getElementById('printModal');
	const printModalCancel = document.getElementById('printModalCancel');
	const printModalConfirm = document.getElementById('printModalConfirm');
	const printModalLogo = document.getElementById('printModalLogo');

	// Populate logo in modal from the map logo (same base64 src)
	const mapLogo = document.getElementById('mapLogo');
	if (printModalLogo && mapLogo) {
		printModalLogo.src = mapLogo.src;
		printModalLogo.style.display = 'block';
	}

	if (exportBtn && printModal) {
		exportBtn.addEventListener('click', () => {
			printModal.style.display = 'flex';
		});
	}

	if (printModalCancel) {
		printModalCancel.addEventListener('click', () => {
			printModal.style.display = 'none';
		});
	}

	if (printModalConfirm) {
		printModalConfirm.addEventListener('click', () => {
			printModal.style.display = 'none';

			const showMap = document.getElementById('printMap')?.checked ?? true;
			const showWindRose = document.getElementById('printWindRose')?.checked ?? true;
			const showTables = document.getElementById('printTables')?.checked ?? true;

			// Apply visibility via CSS classes before printing
			const mapCard = document.getElementById('mapCard');
			const windroseCard = document.getElementById('windroseCard');
			const coordTables = document.getElementById('coordTables');
			const wrap = document.querySelector('.wrap');

			const hidden = [];
			if (!showMap && mapCard) { mapCard.dataset.printHide = '1'; hidden.push(mapCard); }
			if (!showWindRose && windroseCard) { windroseCard.dataset.printHide = '1'; hidden.push(windroseCard); }
			if (!showTables && coordTables) { coordTables.dataset.printHide = '1'; hidden.push(coordTables); }

			const wrapHasContent = Boolean((showMap && mapCard) || (showWindRose && windroseCard));
			if (wrap) wrap.dataset.printHasContent = wrapHasContent ? '1' : '0';

			// Inject a temporary print style to hide unselected sections
			const styleId = '__pdfHideStyle';
			let styleEl = document.getElementById(styleId);
			if (!styleEl) {
				styleEl = document.createElement('style');
				styleEl.id = styleId;
				document.head.appendChild(styleEl);
			}
			const hiddenRule = hidden.length
				? `${hidden.map(el => `#${el.id}`).join(', ')} { display:none !important; }`
				: '';
			const wrapRule = wrapHasContent
				? ''
				: `.wrap { display:none !important; break-after:auto !important; page-break-after:auto !important; } #coordTables { break-before:auto !important; page-break-before:auto !important; }`;
			styleEl.textContent = `@media print { ${hiddenRule} ${wrapRule} }`;

			// Capture map state before print layout reflows
			const _printCenter = map.getCenter();
			const _printZoom = map.getZoom();
			const _savedMapHeight = mapEl.style.height;

			// Chrome fires beforeprint BEFORE applying print CSS, so we must
			// pre-size the map to the print CSS height (108mm) ourselves.
			// This ensures invalidateSize sees the correct container dimensions.
			mapEl.style.height = '108mm';
			void mapEl.offsetHeight; // force reflow
			map.invalidateSize({ pan: false, animate: false });
			map.setView(_printCenter, _printZoom, { animate: false });

			const _resizeForPrint = () => {
				map.invalidateSize({ pan: false, animate: false });
				map.setView(_printCenter, _printZoom, { animate: false });
			};

			// matchMedia fires after print CSS activates in Chrome (unlike beforeprint)
			const _printMQ = window.matchMedia('print');
			const _onPrintMQ = (e) => { if (e.matches) _resizeForPrint(); };
			_printMQ.addEventListener('change', _onPrintMQ);

			// beforeprint fires after print CSS in Firefox — keep as safety net
			const _onBeforePrint = () => _resizeForPrint();

			const _savedTitle = document.title;
			const _siteName = (siteNameEl?.value || 'Site').trim();
			document.title = `${_siteName} siting`;

			const _onAfterPrint = () => {
				window.removeEventListener('beforeprint', _onBeforePrint);
				window.removeEventListener('afterprint', _onAfterPrint);
				_printMQ.removeEventListener('change', _onPrintMQ);
				document.title = _savedTitle;
				setTimeout(() => {
					styleEl.textContent = '';
					hidden.forEach(el => delete el.dataset.printHide);
					if (wrap) delete wrap.dataset.printHasContent;
					mapEl.style.height = _savedMapHeight;
					map.invalidateSize({ pan: false, animate: false });
					map.setView(_printCenter, _printZoom, { animate: false });
				}, 100);
			};
			window.addEventListener('beforeprint', _onBeforePrint);
			window.addEventListener('afterprint', _onAfterPrint);
			setTimeout(() => window.print(), 150);
		});
	}


	// Update site name dynamically inside map header
	const siteInput = document.getElementById("siteName");
	const siteDisplay = document.getElementById("mapSiteName");

	if (siteInput && siteDisplay) {
	  const updateSiteName = () => {
		siteDisplay.setAttribute("data-site", siteInput.value || "Site");
	  };
	  siteInput.addEventListener("input", updateSiteName);
	  updateSiteName(); // initialize once
	}

	// ============================================================
	// GO TO LOCATION MODAL
	// ============================================================
	(function() {
	  const gotoBtn    = document.getElementById('gotoLatLonBtn');
	  const gotoModal  = document.getElementById('gotoModal');
	  const cancelBtn  = document.getElementById('gotoModalCancel');
	  const confirmBtn = document.getElementById('gotoModalConfirm');
	  const latInput   = document.getElementById('gotoLat');
	  const lonInput   = document.getElementById('gotoLon');
	  const nameInput  = document.getElementById('gotoSiteName');
	  const errorEl    = document.getElementById('gotoError');

	  function openGotoModal() {
		latInput.value  = '';
		lonInput.value  = '';
		nameInput.value = '';
		errorEl.style.display = 'none';
		gotoModal.style.display = 'flex';
		latInput.focus();
	  }

	  function closeGotoModal() {
		gotoModal.style.display = 'none';
	  }

	  function doGoto() {
		const lat = parseFloat(latInput.value);
		const lon = parseFloat(lonInput.value);
		if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
		  errorEl.textContent = 'Latitude must be a number between -90 and 90.';
		  errorEl.style.display = 'block';
		  latInput.focus();
		  return;
		}
		if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
		  errorEl.textContent = 'Longitude must be a number between -180 and 180.';
		  errorEl.style.display = 'block';
		  lonInput.focus();
		  return;
		}
		const newName = nameInput.value.trim();
		if (newName && siteInput) {
		  siteInput.value = newName;
		  siteInput.dispatchEvent(new Event('input'));
		}
		map.setView([lat, lon], map.getZoom() < 14 ? 15 : map.getZoom());
		closeGotoModal();
	  }

	  if (gotoBtn)    gotoBtn.addEventListener('click', openGotoModal);
	  if (cancelBtn)  cancelBtn.addEventListener('click', closeGotoModal);
	  if (confirmBtn) confirmBtn.addEventListener('click', doGoto);

	  // Close on backdrop click
	  if (gotoModal) gotoModal.addEventListener('click', e => {
		if (e.target === gotoModal) closeGotoModal();
	  });

	  // Submit on Enter key
	  [latInput, lonInput, nameInput].forEach(el => {
		if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doGoto(); });
	  });
	})();

/**
 * Calculate detection coverage probability for a single emission source.
 * Dispatches to sample-based calculation when hourly wind data is available,
 * falling back to histogram-based method.
 * @param {Object} source - Source object with lat, lon properties
 * @param {Array<{lat: number, lng: number, role: string}>} sensorPositions
 * @returns {number} Coverage probability (0-1)
 */
function calculateSourceCoverage(source, sensorPositions) {
  if (!sensorPositions || sensorPositions.length === 0) return 0;

  if (lastWindSamples && lastWindSamples.dirs && lastWindSamples.dirs.length > 0) {
    const sampleBasedCoverage = calculateSourceCoverageSampleBased(source, sensorPositions);
    if (sampleBasedCoverage !== null) {
      return sampleBasedCoverage;
    }
  }

  // Histogram-based fallback
  const emRateSelect = document.getElementById('emRate');
  const er = emRateSelect ? +emRateSelect.value : 5;
  const dirProbsData = (typeof dirProbs !== 'undefined') ? dirProbs : Array(DIR_BINS).fill(1/DIR_BINS);
  const dirCenters = Array.from({length:DIR_BINS}, (_,i)=> i*BIN_DEG);

  const S = L.latLng(source.lat, source.lon);
  const sensorLL = sensorPositions.map(s => L.latLng(s.lat, s.lng));
  const sensor_1ppm_fallback = Sensor_1PPM_R[er] || 150;
  const deltaH = getSourceDeltaH(source);
  const meanWindSpeed = windSpeeds.length
? windSpeeds.filter(v => Number.isFinite(v)).reduce((sum, v, _, arr) => sum + (v / arr.length), 0)
: 3;

  const info = sensorPositions.map((sensor, idx) => {
const d = S.distanceTo(sensorLL[idx]);
let maxRange = 0;
let minRange = 0;
if (sensor.role === 'Sensor') {
  maxRange = getDetectionRadiusFor1PPM_Sensor(er, deltaH, meanWindSpeed) || sensor_1ppm_fallback;
  minRange = getMinDetectionRadiusFor0_3PPM_Sensor(er, deltaH, meanWindSpeed) ?? 0;
} else if (sensor.role === 'Custom0' || sensor.role === 'Custom1') {
  const idx = sensor.role === 'Custom0' ? 0 : 1;
  maxRange = getDetectionRadiusForCustom(idx, er, deltaH, meanWindSpeed) || 0;
  minRange = getMinDetectionRadiusForCustom(idx, er, deltaH, meanWindSpeed) ?? 0;
}

if (d > maxRange || d < minRange) return { role: sensor.role, d, b: null, tooFar: true };

return {
  role: sensor.role,
  d,
  b: bearingDeg(source.lat, source.lon, sensorLL[idx].lat, sensorLL[idx].lng),
  tooFar: false,
  maxRange
};
  });

  let pWind = 0;
  for (let k = 0; k < DIR_BINS; k++) {
const pk = dirProbsData[k] || (1/DIR_BINS);
if (pk <= 0) continue;
const downwind = (dirCenters[k] + 180) % 360;
let hit = false;
for (const it of info) {
  if (it.tooFar) continue;
  if (it.maxRange > 0 && it.d <= it.maxRange && angDiff(it.b, downwind) <= TOL) {
hit = true;
break;
  }
}
pWind += pk * (hit ? 1 : 0);
  }
  return pWind;
}

Object.assign(window, {
handleUpload,
sources,
devices,
windDirs,
windSpeeds,
shortwave,
lastWindSamples,
computeBins,
drawRoseDeg,
recomputeCoverage,
addDevice,
computeDetectionEvents,
computeDetectionMatrix,
updateTimingMetrics,
});
})();
