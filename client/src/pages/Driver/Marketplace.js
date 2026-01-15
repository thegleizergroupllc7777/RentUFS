import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import MapView from '../../components/MapView';
import API_URL from '../../config/api';
import './Driver.css';

const Marketplace = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [filters, setFilters] = useState({
    location: '',
    radius: '25',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) params.append(key, filters[key]);
      });

      const response = await axios.get(`${API_URL}/api/vehicles?${params}`);
      setVehicles(response.data);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
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

  const handleSearch = (e) => {
    e.preventDefault();
    fetchVehicles();
  };

  const clearFilters = () => {
    setFilters({
      location: '',
      radius: '25',
      startDate: '',
      endDate: ''
    });
    setTimeout(fetchVehicles, 0);
  };

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="flex-between mb-3">
            <h1 className="page-title" style={{ marginBottom: 0 }}>Browse Cars</h1>

            <div className="view-toggle">
              <button
                className={`btn ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('list')}
                style={{ marginRight: '0.5rem' }}
              >
                📋 List View
              </button>
              <button
                className={`btn ${viewMode === 'map' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('map')}
              >
                🗺️ Map View
              </button>
            </div>
          </div>

          <div className="marketplace-container">
            <aside className="filters-sidebar">
              <h2 className="filter-title">Filters</h2>

              <form onSubmit={handleSearch}>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    name="location"
                    className="form-input"
                    placeholder="Enter city or zip code"
                    value={filters.location}
                    onChange={handleFilterChange}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Search Radius</label>
                  <select
                    name="radius"
                    className="form-select"
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

                <div className="form-group">
                  <label className="form-label">Pick-up Date</label>
                  <input
                    type="date"
                    name="startDate"
                    className="form-input"
                    value={filters.startDate}
                    onChange={handleFilterChange}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Return Date</label>
                  <input
                    type="date"
                    name="endDate"
                    className="form-input"
                    value={filters.endDate}
                    onChange={handleFilterChange}
                    min={filters.startDate || new Date().toISOString().split('T')[0]}
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  Search Cars
                </button>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="btn btn-secondary mt-2"
                  style={{ width: '100%' }}
                >
                  Clear Filters
                </button>
              </form>
            </aside>

            <main className="vehicles-grid">
              {loading ? (
                <p>Loading vehicles...</p>
              ) : vehicles.length === 0 ? (
                <p>No vehicles found. Try adjusting your filters.</p>
              ) : viewMode === 'map' ? (
                <MapView vehicles={vehicles} />
              ) : (
                <div className="grid grid-cols-3">
                  {vehicles.map(vehicle => (
                    <Link
                      key={vehicle._id}
                      to={`/vehicle/${vehicle._id}`}
                      className="vehicle-card"
                    >
                      <div className="vehicle-image">
                        {vehicle.images?.[0] ? (
                          <img src={vehicle.images[0]} alt={`${vehicle.make} ${vehicle.model}`} />
                        ) : (
                          <div className="vehicle-placeholder">No Image</div>
                        )}
                      </div>

                      <div className="vehicle-info">
                        <h3 className="vehicle-title">
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </h3>

                        <div className="vehicle-details">
                          <span className="vehicle-type">{vehicle.type}</span>
                          <span>{vehicle.seats} seats</span>
                          <span>{vehicle.transmission}</span>
                        </div>

                        {vehicle.location?.city && (
                          <p className="vehicle-location">
                            📍 {vehicle.location.city}, {vehicle.location.state}
                          </p>
                        )}

                        <div className="vehicle-footer">
                          <div className="vehicle-price">
                            ${vehicle.pricePerDay}
                            <span className="price-unit">/day</span>
                          </div>

                          {vehicle.rating > 0 && (
                            <div className="vehicle-rating">
                              ⭐ {vehicle.rating.toFixed(1)} ({vehicle.reviewCount})
                            </div>
                          )}
                        </div>

                        <div className="vehicle-host">
                          Hosted by {vehicle.host?.firstName}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
