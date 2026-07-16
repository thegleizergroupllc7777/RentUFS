import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
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

  const handleMarkerClick = (vehicle) => {
    setActiveMarker(vehicle._id);
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

  return (
    <div style={{ height, width: '100%' }}>
      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={mapCenter}
        zoom={zoom}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {vehiclesWithCoords.map((vehicle) => {
              const fallback = vehicle.location.coordinates;
              const pos = displayPositions[vehicle._id] || { lat: fallback[1], lng: fallback[0] };
              const isSelected = selectedVehicle === vehicle._id || hoveredVehicle === vehicle._id;
              const isRented = !!vehicle.rentedNow;

              return (
                <Marker
                  key={vehicle._id}
                  position={pos}
                  icon={isSelected ? MARKER_ICON_SELECTED : MARKER_ICON_DEFAULT}
                  onClick={() => handleMarkerClick(vehicle)}
                  onMouseOver={() => { setHoveredVehicle(vehicle._id); setActiveMarker(vehicle._id); }}
                  onMouseOut={() => setHoveredVehicle(null)}
                >
                  {activeMarker === vehicle._id && (
                    <InfoWindow onCloseClick={() => setActiveMarker(null)}>
                      <div style={{ minWidth: '200px', padding: '4px' }}>
                        {vehicle.images && vehicle.images[0] && (
                          <img
                            src={getImageUrl(vehicle.images[0])}
                            alt={`${vehicle.make} ${vehicle.model}`}
                            style={{
                              width: '100%',
                              height: '120px',
                              objectFit: 'cover',
                              borderRadius: '8px',
                              marginBottom: '8px'
                            }}
                          />
                        )}
                        <div style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          marginBottom: '6px',
                          background: isRented ? '#fef3c7' : '#dcfce7',
                          color: isRented ? '#92400e' : '#166534'
                        }}>
                          {isRented ? 'Rented' : 'Available'}
                        </div>
                        <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600' }}>
                          {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                        </h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '700', color: '#10b981' }}>
                            ${vehicle.pricePerDay}/day
                          </span>
                          {vehicle.rating > 0 && (
                            <span style={{ fontSize: '12px', color: '#6b7280' }}>
                              ⭐ {vehicle.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280' }}>
                          📍 {vehicle.location.city}, {vehicle.location.state}
                        </p>
                        <Link
                          to={`/vehicle/${vehicle._id}`}
                          style={{
                            display: 'block',
                            textAlign: 'center',
                            padding: '8px 12px',
                            background: '#10b981',
                            color: 'white',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          View Details
                        </Link>
                      </div>
                    </InfoWindow>
                  )}
                </Marker>
              );
            })}
      </GoogleMap>
    </div>
  );
};

export default MapView;
