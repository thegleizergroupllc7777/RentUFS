import React, { useState, useEffect, useRef, Component } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import MapView from '../../components/MapView';
import PullToRefresh from '../../components/PullToRefresh';
import DatePicker from '../../components/DatePicker';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import SEO from '../../components/SEO';
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
  const [viewMode, setViewMode] = useState('map');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    location: '',
    radius: '25',
    startDate: '',
    endDate: ''
  });
  const [searchLocation, setSearchLocation] = useState('');
  const [resultsInfo, setResultsInfo] = useState({ showing: 0, total: 0 });
  const [mapCenter, setMapCenter] = useState(null);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [error, setError] = useState(null);
  const slowTimerRef = useRef(null);
  const navigate = useNavigate();
  // Ref to the Map-view card strip so the ‹ › arrows can slide it left/right.
  const floatingScrollRef = useRef(null);

  // Scroll the floating card strip by roughly two cards in either direction.
  const scrollFloatingCards = (direction) => {
    const el = floatingScrollRef.current;
    if (!el) return;
    const amount = 380; // ~two 170px cards + gaps
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  useEffect(() => {
    fetchVehicles();
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  const fetchVehicles = async (retryCount = 0) => {
    try {
      if (retryCount === 0) {
        setLoading(true);
        setError(null);
        setLoadingSlow(false);
        if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
        slowTimerRef.current = setTimeout(() => setLoadingSlow(true), 5000);
      }

      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });

      const response = await axios.get(`${API_URL}/api/vehicles?${params}`, {
        timeout: 30000
      });

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      const allVehicles = response.data || [];
      setVehicles(allVehicles);
      setResultsInfo({
        showing: Math.min(12, allVehicles.length),
        total: allVehicles.length
      });
      setLoadingSlow(false);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching vehicles:', error);

      // Retry once on timeout or network error (handles server cold starts)
      if (retryCount < 1 && (error.code === 'ECONNABORTED' || !error.response)) {
        return fetchVehicles(retryCount + 1);
      }

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setVehicles([]);
      setLoadingSlow(false);
      setLoading(false);
      setError('Unable to load vehicles. The server may be starting up.');
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

  // Availability label shown only after a location search. Rounds DOWN to the
  // nearest 5 and adds a "+" (e.g. 28 -> "25+") so renters see there's good
  // supply while the exact inventory count stays hidden from competitors.
  const getResultsCountText = () => {
    if (!filters.location || vehicles.length === 0) return '';
    const n = vehicles.length;
    const rounded = Math.floor(n / 5) * 5;
    // Round down to the nearest 5 for larger counts; for small counts keep the
    // real number — but always append "+" so it reads consistently (e.g. "3+").
    const base = rounded >= 5 ? rounded : n;
    return `${base}+ cars available`;
  };

  const renderVehicleList = () => (
    <div className="list-view-container">
      {/* List view only — never rendered on the map view, so it can't interfere
          with map dragging. */}
      <PullToRefresh onRefresh={fetchVehicles} />
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
              to={`/vehicle/${vehicle.slug || vehicle._id}`}
              className={`vehicle-card-list ${vehicle.rentedNow ? 'rented' : ''}`}
            >
              <div className="vehicle-card-image">
                {vehicle.images?.[0] ? (
                  <img src={getImageUrl(vehicle.images[0], 640)} alt={`${vehicle.make} ${vehicle.model}`} loading="lazy" decoding="async" />
                ) : (
                  <div className="vehicle-placeholder">No Image</div>
                )}
                {vehicle.rentedNow && <div className="rented-overlay"></div>}
                {vehicle.rentedNow && (
                  <div className="availability-badge rented">Rented</div>
                )}
                {vehicle.rating > 0 && (
                  <div className="vehicle-rating-badge">
                    ⭐ {vehicle.rating.toFixed(1)}
                  </div>
                )}
              </div>

              <div className="vehicle-card-content">
                <h3 className="vehicle-title">
                  {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
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
                    Hosted by{' '}
                    {(() => {
                      const h = vehicle.host?.hostInfo;
                      let name;
                      if (h?.displayPreference === 'business' && h?.businessName) name = h.businessName;
                      else if (h?.displayPreference === 'dba' && h?.dba) name = h.dba;
                      else name = vehicle.host?.firstName;
                      // Link the name to the host's storefront. The card itself is a
                      // link to the car, so stop the click from triggering it.
                      if (!vehicle.host?._id) return name;
                      return (
                        <span
                          className="host-link"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/h/${vehicle.host._id}`); }}
                        >
                          {name}
                        </span>
                      );
                    })()}
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
      <SEO
        title="Browse Cars for Rent"
        description="Browse and rent cars from local hosts on RentUFS. Find sedans, SUVs, trucks, and more with insurance included. Book your next rental today."
      />
      {/* Sticky header wrapper — keeps Navbar + search bar + results info bar locked at top while scrolling */}
      <div className="marketplace-sticky-header">
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
              {loading ? 'Loading...' : getResultsCountText()}
            </span>
          </div>
          <button
            className="filters-toggle-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            {showFilters ? 'Hide Filters' : 'More Filters'} ⚙️
          </button>
        </div>

        {/* Expanded Filters Panel — kept inside the sticky header so it
            stays locked at the top together with the search/results bars
            when the user scrolls listings */}
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
      </div>

      {/* Main Content Area */}
      <div className="marketplace-content">
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner">
              {loadingSlow ? 'Server is waking up, please wait...' : 'Loading vehicles...'}
            </div>
          </div>
        ) : error ? (
          <div className="loading-overlay">
            <div style={{ textAlign: 'center' }}>
              <div className="loading-spinner">{error}</div>
              <button
                onClick={() => fetchVehicles()}
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem'
                }}
              >
                Try Again
              </button>
            </div>
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
                {vehicles.length > 1 && (
                  <button
                    type="button"
                    className="floating-cards-arrow left"
                    aria-label="Scroll cards left"
                    onClick={() => scrollFloatingCards('left')}
                  >
                    ‹
                  </button>
                )}
                <div className="floating-cards-scroll" ref={floatingScrollRef}>
                  {vehicles.slice(0, 12).map(vehicle => (
                    <Link
                      key={vehicle._id}
                      to={`/vehicle/${vehicle.slug || vehicle._id}`}
                      className={`floating-vehicle-card ${selectedVehicle === vehicle._id ? 'selected' : ''} ${vehicle.rentedNow ? 'rented' : ''}`}
                      onMouseEnter={() => setSelectedVehicle(vehicle._id)}
                      onMouseLeave={() => setSelectedVehicle(null)}
                    >
                      <div className="floating-card-image">
                        {vehicle.images?.[0] ? (
                          <img src={getImageUrl(vehicle.images[0], 640)} alt={`${vehicle.make} ${vehicle.model}`} loading="lazy" decoding="async" />
                        ) : (
                          <div className="no-image">🚗</div>
                        )}
                        {vehicle.rentedNow && <div className="rented-overlay"></div>}
                        {vehicle.rentedNow && (
                          <div className="availability-badge rented">Rented</div>
                        )}
                      </div>
                      <div className="floating-card-info">
                        <h4>{vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</h4>
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
                {vehicles.length > 1 && (
                  <button
                    type="button"
                    className="floating-cards-arrow right"
                    aria-label="Scroll cards right"
                    onClick={() => scrollFloatingCards('right')}
                  >
                    ›
                  </button>
                )}
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
