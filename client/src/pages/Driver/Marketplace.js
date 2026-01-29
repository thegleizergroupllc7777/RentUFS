import React, { useState, useEffect, Component } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import MapView from '../../components/MapView';
import DatePicker from '../../components/DatePicker';
import API_URL from '../../config/api';
import './Driver.css';

// Convert Date to YYYY-MM-DD in local timezone (avoids UTC shift)
const toLocalDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Error Boundary for Map component
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Map error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
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
          <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
            Map could not be loaded. Please use list view.
          </p>
          <button
            onClick={() => this.props.onSwitchToList()}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Switch to List View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const Marketplace = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    location: '',
    radius: '25',
    startDate: '',
    endDate: ''
  });
  const [searchLocation, setSearchLocation] = useState('');
  const [resultsInfo, setResultsInfo] = useState({ showing: 0, total: 0 });
  const [mapCenter, setMapCenter] = useState(null);

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });

      const response = await axios.get(`${API_URL}/api/vehicles?${params}`);
      setVehicles(response.data || []);
      setResultsInfo({
        showing: Math.min(12, (response.data || []).length),
        total: (response.data || []).length
      });
    } catch (error) {
      console.error('Error fetching vehicles:', error);
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };

  const handleQuickSearch = async () => {
    setFilters(prev => ({ ...prev, location: searchLocation }));

    // Geocode the search location to center the map
    if (searchLocation) {
      try {
        const response = await axios.get(`${API_URL}/api/vehicles/geocode`, {
          params: { address: searchLocation }
        });
        setMapCenter({ lat: response.data.lat, lng: response.data.lng });
      } catch (error) {
        console.log('Could not geocode search location');
      }
    } else {
      setMapCenter(null);
    }

    setTimeout(fetchVehicles, 0);
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      radius: '25',
      startDate: '',
      endDate: ''
    });
    setSearchLocation('');
    setMapCenter(null);
    setTimeout(fetchVehicles, 0);
  };

  const handleVehicleSelect = (vehicleId) => {
    setSelectedVehicle(vehicleId);
  };

  const getLocationText = () => {
    if (filters.location) {
      return `${filters.radius || 'Any'} miles of ${filters.location}`;
    }
    return 'All Locations';
  };

  const renderVehicleList = () => (
    <div className="list-view-container">
      <div className="vehicles-list-grid">
        {vehicles.length === 0 ? (
          <div className="no-results">
            <h3>No vehicles found</h3>
            <p>Try adjusting your search filters</p>
          </div>
        ) : (
          vehicles.map(vehicle => (
            <Link
              key={vehicle._id}
              to={`/vehicle/${vehicle._id}`}
              className="vehicle-card-list"
            >
              <div className="vehicle-card-image">
                {vehicle.images?.[0] ? (
                  <img src={vehicle.images[0]} alt={`${vehicle.make} ${vehicle.model}`} />
                ) : (
                  <div className="vehicle-placeholder">No Image</div>
                )}
                {vehicle.rating > 0 && (
                  <div className="vehicle-rating-badge">
                    ⭐ {vehicle.rating.toFixed(1)}
                  </div>
                )}
              </div>

              <div className="vehicle-card-content">
                <h3 className="vehicle-title">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h3>

                <div className="vehicle-details">
                  <span>{vehicle.type}</span>
                  <span>{vehicle.seats} seats</span>
                  <span>{vehicle.transmission}</span>
                </div>

                {vehicle.location?.city && (
                  <p className="vehicle-location">
                    📍 {vehicle.location.city}, {vehicle.location.state}
                  </p>
                )}

                <div className="vehicle-card-footer">
                  <div className="vehicle-price">
                    <strong>${vehicle.pricePerDay}</strong>
                    <span>/day</span>
                  </div>
                  <div className="vehicle-host">
                    Hosted by {vehicle.host?.firstName}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="marketplace-fullscreen">
      <Navbar />

      {/* Top Search Bar */}
      <div className="marketplace-search-bar">
        <div className="search-container">
          <div className="search-icon">🔍</div>
          <input
            type="text"
            placeholder="Enter city or zip code..."
            value={searchLocation}
            onChange={(e) => setSearchLocation(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleQuickSearch()}
            className="search-input-main"
          />
          <button onClick={handleQuickSearch} className="search-btn-main">
            Search
          </button>
        </div>

        {/* View Toggle */}
        <div className="view-toggle-bar">
          <button
            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            📋 LIST
          </button>
          <button
            className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            onClick={() => setViewMode('map')}
          >
            📍 MAP
          </button>
        </div>
      </div>

      {/* Results Info Bar */}
      <div className="results-info-bar">
        <div className="results-text">
          <strong>{getLocationText()}</strong>
          <span className="results-count">
            Showing {resultsInfo.showing} of {resultsInfo.total} vehicles
          </span>
        </div>
        <button
          className="filters-toggle-btn"
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Hide Filters' : 'More Filters'} ⚙️
        </button>
      </div>

      {/* Expanded Filters Panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filters-grid">
            <div className="filter-item">
              <label>Location</label>
              <input
                type="text"
                name="location"
                placeholder="City or zip code"
                value={filters.location}
                onChange={handleFilterChange}
              />
            </div>
            <div className="filter-item">
              <label>Radius</label>
              <select
                name="radius"
                value={filters.radius}
                onChange={handleFilterChange}
              >
                <option value="10">10 miles</option>
                <option value="25">25 miles</option>
                <option value="50">50 miles</option>
                <option value="100">100 miles</option>
                <option value="">Any distance</option>
              </select>
            </div>
            <div className="filter-item">
              <DatePicker
                label="Pick-up Date"
                name="startDate"
                value={filters.startDate}
                onChange={handleFilterChange}
                min={toLocalDateStr(new Date())}
              />
            </div>
            <div className="filter-item">
              <DatePicker
                label="Return Date"
                name="endDate"
                value={filters.endDate}
                onChange={handleFilterChange}
                min={filters.startDate || toLocalDateStr(new Date())}
              />
            </div>
            <div className="filter-actions">
              <button onClick={fetchVehicles} className="btn btn-primary">
                Apply Filters
              </button>
              <button onClick={clearFilters} className="btn btn-secondary">
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="marketplace-content">
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner">Loading vehicles...</div>
          </div>
        ) : viewMode === 'map' ? (
          /* Map View - Full Screen */
          <div className="map-view-container">
            <MapErrorBoundary onSwitchToList={() => setViewMode('list')}>
              <MapView
                vehicles={vehicles}
                selectedVehicle={selectedVehicle}
                onVehicleSelect={handleVehicleSelect}
                height="100%"
                searchLocation={mapCenter}
              />
            </MapErrorBoundary>

            {/* Floating Vehicle Cards at Bottom */}
            {vehicles.length > 0 && (
              <div className="floating-cards-container">
                <div className="floating-cards-scroll">
                  {vehicles.slice(0, 12).map(vehicle => (
                    <Link
                      key={vehicle._id}
                      to={`/vehicle/${vehicle._id}`}
                      className={`floating-vehicle-card ${selectedVehicle === vehicle._id ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedVehicle(vehicle._id)}
                      onMouseLeave={() => setSelectedVehicle(null)}
                    >
                      <div className="floating-card-image">
                        {vehicle.images?.[0] ? (
                          <img src={vehicle.images[0]} alt={`${vehicle.make} ${vehicle.model}`} />
                        ) : (
                          <div className="no-image">🚗</div>
                        )}
                      </div>
                      <div className="floating-card-info">
                        <h4>{vehicle.year} {vehicle.make} {vehicle.model}</h4>
                        <div className="floating-card-price">
                          ${vehicle.pricePerDay}<span>/day</span>
                        </div>
                        {vehicle.rating > 0 && (
                          <div className="floating-card-rating">
                            ⭐ {vehicle.rating.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
                {vehicles.length > 12 && (
                  <button
                    className="load-more-btn"
                    onClick={() => setViewMode('list')}
                  >
                    View All {vehicles.length} Vehicles →
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          /* List View */
          renderVehicleList()
        )}
      </div>
    </div>
  );
};

export default Marketplace;
