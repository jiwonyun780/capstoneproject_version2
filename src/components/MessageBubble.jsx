import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ComparisonModal } from './dashboard/ComparisonModal';

// Visual components for enhanced itinerary display
function ItineraryCard({ day, activities, weather, time }) {
  // Helper function to create Google Maps link
  const createMapLink = (location) => {
    const encodedLocation = encodeURIComponent(location);
    return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
  };

  // Helper function to extract location from activity title
  const extractLocation = (title) => {
    // Common patterns for extracting location names
    const patterns = [
      /Visit (.+?)(?:\s\(|$)/,
      /Explore (.+?)(?:\s|$)/,
      /Discover (.+?)(?:\s|$)/,
      /Enjoy (.+?)(?:\s|$)/,
      /Experience (.+?)(?:\s|$)/,
      /Shop and dine in (.+?)(?:\s|$)/
    ];
    
    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  };

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '16px',
      margin: '12px 0',
      backgroundColor: '#f8fafc',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: '#004C8C',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          marginRight: '12px'
        }}>
          {day}
        </div>
        <div>
          <h4 style={{ margin: '0', color: '#004C8C', fontSize: '16px' }}>Day {day}</h4>
          {time && <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>⏰ {time}</p>}
          {weather && <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>🌤️ {weather}</p>}
        </div>
      </div>
      <div>
        {activities.map((activity, index) => {
          const location = extractLocation(activity.title);
          const mapLink = location ? createMapLink(location) : null;
          
          return (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'flex-start',
              marginBottom: '8px',
              padding: '8px',
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#004C8C',
                marginRight: '12px',
                marginTop: '6px',
                flexShrink: 0
              }}></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                  {mapLink ? (
                    <a 
                      href={mapLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        color: '#004C8C',
                        textDecoration: 'underline',
                        fontWeight: 'bold'
                      }}
                    >
                      {activity.title}
                    </a>
                  ) : (
                    activity.title
                  )}
                </div>
                {activity.description && (
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{activity.description}</div>
                )}
                {activity.duration && (
                  <div style={{ fontSize: '12px', color: '#004C8C', marginTop: '4px' }}>
                    ⏱️ {activity.duration}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function LocationCard({ name, description, image, rating, price }) {
  // Helper function to create Google Maps link
  const createMapLink = (location) => {
    const encodedLocation = encodeURIComponent(location);
    return `https://www.google.com/maps/search/?api=1&query=${encodedLocation}`;
  };

  const mapLink = createMapLink(name);

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '16px',
      margin: '8px 0',
      backgroundColor: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {image && (
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '8px',
            backgroundColor: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontSize: '12px',
            flexShrink: 0
          }}>
            📍
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: '4px' }}>
            <h4 style={{ margin: '0', color: '#004C8C', fontSize: '16px' }}>
              <a 
                href={mapLink} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  color: '#004C8C',
                  textDecoration: 'underline',
                  fontWeight: 'bold'
                }}
              >
                {name}
              </a>
            </h4>
          </div>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#64748b' }}>{description}</p>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
            {rating && <span style={{ color: '#f59e0b' }}>⭐ {rating}</span>}
            {price && <span style={{ color: '#004C8C' }}>💰 {price}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to render text with map links
function renderTextWithMapLinks(text) {
  // Common attraction and location patterns
  const locationPatterns = [
    // Tokyo attractions
    /(Senso-ji Temple)/g,
    /(Tsukiji Outer Market)/g,
    /(Harajuku district)/g,
    /(Shibuya Crossing)/g,
    /(Meiji Shrine)/g,
    /(Yoyogi Park)/g,
    /(Asakusa district)/g,
    /(Tokyo Skytree)/g,
    /(Akihabara)/g,
    /(Ginza)/g,
    /(Imperial Palace)/g,
    /(East Gardens)/g,
    /(Roppongi area)/g,
    
    // Paris attractions
    /(Eiffel Tower)/g,
    /(Louvre Museum)/g,
    /(Notre Dame)/g,
    /(Notre-Dame)/g,
    /(Champs-Élysées)/g,
    /(Arc de Triomphe)/g,
    /(Montmartre)/g,
    /(Sacré-Cœur Basilica)/g,
    /(Musée d'Orsay)/g,
    /(Orsay Museum)/g,
    /(Palace of Versailles)/g,
    /(Hall of Mirrors)/g,
    /(Marie Antoinette's Estate)/g,
    /(Seine River)/g,
    /(Seine River Cruise)/g,
    /(Luxembourg Gardens)/g,
    /(Jardin des Tuileries)/g,
    /(Île de la Cité)/g,
    /(Canal Saint-Martin)/g,
    /(Centre Pompidou)/g,
    /(Palace of Fontainebleau)/g,
    /(Le Marais)/g,
    /(Marché des Enfants Rouges)/g,
    /(Moulin Rouge)/g,
    
    // Paris restaurants and cafes
    /(Le Procope)/g,
    /(Breizh Café)/g,
    /(Pierre Hermé)/g,
    /(Le Meurice)/g,
    /(Galeries Lafayette)/g,
    
    // New York attractions
    /(Times Square)/g,
    /(Central Park)/g,
    /(Statue of Liberty)/g,
    /(Brooklyn Bridge)/g,
    
    // San Francisco attractions
    /(Golden Gate Bridge)/g,
    /(Alcatraz Island)/g,
    /(Fisherman's Wharf)/g,
    
    // London attractions
    /(Big Ben)/g,
    /(London Eye)/g,
    /(Tower Bridge)/g,
    /(Buckingham Palace)/g,
    
    // Rome attractions
    /(Colosseum)/g,
    /(Vatican City)/g,
    /(Trevi Fountain)/g,
    /(Spanish Steps)/g
  ];

  let result = text;
  
  // Handle bold text (**text**)
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: bold;">$1</strong>');
  
  locationPatterns.forEach(pattern => {
    result = result.replace(pattern, (match, location) => {
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      return `<a href="${mapLink}" target="_blank" rel="noopener noreferrer" style="color: #004C8C; text-decoration: underline; font-weight: bold;">${location}</a>`;
    });
  });

  // Additional generic patterns for restaurants, cafes, and other locations
  const genericPatterns = [
    // Restaurant patterns
    /(Le [A-Z][a-z]+)/g,  // Le Procope, Le Bistro, etc.
    /([A-Z][a-z]+ Café)/g,  // Breizh Café, etc.
    /([A-Z][a-z]+ Restaurant)/g,  // Any Restaurant
    /([A-Z][a-z]+ Bistro)/g,  // Any Bistro
    
    // River and water patterns
    /(Seine River)/g,
    /(River [A-Z][a-z]+)/g,
    
    // Museum patterns
    /([A-Z][a-z]+ Museum)/g,
    /(Musée [a-z]+)/g,  // Musée d'Orsay, etc.
    
    // Palace and estate patterns
    /(Palace of [A-Z][a-z]+)/g,
    /([A-Z][a-z]+'s Estate)/g,
    
    // Garden patterns
    /(Gardens of [A-Z][a-z]+)/g,
    /([A-Z][a-z]+ Gardens)/g,
    /(Jardin [a-z]+)/g,  // Jardin des Tuileries, etc.
    
    // Market patterns
    /(Marché [a-z]+)/g,  // Marché des Enfants Rouges, etc.
    
    // Neighborhood patterns
    /(Le [A-Z][a-z]+)/g,  // Le Marais, etc.
    /([A-Z][a-z]+ district)/g,  // Montmartre district, etc.
    
    // Entertainment patterns
    /([A-Z][a-z]+ Rouge)/g,  // Moulin Rouge, etc.
    /([A-Z][a-z]+ Theatre)/g,  // Any Theatre
    /([A-Z][a-z]+ Theater)/g,  // Any Theater
  ];

  genericPatterns.forEach(pattern => {
    result = result.replace(pattern, (match, location) => {
      const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
      return `<a href="${mapLink}" target="_blank" rel="noopener noreferrer" style="color: #004C8C; text-decoration: underline; font-weight: bold;">${location}</a>`;
    });
  });

  return <span dangerouslySetInnerHTML={{ __html: result }} />;
}

// Render itinerary visual components
function renderItineraryVisual(content) {
  const itineraryMatch = content.match(/```itinerary\n([\s\S]*?)\n```/);
  if (!itineraryMatch) return renderMarkdown(content);
  
  try {
    const itineraryData = JSON.parse(itineraryMatch[1]);
    return (
      <div style={{ margin: '16px 0' }}>
        {itineraryData.days?.map((day, index) => (
          <ItineraryCard
            key={index}
            day={day.day || index + 1}
            activities={day.activities || []}
            weather={day.weather}
            time={day.time}
          />
        ))}
      </div>
    );
  } catch (e) {
    return renderMarkdown(content);
  }
}

// Render location visual components
function renderLocationVisual(content) {
  const locationMatch = content.match(/```location\n([\s\S]*?)\n```/);
  if (!locationMatch) return renderMarkdown(content);
  
  try {
    const locationData = JSON.parse(locationMatch[1]);
    return (
      <div style={{ margin: '16px 0' }}>
        {Array.isArray(locationData) ? (
          locationData.map((location, index) => (
            <LocationCard
              key={index}
              name={location.name}
              description={location.description}
              image={location.image}
              rating={location.rating}
              price={location.price}
            />
          ))
        ) : (
          <LocationCard
            name={locationData.name}
            description={locationData.description}
            image={locationData.image}
            rating={locationData.rating}
            price={locationData.price}
          />
        )}
      </div>
    );
  } catch (e) {
    return renderMarkdown(content);
  }
}

// Enhanced markdown renderer with visual components for travel assistant responses
function renderMarkdown(content, onGenerateItinerary = null, onSaveTrip = null) {
  if (!content) return '';
  
  // Check for special visual patterns first
  if (content.includes('```itinerary')) {
    return renderItineraryVisual(content);
  }
  
  if (content.includes('```location')) {
    return renderLocationVisual(content);
  }
  
  // Split content into lines for processing
  const lines = content.split('\n');
  const elements = [];
  let inTable = false;
  let tableRows = [];
  let tableIndex = 0; // Track table index for unique keys
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle headers
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: '18px', fontWeight: '700', margin: '12px 0 8px 0', color: '#004C8C' }}>{line.substring(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: '16px', fontWeight: '600', margin: '10px 0 6px 0', color: '#004C8C' }}>{line.substring(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: '14px', fontWeight: '600', margin: '8px 0 4px 0', color: '#004C8C' }}>{line.substring(4)}</h3>);
    }
    // Handle tables
    else if (line.includes('|') && line.split('|').length > 2) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
      
      // Filter out header separator rows (rows where all cells are only hyphens)
      // Pattern: ^-+$ means the cell contains only one or more hyphens
      const isHeaderSeparator = cells.length > 0 && cells.every(cell => /^-+$/.test(cell));
      
      if (cells.length > 0 && !isHeaderSeparator) {
        tableRows.push(cells);
      }
    }
    // Handle list items
    else if (line.startsWith('- ')) {
      if (inTable) {
        // Close table first
        elements.push(renderTable(tableRows, tableIndex++, onGenerateItinerary, onSaveTrip, content));
        inTable = false;
        tableRows = [];
      }
      elements.push(<div key={i} style={{ margin: '4px 0', paddingLeft: '16px' }}>• {renderTextWithMapLinks(line.substring(2))}</div>);
    }
    // Handle numbered lists
    else if (/^\d+\.\s/.test(line)) {
      if (inTable) {
        // Close table first
        elements.push(renderTable(tableRows, tableIndex++, onGenerateItinerary, onSaveTrip, content));
        inTable = false;
        tableRows = [];
      }
      elements.push(<div key={i} style={{ margin: '4px 0', paddingLeft: '16px' }}>{renderTextWithMapLinks(line)}</div>);
    }
    // Handle regular paragraphs
    else if (line) {
      if (inTable) {
        // Close table first
        elements.push(renderTable(tableRows, tableIndex++, onGenerateItinerary, onSaveTrip, content));
        inTable = false;
        tableRows = [];
      }
      elements.push(<div key={i} style={{ margin: '6px 0', lineHeight: '1.5' }}>{renderTextWithMapLinks(line)}</div>);
    }
    // Handle empty lines
    else {
      if (inTable) {
        // Close table first
        elements.push(renderTable(tableRows, tableIndex++, onGenerateItinerary, onSaveTrip, content));
        inTable = false;
        tableRows = [];
      }
      elements.push(<br key={i} />);
    }
  }
  
  // Close any remaining table
  if (inTable) {
    elements.push(renderTable(tableRows, tableIndex++, onGenerateItinerary, onSaveTrip, content));
  }
  
  return elements;
}

function renderCellContent(cell, rowIndex, cellIndex) {
  if (!cell) return '';
  
  // Check if it's a markdown link [text](url)
  const linkMatch = cell.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (linkMatch) {
    const [, text, url] = linkMatch;
    
    // Special styling for "Book Now" links
    if (text === 'Book Now') {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: '600',
            padding: '6px 12px',
            backgroundColor: '#00ADEF',
            borderRadius: '6px',
            display: 'inline-block',
            fontSize: '11px',
            textAlign: 'center',
            minWidth: '70px',
            boxShadow: '0 2px 4px rgba(0, 173, 239, 0.3)',
            transition: 'all 0.2s ease',
            border: 'none'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#006AAF';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(0, 173, 239, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#00ADEF';
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 4px rgba(0, 173, 239, 0.3)';
          }}
        >
          {text}
        </a>
      );
    }
    
    // Regular link styling for other links
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#004C8C',
          textDecoration: 'underline',
          fontWeight: '500',
          padding: '4px 8px',
          backgroundColor: '#f0f9ff',
          borderRadius: '4px',
          display: 'inline-block',
          fontSize: '12px'
        }}
      >
        {text}
      </a>
    );
  }
  
  // Check if it's a flight code (alphanumeric with 2-3 letters followed by numbers)
  const flightCodeMatch = cell.match(/^[A-Z]{2,3}\d{3,4}$/);
  if (flightCodeMatch) {
    return (
      <span style={{
        fontFamily: 'monospace',
        fontSize: '13px',
        fontWeight: '500',
        backgroundColor: '#f8fafc',
        padding: '2px 6px',
        borderRadius: '3px',
        border: '1px solid #e2e8f0'
      }}>
        {cell}
      </span>
    );
  }
  
  // Check if it's a price (starts with $)
  if (cell.startsWith('$')) {
    return (
      <span style={{
        fontWeight: '600',
        color: '#059669'
      }}>
        {cell}
      </span>
    );
  }
  
  // Check if it's "Non-stop"
  if (cell === 'Non-stop') {
    return (
      <span style={{
        backgroundColor: '#dcfce7',
        color: '#166534',
        padding: '2px 6px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '500'
      }}>
        {cell}
      </span>
    );
  }
  
  // Check if it's a stop count (e.g., "1 stop", "2 stops")
  if (cell.match(/^\d+\s+stop(s)?$/)) {
    return (
      <span style={{
        backgroundColor: '#fef3c7',
        color: '#92400e',
        padding: '2px 6px',
        borderRadius: '12px',
        fontSize: '11px',
        fontWeight: '500'
      }}>
        {cell}
      </span>
    );
  }
  
  // Default rendering
  return cell;
}

// FlightTableComparison component to handle comparison state
function FlightTableComparison({ rows, messageContent, tableIndex }) {
  const [firstFlight, setFirstFlight] = useState(null);
  const [secondFlight, setSecondFlight] = useState(null);
  const [showFlightSelection, setShowFlightSelection] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    
    // Listen for compare events
    const handleCompare = (event) => {
      const { rowIndex, tableIndex: eventTableIndex } = event.detail;
      if (eventTableIndex !== tableIndex) return;
      
      if (rows.length < 2 || rowIndex < 1) return;
      
      const headerRow = rows[0];
      const selectedRow = rows[rowIndex];
      const selected = rowToFlight(headerRow, selectedRow, rowIndex);
      
      // Set first flight and show selection UI
      setFirstFlight(selected);
      setShowFlightSelection(true);
      setSecondFlight(null);
    };
    
    window.addEventListener('compareFlight', handleCompare);
    return () => window.removeEventListener('compareFlight', handleCompare);
  }, [rows, tableIndex]);
  
  // Convert table row to flight object
  const rowToFlight = (headerRow, dataRow, rowIndex) => {
    const getColumnIndex = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const airlineIndex = getColumnIndex(['airline']);
    const flightCodeIndex = getColumnIndex(['flight code', 'flight']);
    const priceIndex = getColumnIndex(['price']);
    const durationIndex = getColumnIndex(['duration']);
    const stopsIndex = getColumnIndex(['stop', 'stops', 'layover']);
    const departureIndex = getColumnIndex(['departure']);
    const arrivalIndex = getColumnIndex(['arrival']);
    
    // Extract price and currency (remove $, € and parse)
    const priceStr = priceIndex >= 0 && dataRow[priceIndex] ? dataRow[priceIndex].toString().trim() : '0';
    let currency = 'USD'; // Default
    if (priceStr.includes('€') || priceStr.includes('EUR')) {
      currency = 'EUR';
    } else if (priceStr.includes('$') || priceStr.includes('USD')) {
      currency = 'USD';
    }
    const priceMatch = priceStr.match(/[€$]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
    
    // Extract stops
    const stopsStr = stopsIndex >= 0 && dataRow[stopsIndex] ? dataRow[stopsIndex].toString().trim() : '0';
    const stopsMatch = stopsStr.match(/(\d+)/);
    const stops = stopsMatch ? parseInt(stopsMatch[1]) : (stopsStr.toLowerCase().includes('non-stop') ? 0 : 0);
    
    return {
      id: `flight-${tableIndex}-${rowIndex}`,
      airline: airlineIndex >= 0 && dataRow[airlineIndex] ? dataRow[airlineIndex].toString().trim() : 'Unknown',
      flightNumber: flightCodeIndex >= 0 && dataRow[flightCodeIndex] ? dataRow[flightCodeIndex].toString().trim() : '',
      price: price,
      currency: currency,
      duration: durationIndex >= 0 && dataRow[durationIndex] ? dataRow[durationIndex].toString().trim() : '',
      stops: stops,
      departure: departureIndex >= 0 && dataRow[departureIndex] ? dataRow[departureIndex].toString().trim() : '',
      arrival: arrivalIndex >= 0 && dataRow[arrivalIndex] ? dataRow[arrivalIndex].toString().trim() : '',
    };
  };
  
  // Get all available flights for selection
  const getAvailableFlights = () => {
    if (rows.length < 2) return [];
    
    const headerRow = rows[0];
    const availableFlights = [];
    for (let i = 1; i < rows.length; i++) {
      const flight = rowToFlight(headerRow, rows[i], i);
      // Exclude the first selected flight
      if (!firstFlight || flight.id !== firstFlight.id) {
        availableFlights.push(flight);
      }
    }
    return availableFlights;
  };
  
  // Handle second flight selection
  const handleSelectSecondFlight = (flight) => {
    setSecondFlight(flight);
    setShowFlightSelection(false);
    setShowComparison(true);
  };
  
  // Close selection and comparison
  const handleClose = () => {
    setShowFlightSelection(false);
    setShowComparison(false);
    setFirstFlight(null);
    setSecondFlight(null);
  };
  
  const availableFlights = getAvailableFlights();
  
  return (
    <>
      {/* Flight Selection Modal */}
      {mounted && showFlightSelection && firstFlight && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={handleClose}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClose}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                padding: '4px 8px',
                borderRadius: '4px',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
              onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              ×
            </button>
            
            <h2 style={{ 
              marginTop: 0, 
              marginBottom: '8px',
              fontSize: '24px',
              fontWeight: '600',
              color: '#004C8C'
            }}>
              Select Flight to Compare
            </h2>
            <p style={{ 
              marginTop: 0, 
              marginBottom: '20px',
              color: '#666',
              fontSize: '14px'
            }}>
              You selected: <strong>{firstFlight.airline} {firstFlight.flightNumber}</strong>. Choose a second flight to compare.
            </p>
            
            {availableFlights.length === 0 ? (
              <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                No other flights available for comparison.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {availableFlights.map((flight) => (
                  <button
                    key={flight.id}
                    onClick={() => handleSelectSecondFlight(flight)}
                    style={{
                      padding: '16px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#f0f9ff';
                      e.target.style.borderColor = '#00ADEF';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = 'white';
                      e.target.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', color: '#004C8C', marginBottom: '4px' }}>
                        {flight.airline} {flight.flightNumber}
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {flight.duration} • {flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <div style={{ fontWeight: '600', color: '#00ADEF', fontSize: '16px' }}>
                      {flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '$'}{flight.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      
      {/* Comparison Modal - Only show when both flights are selected */}
      {mounted && showComparison && firstFlight && secondFlight && createPortal(
        <ComparisonModal
          selectedFlight={firstFlight}
          alternativeFlights={[secondFlight]}
          onClose={handleClose}
        />,
        document.body
      )}
    </>
  );
}

function renderTable(rows, tableIndex = 0, onGenerateItinerary = null, onSaveTrip = null, messageContent = '', onCompare = null) {
  if (rows.length === 0) return null;
  
  // Generate a unique key for the table using index and a hash of first row content
  const firstRowHash = rows[0] ? rows[0].join('|').substring(0, 20) : '';
  const uniqueKey = `table-${tableIndex}-${rows.length}-${firstRowHash}`;
  
  // Check if this is a flight table (has "Airline" or "Flight Code" in header)
  const isFlightTable = rows.length > 0 && rows[0] && (
    rows[0].some(cell => cell && (
      cell.toString().toLowerCase().includes('airline') ||
      cell.toString().toLowerCase().includes('flight code') ||
      cell.toString().toLowerCase().includes('flight')
    ))
  );

  // Extract flight summary from table and message - returns both display string and data object
  const extractFlightSummary = () => {
    if (!isFlightTable || rows.length < 2) return { display: null, data: null };
    
    const headerRow = rows[0];
    const firstDataRow = rows[1]; // First flight option
    
    // Find column indices
    const getColumnIndex = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const priceIndex = getColumnIndex(['price']);
    const stopsIndex = getColumnIndex(['stop', 'stops', 'layover']);
    const originIndex = getColumnIndex(['origin']);
    const destIndex = getColumnIndex(['destination']);
    const departureIndex = getColumnIndex(['departure']);
    const arrivalIndex = getColumnIndex(['arrival']);
    
    // Extract values from table
    const price = priceIndex >= 0 && firstDataRow[priceIndex] ? firstDataRow[priceIndex].toString().trim() : null;
    const stops = stopsIndex >= 0 && firstDataRow[stopsIndex] ? firstDataRow[stopsIndex].toString().trim() : null;
    const originFromTable = originIndex >= 0 && firstDataRow[originIndex] ? firstDataRow[originIndex].toString().trim() : null;
    const destFromTable = destIndex >= 0 && firstDataRow[destIndex] ? firstDataRow[destIndex].toString().trim() : null;
    
    // Extract airport codes from message (look for patterns like "IAD → BCN" or "JFK to CDG")
    let originCode = null;
    let destCode = null;
    let originCity = null;
    let destCity = null;
    
    // First, try to extract from table columns if available
    if (originFromTable && destFromTable) {
      // Check if they look like airport codes (3 uppercase letters)
      const originMatch = originFromTable.match(/\b([A-Z]{3})\b/);
      const destMatch = destFromTable.match(/\b([A-Z]{3})\b/);
      if (originMatch && destMatch) {
        originCode = originMatch[1];
        destCode = destMatch[1];
      } else {
        // Might be city names
        originCity = originFromTable;
        destCity = destFromTable;
      }
    }
    
    // Pattern 1: "IAD → BCN" or "JFK → CDG" in message
    if (!originCode || !destCode) {
      const arrowPattern = /([A-Z]{3})\s*→\s*([A-Z]{3})/;
      const arrowMatch = messageContent.match(arrowPattern);
      if (arrowMatch) {
        originCode = arrowMatch[1];
        destCode = arrowMatch[2];
      }
    }
    
    // Pattern 2: "JFK to CDG" or "IAD to BCN"
    if (!originCode || !destCode) {
      const toPattern = /\b([A-Z]{3})\s+to\s+([A-Z]{3})\b/;
      const toMatch = messageContent.match(toPattern);
      if (toMatch) {
        originCode = toMatch[1];
        destCode = toMatch[2];
      }
    }
    
    // Pattern 3: Look for airport codes in parentheses (e.g., "New York (JFK) to Barcelona (BCN)")
    if (!originCode || !destCode) {
      const codePattern = /\(([A-Z]{3})\)/g;
      const codes = [];
      let match;
      while ((match = codePattern.exec(messageContent)) !== null) {
        codes.push(match[1]);
      }
      if (codes.length >= 2) {
        originCode = codes[0];
        destCode = codes[1];
      }
    }
    
    // Pattern 4: Look for codes in header (e.g., "# Flights from New York (JFK) to Barcelona (BCN)")
    if (!originCode || !destCode) {
      const headerPattern = /from\s+[^(]*\(([A-Z]{3})\)[^to]*to\s+[^(]*\(([A-Z]{3})\)/i;
      const headerMatch = messageContent.match(headerPattern);
      if (headerMatch) {
        originCode = headerMatch[1];
        destCode = headerMatch[2];
      }
    }
    
    // Extract city names from message
    const routeMatch = messageContent.match(/from\s+([^to()]+)\s+to\s+([^\n()]+)/i);
    if (routeMatch) {
      originCity = routeMatch[1].trim().replace(/\([^)]*\)/g, '').trim();
      destCity = routeMatch[2].trim().split(/\s+/)[0].replace(/\([^)]*\)/g, '').trim();
    }
    
    // Extract dates from message
    let departureDate = null;
    let returnDate = null;
    const datePatterns = [
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/gi,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/gi,
    ];
    
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                       'july', 'august', 'september', 'october', 'november', 'december'];
    const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    const dateMatches = [];
    datePatterns.forEach(pattern => {
      const matches = messageContent.match(pattern);
      if (matches) {
        dateMatches.push(...matches);
      }
    });
    
    if (dateMatches.length > 0) {
      departureDate = dateMatches[0];
      if (dateMatches.length > 1) {
        returnDate = dateMatches[1];
      }
    }
    
    // Extract stop information
    let stopInfo = null;
    if (stops) {
      const cleanStops = stops.replace(/\[.*?\]\(.*?\)/g, '').replace(/<[^>]*>/g, '').trim();
      const stopMatch = cleanStops.match(/(\d+)\s+stop/i);
      if (stopMatch) {
        const stopCount = parseInt(stopMatch[1]);
        if (stopCount > 0) {
          stopInfo = `${stopCount} stop${stopCount > 1 ? 's' : ''}`;
        } else {
          stopInfo = 'Non-stop';
        }
      } else if (cleanStops.toLowerCase().includes('non-stop') || cleanStops.toLowerCase().includes('nonstop')) {
        stopInfo = 'Non-stop';
      } else if (cleanStops) {
        stopInfo = cleanStops;
      }
    }
    
    // Extract and clean price
    let cleanPrice = null;
    if (price) {
      const cleanPriceStr = price.replace(/\[.*?\]\(.*?\)/g, '').replace(/<[^>]*>/g, '').trim();
      const priceMatch = cleanPriceStr.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (priceMatch) {
        cleanPrice = '$' + priceMatch[1].replace(/,/g, '');
      }
    }
    
    // Build data object for navigation
    const summaryData = {
      originCode: originCode,
      destCode: destCode,
      originCity: originCity,
      destCity: destCity,
      origin: originCity || originCode,
      destination: destCity || destCode,
      departureDate: departureDate,
      returnDate: returnDate,
      price: cleanPrice,
      stops: stopInfo
    };
    
    // Build display string
    const parts = [];
    if (originCode && destCode) {
      parts.push(`${originCode} → ${destCode}`);
    } else if (originCity && destCity) {
      parts.push(`${originCity} → ${destCity}`);
    } else {
      return { display: null, data: summaryData };
    }
    
    if (departureDate) {
      parts.push(departureDate);
    }
    
    if (cleanPrice) {
      parts.push(cleanPrice);
    }
    
    if (stopInfo) {
      parts.push(stopInfo);
    }
    
    const displayString = parts.length >= 2 ? parts.join(' | ') : null;
    return { display: displayString, data: summaryData };
  };

  const flightSummaryResult = isFlightTable ? extractFlightSummary() : null;
  const flightSummary = flightSummaryResult?.display || null;
  const flightSummaryData = flightSummaryResult?.data || null;
  
  // Helper function to get column index for flight table
  const getColumnIndex = (keywords) => {
    if (rows.length === 0) return -1;
    const headerRow = rows[0];
    for (let i = 0; i < headerRow.length; i++) {
      const header = headerRow[i]?.toString().toLowerCase().trim() || '';
      if (keywords.some(keyword => header.includes(keyword))) {
        return i;
      }
    }
    return -1;
  };
  
  const bookNowIndex = getColumnIndex(['book now', 'book']);
  
  return (
    <div key={uniqueKey}>
      {/* FlightTableComparison component for modal management */}
      {isFlightTable && <FlightTableComparison rows={rows} messageContent={messageContent} tableIndex={tableIndex} />}
      
      <div style={{ margin: '8px 0', overflowX: 'auto' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse', 
          fontSize: '14px',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden'
        }}>
          <tbody>
            {rows.map((row, rowIndex) => {
              return (
                <tr key={`${uniqueKey}-row-${rowIndex}`} style={{ 
                  backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
                  borderBottom: rowIndex < rows.length - 1 ? '1px solid var(--border)' : 'none'
                }}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${uniqueKey}-cell-${rowIndex}-${cellIndex}`} style={{ 
                      padding: '8px 12px', 
                      textAlign: cellIndex === 0 ? 'center' : 'left',
                      borderRight: cellIndex < row.length - 1 ? '1px solid var(--border)' : 'none',
                      fontWeight: rowIndex === 0 ? '600' : 'normal',
                      color: rowIndex === 0 ? '#004C8C' : 'inherit',
                      verticalAlign: 'middle'
                    }}>
                      {renderCellContent(cell, rowIndex, cellIndex)}
                    </td>
                  ))}
                  {/* Add compare button column for flight tables (data rows only) */}
                  {isFlightTable && rowIndex > 0 && (
                    <td style={{ 
                      padding: '8px 12px', 
                      textAlign: 'center',
                      borderRight: 'none',
                      verticalAlign: 'middle'
                    }}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const event = new CustomEvent('compareFlight', {
                            detail: { rowIndex, tableIndex }
                          });
                          window.dispatchEvent(event);
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#00ADEF',
                          backgroundColor: 'white',
                          border: '1px solid #00ADEF',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = '#E6F7FF';
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = 'white';
                        }}
                      >
                        Compare
                      </button>
                    </td>
                  )}
                  {/* Add empty header cell for compare column */}
                  {isFlightTable && rowIndex === 0 && (
                    <td style={{ 
                      padding: '8px 12px', 
                      textAlign: 'center',
                      borderRight: 'none',
                      fontWeight: '600',
                      color: '#004C8C',
                      verticalAlign: 'middle'
                    }}>
                      Compare
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      {/* Flight summary badge */}
      {isFlightTable && flightSummary && (
        <div style={{
          marginTop: '16px',
          marginBottom: '8px',
          padding: '10px 16px',
          backgroundColor: '#f0f9ff',
          border: '1px solid #00ADEF',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#004C8C',
          display: 'inline-block'
        }}>
          {flightSummary}
        </div>
      )}
      
      {/* Add buttons for flight tables */}
      {isFlightTable && (onGenerateItinerary || onSaveTrip) && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'row', 
          gap: '12px', 
          marginTop: flightSummary ? '8px' : '16px',
          flexWrap: 'wrap'
        }}>
          {onGenerateItinerary && (
            <button
              onClick={() => {
                // Extract route info from table and message
                const summaryResult = extractFlightSummary();
                const routeData = {
                  messageContent: messageContent,
                  flightSummary: summaryResult?.data || null,
                  tableRows: rows
                };
                onGenerateItinerary(JSON.stringify(routeData));
              }}
              style={{
                backgroundColor: '#00ADEF',
                color: 'white',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 4px rgba(0, 173, 239, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#006AAF';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#00ADEF';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Generate Itinerary
            </button>
          )}
          {onSaveTrip && (
            <button
              onClick={() => onSaveTrip(messageContent)}
              style={{
                backgroundColor: 'white',
                color: '#00ADEF',
                fontWeight: '600',
                padding: '12px 24px',
                borderRadius: '8px',
                border: '2px solid #00ADEF',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#E6F7FF';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'white';
              }}
            >
              Save Trip
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MessageBubble({ role, content, timestamp, onGenerateItinerary, onSaveTrip }) {
  const isUser = role === 'user';
  
  return (
    <div className={`message-row ${isUser ? 'message-row-user' : ''}`}>
      {!isUser && (
        <div className="avatar avatar-assistant">
          <img 
            src={process.env.PUBLIC_URL + '/Miles_logo.png'} 
            alt="Miles" 
            style={{ width: '32px', height: '32px' }}
          />
        </div>
      )}
      <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        {isUser ? content : renderMarkdown(content, onGenerateItinerary, onSaveTrip)}
        {timestamp && <div className="bubble-meta">{timestamp}</div>}
      </div>
    </div>
  );
}