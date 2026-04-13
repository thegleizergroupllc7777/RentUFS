import React, { useRef, useEffect, useState } from 'react';
import { useGoogleMaps } from '../context/GoogleMapsContext';

const AddressAutocomplete = ({ value, onChange, onPlaceSelect, placeholder, className, maxLength, required, disabled }) => {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const { isLoaded } = useGoogleMaps();
  const [inputValue, setInputValue] = useState(value || '');

  // Sync external value changes
  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'us' },
      fields: ['address_components', 'formatted_address'],
      types: ['address']
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      const components = {};
      place.address_components.forEach(component => {
        const type = component.types[0];
        if (type === 'street_number') components.streetNumber = component.long_name;
        if (type === 'route') components.route = component.long_name;
        if (type === 'locality') components.city = component.long_name;
        if (type === 'sublocality_level_1') components.sublocality = component.long_name;
        if (type === 'administrative_area_level_1') components.state = component.short_name;
        if (type === 'postal_code') components.zipCode = component.long_name;
      });

      const street = [components.streetNumber, components.route].filter(Boolean).join(' ');
      const city = components.city || components.sublocality || '';

      const addressData = {
        street,
        city,
        state: components.state || '',
        zipCode: components.zipCode || ''
      };

      setInputValue(street);
      if (onPlaceSelect) onPlaceSelect(addressData);
    });

    autocompleteRef.current = autocomplete;

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [isLoaded, onPlaceSelect]);

  const handleChange = (e) => {
    setInputValue(e.target.value);
    if (onChange) onChange(e);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={className || 'form-input'}
      value={inputValue}
      onChange={handleChange}
      placeholder={placeholder || 'Start typing an address...'}
      maxLength={maxLength}
      required={required}
      disabled={disabled}
      autoComplete="off"
    />
  );
};

export default AddressAutocomplete;
