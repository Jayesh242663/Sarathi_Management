import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { COUNTRIES } from '../utils/countries';
import './CountrySelect.css';

const CountrySelect = ({ value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const selectedCountry = COUNTRIES.find(c => c.name === value);
  
  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (country) => {
    onChange(country.name);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div className={`country-select-wrapper ${className}`} ref={dropdownRef}>
      <button
        type="button"
        className="country-select-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="country-select-value">
          {selectedCountry ? (
            <>
              <span className="country-flag">{selectedCountry.flag}</span>
              <span className="country-name">{selectedCountry.name}</span>
            </>
          ) : (
            <span className="country-placeholder">Select a country</span>
          )}
        </span>
        {value && (
          <button
            type="button"
            className="country-select-clear"
            onClick={handleClear}
            title="Clear selection"
          >
            <X size={16} />
          </button>
        )}
        <ChevronDown 
          size={18} 
          className={`country-select-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="country-select-menu">
          <div className="country-select-search">
            <Search size={18} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search countries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="country-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchTerm('')}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="country-select-options">
            {filteredCountries.length === 0 ? (
              <div className="country-option-empty">No countries found</div>
            ) : (
              filteredCountries.map((country) => (
                <button
                  key={country.name}
                  type="button"
                  className={`country-option ${selectedCountry?.name === country.name ? 'selected' : ''}`}
                  onClick={() => handleSelect(country)}
                >
                  <span className="option-flag">{country.flag}</span>
                  <div className="option-content">
                    <span className="option-name">{country.name}</span>
                    <span className="option-code">{country.code}</span>
                  </div>
                  {selectedCountry?.name === country.name && (
                    <span className="option-checkmark">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CountrySelect;
