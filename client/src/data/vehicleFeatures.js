// Common vehicle features for rental listings
export const vehicleFeatures = [
  // Comfort & Convenience
  { id: 'ac', label: 'Air Conditioning', category: 'Comfort' },
  { id: 'heated_seats', label: 'Heated Seats', category: 'Comfort' },
  { id: 'leather_seats', label: 'Leather Seats', category: 'Comfort' },
  { id: 'sunroof', label: 'Sunroof/Moonroof', category: 'Comfort' },
  { id: 'cruise_control', label: 'Cruise Control', category: 'Comfort' },
  { id: 'keyless_entry', label: 'Keyless Entry', category: 'Comfort' },
  { id: 'remote_start', label: 'Remote Start', category: 'Comfort' },

  // Technology
  { id: 'bluetooth', label: 'Bluetooth', category: 'Technology' },
  { id: 'gps', label: 'GPS Navigation', category: 'Technology' },
  { id: 'backup_camera', label: 'Backup Camera', category: 'Technology' },
  { id: 'usb_port', label: 'USB Charging Port', category: 'Technology' },
  { id: 'apple_carplay', label: 'Apple CarPlay', category: 'Technology' },
  { id: 'android_auto', label: 'Android Auto', category: 'Technology' },
  { id: 'aux_input', label: 'AUX Input', category: 'Technology' },

  // Safety
  { id: 'airbags', label: 'Airbags', category: 'Safety' },
  { id: 'abs', label: 'ABS Brakes', category: 'Safety' },
  { id: 'blind_spot', label: 'Blind Spot Monitor', category: 'Safety' },
  { id: 'lane_assist', label: 'Lane Departure Warning', category: 'Safety' },
  { id: 'collision_warning', label: 'Collision Warning', category: 'Safety' },

  // Drivetrain
  { id: 'four_wheel_drive', label: '4WD/AWD', category: 'Drivetrain' },
  { id: 'turbo', label: 'Turbocharged', category: 'Drivetrain' },

  // Amenities
  { id: 'child_seat', label: 'Child Seat Included', category: 'Amenities' },
  { id: 'bike_rack', label: 'Bike Rack', category: 'Amenities' },
  { id: 'ski_rack', label: 'Ski Rack', category: 'Amenities' },
  { id: 'toll_pass', label: 'Toll Pass Included', category: 'Amenities' },

  // Pet & Accessibility
  { id: 'pet_friendly', label: 'Pet Friendly', category: 'Pet & Accessibility' },
  { id: 'wheelchair_accessible', label: 'Wheelchair Accessible', category: 'Pet & Accessibility' },

  // Fuel
  { id: 'fuel_efficient', label: 'Fuel Efficient', category: 'Fuel' },
  { id: 'hybrid', label: 'Hybrid', category: 'Fuel' },
  { id: 'electric', label: 'Electric', category: 'Fuel' },
];

// Get features grouped by category
export const getFeaturesByCategory = () => {
  const grouped = {};
  vehicleFeatures.forEach(feature => {
    if (!grouped[feature.category]) {
      grouped[feature.category] = [];
    }
    grouped[feature.category].push(feature);
  });
  return grouped;
};
