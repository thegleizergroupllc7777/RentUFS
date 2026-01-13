import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue with Webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom green marker icon
const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const MapView = ({ vehicles }) => {
  // Calculate center based on vehicles with coordinates
  const vehiclesWithCoords = vehicles.filter(v => v.location?.coordinates);

  const defaultCenter = [37.7749, -122.4194]; // San Francisco default
  const center = vehiclesWithCoords.length > 0
    ? [
        vehiclesWithCoords.reduce((sum, v) => sum + v.location.coordinates[1], 0) / vehiclesWithCoords.length,
        vehiclesWithCoords.reduce((sum, v) => sum + v.location.coordinates[0], 0) / vehiclesWithCoords.length
      ]
    : defaultCenter;

  return (
    <div style={{ height: '600px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {vehicles.map((vehicle) => {
          if (!vehicle.location?.coordinates) return null;

          const [lng, lat] = vehicle.location.coordinates;

          return (
            <Marker
              key={vehicle._id}
              position={[lat, lng]}
              icon={greenIcon}
            >
              <Popup>
                <div style={{ minWidth: '200px' }}>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '16px' }}>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </h3>
                  {vehicle.images && vehicle.images[0] && (
                    <img
                      src={vehicle.images[0]}
                      alt={`${vehicle.make} ${vehicle.model}`}
                      style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '8px', marginBottom: '8px' }}
                    />
                  )}
                  <p style={{ margin: '4px 0', fontSize: '14px' }}>
                    <strong>${vehicle.pricePerDay}/day</strong>
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '12px', color: '#6b7280' }}>
                    {vehicle.location.city}, {vehicle.location.state}
                  </p>
                  <Link
                    to={`/vehicle/${vehicle._id}`}
                    style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: '#10b981',
                      color: 'white',
                      borderRadius: '6px',
                      textDecoration: 'none',
                      fontSize: '14px'
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
