import React, { useState, useCallback, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Link } from 'react-router-dom';

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

// Custom marker icon (car pin)
const createMarkerIcon = (isSelected) => ({
  path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
  fillColor: isSelected ? '#2563eb' : '#dc2626',
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 2,
  scale: isSelected ? 2 : 1.7,
  anchor: { x: 12, y: 24 },
});

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

  // Load Google Maps
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places']
  });

  // Update center when search location changes
  useEffect(() => {
    if (searchLocation && map) {
      setMapCenter(searchLocation);
      map.panTo(searchLocation);
    }
  }, [searchLocation, map]);

  // Calculate center from vehicles if no search location
  useEffect(() => {
    if (!searchLocation && vehicles.length > 0 && map) {
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

  // Filter vehicles with valid coordinates
  const vehiclesWithCoords = vehicles.filter(v =>
    v && v.location && v.location.coordinates &&
    Array.isArray(v.location.coordinates) &&
    v.location.coordinates.length >= 2
  );

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
          const [lng, lat] = vehicle.location.coordinates;
          const isSelected = selectedVehicle === vehicle._id || hoveredVehicle === vehicle._id;

          return (
            <Marker
              key={vehicle._id}
              position={{ lat, lng }}
              icon={createMarkerIcon(isSelected)}
              onClick={() => handleMarkerClick(vehicle)}
              onMouseOver={() => setHoveredVehicle(vehicle._id)}
              onMouseOut={() => setHoveredVehicle(null)}
            >
              {activeMarker === vehicle._id && (
                <InfoWindow
                  onCloseClick={() => setActiveMarker(null)}
                >
                  <div style={{ minWidth: '200px', padding: '4px' }}>
                    {vehicle.images && vehicle.images[0] && (
                      <img
                        src={vehicle.images[0]}
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
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: '600' }}>
                      {vehicle.year} {vehicle.make} {vehicle.model}
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
