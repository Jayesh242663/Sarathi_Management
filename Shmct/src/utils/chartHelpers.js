/**
 * Chart Helper Utilities for Responsive Mobile Rendering
 */

/**
 * Truncate text to fit within a specified pixel width
 * @param {string} text - The text to truncate
 * @param {number} maxWidth - Maximum width in pixels
 * @param {number} fontSize - Font size in pixels (default: 12)
 * @returns {string} - Truncated text with ellipsis if needed
 */
export const truncateLabel = (text, maxWidth, fontSize = 12) => {
  if (!text) return '';
  
  // Rough estimate: each character is approximately 0.6 * fontSize in width
  const avgCharWidth = fontSize * 0.6;
  const maxChars = Math.floor(maxWidth / avgCharWidth);
  
  if (text.length <= maxChars) return text;
  
  // Leave room for ellipsis (3 chars)
  const truncateAt = Math.max(1, maxChars - 3);
  return text.substring(0, truncateAt) + '...';
};

/**
 * Get responsive chart configuration based on viewport width
 * @param {number} viewportWidth - Current viewport width in pixels
 * @returns {object} - Chart configuration object
 */
export const getResponsiveChartConfig = (viewportWidth) => {
  // Mobile (< 480px)
  if (viewportWidth < 480) {
    return {
      fontSize: 9,
      labelAngle: -45,
      tickInterval: 1, // Show fewer ticks
      labelMaxWidth: 50,
      labelMaxChars: 8,
      showLegend: false,
      legendPosition: 'bottom',
      margin: { top: 5, right: 3, left: 0, bottom: 25 }, // Reduced margins for mobile
      barSize: 20,
    };
  }
  
  // Small tablet (480px - 640px)
  if (viewportWidth < 640) {
    return {
      fontSize: 10,
      labelAngle: -35,
      tickInterval: 0,
      labelMaxWidth: 70,
      labelMaxChars: 12,
      showLegend: true,
      legendPosition: 'bottom',
      margin: { top: 5, right: 8, left: 0, bottom: 25 }, // Reduced margins
      barSize: 25,
    };
  }
  
  // Tablet (640px - 1024px)
  if (viewportWidth < 1024) {
    return {
      fontSize: 11,
      labelAngle: 0,
      tickInterval: 'preserveStartEnd',
      labelMaxWidth: 100,
      labelMaxChars: 15,
      showLegend: true,
      legendPosition: 'top',
      margin: { top: 5, right: 20, left: 0, bottom: 20 },
      barSize: 30,
    };
  }
  
  // Desktop (>= 1024px)
  return {
    fontSize: 12,
    labelAngle: 0,
    tickInterval: 'preserveStartEnd',
    labelMaxWidth: 120,
    labelMaxChars: 20,
    showLegend: true,
    legendPosition: 'top',
    margin: { top: 5, right: 30, left: 0, bottom: 20 },
    barSize: 35,
  };
};

/**
 * Custom label formatter for responsive charts
 * @param {string} value - The label value
 * @param {number} maxChars - Maximum characters to display
 * @returns {string} - Formatted label
 */
export const formatChartLabel = (value, maxChars = 15) => {
  if (!value) return '';
  if (typeof value === 'number') return value.toString();
  if (value.length <= maxChars) return value;
  return value.substring(0, maxChars - 2) + '..';
};

/**
 * Get dynamic tick count based on data length and viewport
 * @param {number} dataLength - Number of data points
 * @param {number} viewportWidth - Current viewport width
 * @returns {number} - Optimal number of ticks to display
 */
export const getDynamicTickCount = (dataLength, viewportWidth) => {
  if (viewportWidth < 480) {
    return Math.min(4, dataLength);
  }
  if (viewportWidth < 640) {
    return Math.min(6, dataLength);
  }
  if (viewportWidth < 1024) {
    return Math.min(8, dataLength);
  }
  return dataLength;
};

/**
 * Hook to get current viewport width with debouncing
 * Use this in components to get responsive config
 */
export const useViewportWidth = () => {
  if (typeof window === 'undefined') return 1024; // SSR fallback
  return window.innerWidth;
};

/**
 * Calculate optimal tick interval for X-axis based on data length and viewport
 * @param {number} dataLength - Number of data points
 * @param {number} viewportWidth - Current viewport width in pixels
 * @returns {number} - Optimal tick interval (0 = show all, 1 = every other, etc.)
 */
export const calculateOptimalTickInterval = (dataLength, viewportWidth) => {
  if (dataLength <= 0) return 0;
  
  // Mobile: Show fewer ticks
  if (viewportWidth < 480) {
    if (dataLength <= 6) return 0; // Show all
    if (dataLength <= 12) return 1; // Every other
    return 2; // Every 3rd
  }
  
  // Small tablet: Show moderate ticks
  if (viewportWidth < 640) {
    if (dataLength <= 8) return 0;
    if (dataLength <= 16) return 1;
    return 2;
  }
  
  // Tablet: Show more ticks
  if (viewportWidth < 1024) {
    if (dataLength <= 12) return 0;
    if (dataLength <= 24) return 1;
    return 2;
  }
  
  // Desktop: Show all or nearly all
  if (dataLength <= 30) return 0;
  return Math.ceil(dataLength / 15) - 1;
};

/**
 * Get dynamic X-axis configuration based on viewport and data
 * @param {array} data - Chart data array
 * @param {number} viewportWidth - Current viewport width
 * @param {boolean} isMonthData - Whether data represents months
 * @returns {object} - X-axis configuration
 */
export const getDynamicXAxisConfig = (data, viewportWidth, isMonthData = true) => {
  const dataLength = data ? data.length : 0;
  const tickInterval = calculateOptimalTickInterval(dataLength, viewportWidth);
  
  // Mobile specific configuration - very compact
  if (viewportWidth < 480) {
    return {
      tickInterval: dataLength > 4 ? 1 : 0, // Show every other label on mobile
      angle: 0, // No rotation
      height: isMonthData ? 30 : 45, // Standard height for straight text
      dy: isMonthData ? 5 : 0,
      textAnchor: isMonthData ? 'middle' : 'middle',
      tickFormatter: isMonthData ? formatMonthShort : (val) => formatChartLabel(val, 8), // More aggressive truncation
      fontSize: 8, // Smaller font on mobile
      allowDecimals: false,
    };
  }
  
  // Small tablet - still compact but more readable
  if (viewportWidth < 640) {
    return {
      tickInterval: dataLength > 6 ? 1 : 0,
      angle: 0, // No rotation
      height: isMonthData ? 35 : 45,
      dy: isMonthData ? 5 : 0,
      textAnchor: isMonthData ? 'middle' : 'middle',
      tickFormatter: isMonthData ? formatMonthShort : (val) => formatChartLabel(val, 10),
      fontSize: 9,
      allowDecimals: false,
    };
  }
  
  // Tablet - balanced
  if (viewportWidth < 1024) {
    return {
      tickInterval: 'preserveStartEnd',
      angle: 0,
      height: 35,
      dy: 0,
      textAnchor: 'middle',
      tickFormatter: isMonthData ? formatMonthShort : (val) => val,
      fontSize: 11,
      allowDecimals: false,
    };
  }
  
  // Desktop - show all labels comfortably
  return {
    tickInterval: 'preserveStartEnd',
    angle: 0,
    height: 30,
    dy: 0,
    textAnchor: 'middle',
    tickFormatter: isMonthData ? formatMonthShort : (val) => val,
    fontSize: 12,
    allowDecimals: false,
  };
};

/**
 * Format month to short form (Jan, Feb, Mar, etc.)
 * @param {string} monthName - Month name in any format
 * @returns {string} - Short month form (Jan, Feb, etc.)
 */
export const formatMonthShort = (monthName) => {
  if (!monthName) return '';
  
  const shortMonths = {
    'january': 'Jan',
    'february': 'Feb',
    'march': 'Mar',
    'april': 'Apr',
    'may': 'May',
    'june': 'Jun',
    'july': 'Jul',
    'august': 'Aug',
    'september': 'Sep',
    'october': 'Oct',
    'november': 'Nov',
    'december': 'Dec'
  };
  
  // Handle already short forms
  if (monthName.length <= 3) return monthName;
  
  // Convert to short form
  const normalized = monthName.toLowerCase();
  return shortMonths[normalized] || monthName.substring(0, 3);
};

/**
 * Calculate dynamic Y-axis domain for mobile view
 * @param {array} data - Chart data array
 * @param {string} dataKey - Key to extract values from data (e.g., 'revenue')
 * @param {number} viewportWidth - Current viewport width
 * @returns {array} - [min, max] domain for Y-axis
 */
export const getDynamicYAxisDomain = (data, dataKey, viewportWidth) => {
  if (!data || data.length === 0) return [0, 100];
  
  // Extract all values for the dataKey
  const values = data
    .map(item => item[dataKey] || 0)
    .filter(v => typeof v === 'number' && v >= 0);
  
  if (values.length === 0) return [0, 100];
  
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  
  // Mobile view: More aggressive padding for readability
  if (viewportWidth < 480) {
    const padding = maxValue * 0.25; // 25% padding on very small screens
    return [
      Math.max(0, minValue - padding),
      Math.ceil((maxValue + padding) / 100) * 100 // Round up to nearest 100
    ];
  }
  
  // Small tablet: Substantial padding
  if (viewportWidth < 640) {
    const padding = maxValue * 0.20; // 20% padding
    return [
      Math.max(0, minValue - padding),
      Math.ceil((maxValue + padding) / 100) * 100
    ];
  }
  
  // Tablet: Standard padding
  if (viewportWidth < 1024) {
    const padding = maxValue * 0.12; // 12% padding
    return [
      Math.max(0, minValue - padding),
      Math.ceil((maxValue + padding) / 100) * 100
    ];
  }
  
  // Desktop: Minimal padding
  const padding = maxValue * 0.10; // 10% padding
  return [
    Math.max(0, minValue - padding),
    Math.ceil((maxValue + padding) / 100) * 100
  ];
};

/**
 * Get axis configuration based on viewport and data type
 * @param {number} viewportWidth - Current viewport width
 * @param {boolean} isMonthData - Whether data is month-based
 * @returns {object} - Axis configuration
 */
export const getAxisConfig = (viewportWidth, isMonthData = true) => {
  // For mobile, prevent label rotation for months
  if (viewportWidth < 640 && isMonthData) {
    return {
      labelAngle: 0, // Never rotate month labels
      height: 35,
      dy: 5,
      tickFormatter: formatMonthShort // Format to short forms
    };
  }
  
  // For tablets and desktop
  if (viewportWidth < 1024 && isMonthData) {
    return {
      labelAngle: 0,
      height: 40,
      dy: 5,
      tickFormatter: formatMonthShort
    };
  }
  
  // Desktop
  return {
    labelAngle: 0,
    height: 30,
    dy: 0,
    tickFormatter: formatMonthShort
  };
};

/**
 * Format currency values for charts
 * @param {number} value - The value to format
 * @param {boolean} compact - Use compact notation for large numbers
 * @returns {string} - Formatted currency string
 */
export const formatChartCurrency = (value, compact = false) => {
  if (!value && value !== 0) return '₹0';
  
  if (compact) {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  }
  
  return `₹${value.toLocaleString('en-IN')}`;
};

/**
 * Calculate dynamic Y-axis domain for count-based data (enrollments, students, etc.)
 * Creates realistic integer-based domains without excessive padding
 * @param {array} data - Chart data array
 * @param {string} dataKey - Key to extract values from data (e.g., 'enrollments')
 * @returns {array} - [min, max] domain for Y-axis
 */
export const getDynamicCountDomain = (data, dataKey) => {
  if (!data || data.length === 0) return [0, 10];
  
  // Extract all values for the dataKey
  const values = data
    .map(item => item[dataKey] || 0)
    .filter(v => typeof v === 'number' && v >= 0);
  
  if (values.length === 0) return [0, 10];
  
  const maxValue = Math.max(...values);
  
  // For count data, use minimal padding and round to nice numbers
  if (maxValue === 0) return [0, 10]; // Default if all zeros
  if (maxValue <= 5) return [0, Math.ceil(maxValue * 1.5)]; // Small counts: 50% padding
  if (maxValue <= 10) return [0, Math.ceil(maxValue * 1.3)]; // Medium: 30% padding
  if (maxValue <= 20) return [0, Math.ceil(maxValue * 1.2)]; // Medium-high: 20% padding
  
  // Large counts: round up to nearest 10% increment
  const padding = maxValue * 0.15;
  return [0, Math.ceil((maxValue + padding) / 10) * 10];
};
