import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue with Webpack - use CDN URLs instead of require
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom car marker icon (red car pin like Turo)
const createCarIcon = (isSelected = false) => {
  const size = isSelected ? 44 : 36;
  const bgColor = isSelected ? '#2563eb' : '#dc2626';
  const borderWidth = isSelected ? 3 : 2;
  const fontSize = isSelected ? 22 : 18;
  const shadow = isSelected ? '0 4px 12px rgba(37, 99, 235, 0.5)' : '0 2px 8px rgba(0,0,0,0.3)';

  return new L.DivIcon({
    className: 'custom-car-marker',
    html: `
      <div style="
        background-color: ${bgColor};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${shadow};
        border: ${borderWidth}px solid white;
      ">
        <span style="
          transform: rotate(45deg);
          font-size: ${fontSize}px;
        ">🚗</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

// Component to update map center
const MapUpdater = ({ center, zoom }) => {
  const map = useMap();
  React.useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
};

const MapView = ({ vehicles = [], selectedVehicle, onVehicleSelect, center, zoom = 11, height = '100%' }) => {
  const [hoveredVehicle, setHoveredVehicle] = useState(null);

  // Safely filter vehicles with coordinates
  const vehiclesWithCoords = (vehicles || []).filter(v =>
    v && v.location && v.location.coordinates &&
    Array.isArray(v.location.coordinates) &&
    v.location.coordinates.length >= 2
  );

  const defaultCenter = [33.7490, -84.3880]; // Atlanta default

  let mapCenter = defaultCenter;
  if (center) {
    mapCenter = center;
  } else if (vehiclesWithCoords.length > 0) {
    try {
      const avgLat = vehiclesWithCoords.reduce((sum, v) => sum + v.location.coordinates[1], 0) / vehiclesWithCoords.length;
      const avgLng = vehiclesWithCoords.reduce((sum, v) => sum + v.location.coordinates[0], 0) / vehiclesWithCoords.length;
      if (!isNaN(avgLat) && !isNaN(avgLng)) {
        mapCenter = [avgLat, avgLng];
      }
    } catch (e) {
      console.error('Error calculating map center:', e);
    }
  }

  return (
    <div style={{ height, width: '100%', borderRadius: '0', overflow: 'hidden' }}>
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center ? mapCenter : null} zoom={zoom} />

        {vehiclesWithCoords.map((vehicle) => {
          const [lng, lat] = vehicle.location.coordinates;
          const isSelected = selectedVehicle === vehicle._id || hoveredVehicle === vehicle._id;

          return (
            <Marker
              key={vehicle._id}
              position={[lat, lng]}
              icon={createCarIcon(isSelected)}
              eventHandlers={{
                click: () => onVehicleSelect && onVehicleSelect(vehicle._id),
                mouseover: () => setHoveredVehicle(vehicle._id),
                mouseout: () => setHoveredVehicle(null),
              }}
            >
              <Popup>
                <div style={{ minWidth: '220px', padding: '4px' }}>
                  {vehicle.images && vehicle.images[0] && (
                    <img
                      src={vehicle.images[0]}
                      alt={`${vehicle.make} ${vehicle.model}`}
                      style={{
                        width: '100%',
                        height: '130px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        marginBottom: '10px'
                      }}
                    />
                  )}
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: '600' }}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h3>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#10b981' }}>
                      ${vehicle.pricePerDay}/day
                    </span>
                    {vehicle.rating > 0 && (
                      <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        ⭐ {vehicle.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#6b7280' }}>
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
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    View Details
                  </Link>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapView;
