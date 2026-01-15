# Map Feature Guide

## Overview
RentUFS now includes a map view feature that allows drivers to see vehicle listings on an interactive map!

## For Drivers

### How to Use Map View

1. **Navigate to the Marketplace** (Browse Cars page)
2. **Toggle between views** using the buttons at the top:
   - **📋 List View** - Traditional grid view of all vehicles
   - **🗺️ Map View** - Interactive map showing vehicle locations

3. **In Map View:**
   - Green markers show where vehicles are available
   - Click any marker to see vehicle details
   - View vehicle photo, price, and location
   - Click "View Details" to see full listing and book

### Features
- Zoom in/out to explore different areas
- Clusters automatically form when vehicles are close together
- Filter vehicles and see them update on the map in real-time
- Click markers for quick vehicle previews

---

## For Hosts

### Adding Location Coordinates

When listing a vehicle, you need to provide coordinates for the map feature:

#### Option 1: Use a Geocoding Service
1. Go to [LatLong.net](https://www.latlong.net/) or [Google Maps](https://maps.google.com)
2. Search for your address
3. Copy the coordinates (latitude and longitude)
4. Add them to your vehicle listing

#### Option 2: Get Coordinates from Google Maps
1. Open Google Maps
2. Right-click on your location
3. Click the coordinates that appear
4. Format: First number is Latitude, Second is Longitude

#### Coordinate Format
- **Longitude** comes first (e.g., -122.4194)
- **Latitude** comes second (e.g., 37.7749)
- Store as: `[-122.4194, 37.7749]`

### Examples by City

**San Francisco, CA**
```json
coordinates: [-122.4194, 37.7749]
```

**New York, NY**
```json
coordinates: [-74.0060, 40.7128]
```

**Los Angeles, CA**
```json
coordinates: [-118.2437, 34.0522]
```

**Miami, FL**
```json
coordinates: [-80.1918, 25.7617]
```

---

## Technical Details

### Technology Stack
- **React Leaflet** - React wrapper for Leaflet maps
- **OpenStreetMap** - Free map tiles
- **Leaflet** - Open-source JavaScript mapping library

### Map Features
- Interactive panning and zooming
- Custom green markers matching RentUFS brand
- Popup cards with vehicle information
- Responsive design for mobile and desktop
- No API keys required (using OpenStreetMap)

### Future Enhancements
- Automatic geocoding from address
- Search by drawing on map
- Radius-based search ("Show cars within 10 miles")
- Real-time availability updates
- Street view integration

---

## Troubleshooting

### Map Not Loading
- Check browser console for errors
- Ensure you have internet connection
- Verify Leaflet CSS is loaded

### No Markers Showing
- Verify vehicles have coordinates in the database
- Check that coordinates are in [longitude, latitude] format
- Ensure coordinates are valid numbers

### Markers in Wrong Location
- Double-check longitude comes first, latitude second
- Verify coordinates are decimal degrees, not DMS (degrees/minutes/seconds)
- Use a coordinate validator tool

---

## Support

If you need help with the map feature:
1. Check this documentation first
2. Verify your data format matches the examples
3. Report issues with specific coordinates that aren't working

Happy mapping! 🗺️🚗
