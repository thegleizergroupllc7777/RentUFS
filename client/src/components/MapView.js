import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { useGoogleMaps } from '../context/GoogleMapsContext';
import { Link } from 'react-router-dom';
import getImageUrl from '../config/imageUrl';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 33.7490,
  lng: -84.3880
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

// Pre-created marker icons to avoid recreating objects on every render
const MARKER_ICON_DEFAULT = {
  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
  fillColor: '#dc2626',
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2,
  scale: 1.7,
  anchor: { x: 12, y: 24 },
};

const MARKER_ICON_SELECTED = {
  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
  fillColor: '#2563eb',
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2,
  scale: 2,
  anchor: { x: 12, y: 24 },
};

const CARD_WIDTH = 250; // px — the hover card width, used for clamping/centering

const MapView = ({
  vehicles = [],
  selectedVehicle,
  onVehicleSelect,
  center,
  zoom = 11,
  height = '100%',
  searchLocation = null
}) => {
  const [hoveredVehicle, setHoveredVehicle] = useState(null);
  const [activeMarker, setActiveMarker] = useState(null);
  // The hover card is OUR own element (not Google's InfoWindow, which Google
  // clips to the map edge and chops off for pins near the top). We position it
  // in screen pixels over the map so it can never be cut off, flips to open
  // DOWNWARD for high pins (e.g. New York), and rides a high z-index so it
  // stands out in front of the top search/filter bar.
  const [popup, setPopup] = useState(null); // { vehicleId, left, top, placement }
  const [map, setMap] = useState(null);
  const [mapCenter, setMapCenter] = useState(center || defaultCenter);

  // Use shared Google Maps loader
  const { isLoaded, loadError } = useGoogleMaps();

  // Update center when search location changes
  useEffect(() => {
    if (searchLocation && map) {
      setMapCenter(searchLocation);
      map.panTo(searchLocation);
    }
  }, [searchLocation, map]);

  // Calculate center from vehicles if no search location
  useEffect(() => {
    if (!searchLocation && vehicles.length > 0 && map && window.google) {
      const vehiclesWithCoords = vehicles.filter(v =>
        v.location?.coordinates &&
        Array.isArray(v.location.coordinates) &&
        v.location.coordinates.length >= 2
      );

      if (vehiclesWithCoords.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        vehiclesWithCoords.forEach(v => {
          const [lng, lat] = v.location.coordinates;
          bounds.extend({ lat, lng });
        });
        map.fitBounds(bounds);
      }
    }
  }, [vehicles, searchLocation, map]);

  const onLoad = useCallback((mapInstance) => {
    setMap(mapInstance);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  // Convert a pin's lat/lng to a pixel position inside the map div. Uses the
  // true Web-Mercator transform for latitude so the card lands right on the pin
  // even on a zoomed-out US-wide view (a plain linear guess drifts near the
  // edges). Returns null until the map's bounds are ready.
  const latLngToPixel = useCallback((latLng) => {
    if (!map) return null;
    const b = map.getBounds();
    const div = map.getDiv();
    if (!b || !div) return null;
    const ne = b.getNorthEast();
    const sw = b.getSouthWest();
    const w = div.offsetWidth;
    const h = div.offsetHeight;
    if (!w || !h) return null;
    const north = ne.lat(), south = sw.lat(), west = sw.lng(), east = ne.lng();
    const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
    let lngSpan = east - west;
    if (lngSpan <= 0) lngSpan += 360; // antimeridian safety
    let dLng = latLng.lng - west;
    if (dLng < 0) dLng += 360;
    const x = (dLng / lngSpan) * w;
    const y = ((merc(north) - merc(latLng.lat)) / (merc(north) - merc(south))) * h;
    return { x, y, w, h };
  }, [map]);

  // Open the hover card for a vehicle, positioned at its pin.
  const openPopup = useCallback((vehicle, pos) => {
    setActiveMarker(vehicle._id);
    const px = latLngToPixel(pos);
    if (!px) {
      // Bounds not ready yet — fall back to a fully-visible top-left spot.
      setPopup({ vehicleId: vehicle._id, left: 16, top: 16, placement: 'below' });
      return;
    }
    const GAP = 18;
    const left = Math.max(8, Math.min(px.x - CARD_WIDTH / 2, px.w - CARD_WIDTH - 8));
    // If the pin sits in the top ~45% of the map, open the card DOWNWARD so it
    // is always fully on screen; otherwise open it upward above the pin.
    const placeBelow = px.y < px.h * 0.45;
    const top = placeBelow ? px.y + GAP : px.y - GAP;
    setPopup({ vehicleId: vehicle._id, left, top, placement: placeBelow ? 'below' : 'above' });
  }, [latLngToPixel]);

  // A CLICK "locks" the card open. While locked, hovering a neighbouring pin
  // can't swap the card and moving the mouse away can't close it — so when
  // pins overlap (a cluster) you can calmly reach "View Details" without the
  // card flipping to the car behind. Locking clears on ×, map-click, drag, or
  // clicking a different pin. Plain hover (no click) is unchanged.
  const pinnedRef = useRef(false);

  const closePopup = useCallback(() => {
    pinnedRef.current = false;
    setActiveMarker(null);
    setPopup(null);
  }, []);

  // Keep the card open while the mouse is over the pin OR the card, and close it
  // a short moment after the mouse leaves BOTH. This lets you slide onto the card
  // to click "View Details", but it no longer stays stuck when you move away.
  const closeTimer = useRef(null);
  const cancelClose = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  const scheduleClose = () => { if (pinnedRef.current) return; cancelClose(); closeTimer.current = setTimeout(closePopup, 180); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const handleMarkerClick = (vehicle, pos) => {
    pinnedRef.current = true;
    cancelClose();
    openPopup(vehicle, pos);
    if (onVehicleSelect) {
      onVehicleSelect(vehicle._id);
    }
  };

  // Filter vehicles with valid coordinates (memoized, must be before early returns)
  const vehiclesWithCoords = useMemo(() => vehicles.filter(v =>
    v && v.location && v.location.coordinates &&
    Array.isArray(v.location.coordinates) &&
    v.location.coordinates.length >= 2
  ), [vehicles]);

  // Display position for each pin. Cars at DISTINCT addresses keep their real
  // coordinates. Cars stacked at the EXACT same point (e.g. a host with several
  // cars at one address) are fanned into a tiny ~15m ring so each is its own
  // visible pin. Display only — stored coordinates are never changed.
  const displayPositions = useMemo(() => {
    const groups = new Map(); // "lat,lng" -> [vehicleId,...]
    vehiclesWithCoords.forEach((v) => {
      const [lng, lat] = v.location.coordinates;
      const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v._id);
    });
    const positions = {};
    groups.forEach((ids, key) => {
      const [lat, lng] = key.split(',').map(Number);
      if (ids.length === 1) { positions[ids[0]] = { lat, lng }; return; }
      const R = 0.00015; // ~15 meters
      const lngScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      ids.forEach((id, i) => {
        const angle = (2 * Math.PI * i) / ids.length;
        positions[id] = { lat: lat + R * Math.cos(angle), lng: lng + (R * Math.sin(angle)) / lngScale };
      });
    });
    return positions;
  }, [vehiclesWithCoords]);

  // The vehicle whose card is currently open (if any).
  const activeVehicle = useMemo(
    () => vehiclesWithCoords.find(v => v._id === activeMarker) || null,
    [vehiclesWithCoords, activeMarker]
  );

  if (loadError) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#f5f5f5',
        flexDirection: 'column',
        padding: '2rem'
      }}>
        <p style={{ color: '#dc2626', marginBottom: '1rem' }}>
          Error loading Google Maps. Please check your API key.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        background: '#f5f5f5'
      }}>
        <p>Loading map...</p>
      </div>
    );
  }

  const activeIsRented = !!(activeVehicle && activeVehicle.rentedNow);
  const activeImage = activeVehicle && activeVehicle.images && activeVehicle.images[0];

  return (
    <div style={{ height, width: '100%', position: 'relative' }}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={closePopup}
        onDragStart={closePopup}
      >
        {vehiclesWithCoords.map((vehicle) => {
              const fallback = vehicle.location.coordinates;
              const pos = displayPositions[vehicle._id] || { lat: fallback[1], lng: fallback[0] };
              const isSelected = selectedVehicle === vehicle._id || hoveredVehicle === vehicle._id;

              return (
                <Marker
                  key={vehicle._id}
                  position={pos}
                  icon={isSelected ? MARKER_ICON_SELECTED : MARKER_ICON_DEFAULT}
                  onClick={() => handleMarkerClick(vehicle, pos)}
                  onMouseOver={() => {
                    // While a card is locked open by a click, don't let hovering
                    // a neighbouring pin swap it — that's the cluster fix.
                    if (pinnedRef.current) { cancelClose(); return; }
                    // Highlight the pin and open our own card. The map NEVER
                    // moves on hover — the card is positioned in pixels and
                    // flips downward for high pins, so it's always fully visible.
                    cancelClose();
                    setHoveredVehicle(vehicle._id);
                    openPopup(vehicle, pos);
                  }}
                  onMouseOut={() => {
                    if (pinnedRef.current) return; // keep a locked card put
                    setHoveredVehicle(null);
                    scheduleClose(); // closes shortly unless the mouse lands on the card
                  }}
                />
              );
            })}
      </GoogleMap>

      {/* Our own hover/click card — rendered OUTSIDE the Google map layer so it
          can't be clipped, positioned over the pin, and lifted above the top
          search/filter bar (z-index 200 > the header's 100) so it stands out. */}
      {activeVehicle && popup && popup.vehicleId === activeVehicle._id && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          style={{
            position: 'absolute',
            left: `${popup.left}px`,
            top: `${popup.top}px`,
            transform: popup.placement === 'above' ? 'translateY(-100%)' : 'none',
            width: `${CARD_WIDTH}px`,
            zIndex: 200,
            // White popup styled like Google Maps' own: soft rounded corners,
            // Google's lighter drop-shadow, and a pointer tail aiming at the pin.
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 2px 10px 2px rgba(0,0,0,0.25)',
            padding: '12px',
            boxSizing: 'border-box'
          }}
        >
          {/* Pointer tail aiming at the pin: points DOWN when the card sits above
              the pin, UP when it flips below (top pins like New York). */}
          <div
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '9px solid transparent',
              borderRight: '9px solid transparent',
              ...(popup.placement === 'above'
                ? { bottom: '-9px', borderTop: '10px solid #ffffff', filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.12))' }
                : { top: '-9px', borderBottom: '10px solid #ffffff', filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.10))' })
            }}
          />

          <button
            onClick={closePopup}
            aria-label="Close"
            style={{
              position: 'absolute', top: '4px', right: '4px',
              width: '22px', height: '22px', lineHeight: '20px',
              borderRadius: '50%', border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.9)', color: '#5f6368',
              fontSize: '18px', fontWeight: 400, textAlign: 'center', padding: 0,
              zIndex: 2
            }}
          >
            ×
          </button>

          {activeImage && (
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <img
                src={getImageUrl(activeImage)}
                alt={`${activeVehicle.make} ${activeVehicle.model}`}
                style={{
                  width: '100%', height: '120px', objectFit: 'cover',
                  borderRadius: '8px', display: 'block'
                }}
              />
              {/* Rented cars get an orange-tinted thumbnail with a bold, slanted
                  "Rented" stamp. Host-paused ('unavailable') cars never reach
                  the map — filtered server-side — so Rented is the only stamp. */}
              {activeIsRented && (
                <>
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(234,88,12,0.42)', borderRadius: '8px' }} />
                  <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%) rotate(-8deg)',
                    background: '#f59e0b', color: '#000000',
                    fontSize: '20px', fontWeight: 800, letterSpacing: '0.06em',
                    padding: '8px 30px', borderRadius: '6px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    whiteSpace: 'nowrap'
                  }}>
                    Rented
                  </div>
                </>
              )}
            </div>
          )}

          {/* Available cars keep the small green pill; a rented car with no
              photo still gets a text badge as a fallback. */}
          {(!activeIsRented || !activeImage) && (
            <div style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 700,
              padding: '2px 8px', borderRadius: '999px', marginBottom: '6px',
              background: activeIsRented ? '#fef3c7' : '#dcfce7',
              color: activeIsRented ? '#92400e' : '#166534'
            }}>
              {activeIsRented ? 'Rented' : 'Available'}
            </div>
          )}

          <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600', color: '#111827' }}>
            {activeVehicle.nickname || `${activeVehicle.year} ${activeVehicle.make} ${activeVehicle.model}`}
          </h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: '700', color: '#10b981' }}>
              ${activeVehicle.pricePerDay}/day
            </span>
            {activeVehicle.rating > 0 && (
              <span style={{ fontSize: '12px', color: '#6b7280' }}>
                ⭐ {activeVehicle.rating.toFixed(1)}
              </span>
            )}
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280' }}>
            📍 {activeVehicle.location.city}, {activeVehicle.location.state}
          </p>
          <Link
            to={`/vehicle/${activeVehicle._id}`}
            style={{
              display: 'block', textAlign: 'center', padding: '8px 12px',
              background: '#10b981', color: 'white', borderRadius: '6px',
              textDecoration: 'none', fontSize: '13px', fontWeight: '500'
            }}
          >
            View Details
          </Link>
        </div>
      )}
    </div>
  );
};

export default MapView;
