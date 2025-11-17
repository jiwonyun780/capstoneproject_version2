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
  
  // Handle markdown links [text](url) FIRST - before other processing
  // This ensures GetYourGuide/Viator links are converted to clickable hyperlinks
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    // Ensure URL is absolute (starts with http:// or https://)
    const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
      ? url 
      : `https://${url}`;
    
    return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color: #004C8C; text-decoration: underline; font-weight: 500;">${linkText}</a>`;
  });
  
  // Handle bold text (**text**) - after links to avoid conflicts
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
function renderItineraryVisual(content, skipMarkdown = false) {
  const itineraryMatch = content.match(/```itinerary\n([\s\S]*?)\n```/);
  if (!itineraryMatch) {
    // Prevent infinite recursion: if skipMarkdown is true, return plain text
    if (skipMarkdown) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
    // Remove itinerary block and render the rest
    const withoutItinerary = content.replace(/```itinerary[\s\S]*?```/g, '');
    return withoutItinerary ? renderMarkdown(withoutItinerary, null, null, true) : null;
  }
  
  try {
    const itineraryData = JSON.parse(itineraryMatch[1]);
    const remainingContent = content.replace(/```itinerary\n[\s\S]*?\n```/g, '');
    
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
        {remainingContent.trim() && renderMarkdown(remainingContent, null, null, true)}
      </div>
    );
  } catch (e) {
    // Prevent infinite recursion: if skipMarkdown is true, return plain text
    if (skipMarkdown) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
    // Remove itinerary block and render the rest
    const withoutItinerary = content.replace(/```itinerary[\s\S]*?```/g, '');
    return withoutItinerary ? renderMarkdown(withoutItinerary, null, null, true) : null;
  }
}

// Render location visual components
function renderLocationVisual(content, skipMarkdown = false) {
  const locationMatch = content.match(/```location\n([\s\S]*?)\n```/);
  if (!locationMatch) {
    // Prevent infinite recursion: if skipMarkdown is true, return plain text
    if (skipMarkdown) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
    // Remove location block and render the rest
    const withoutLocation = content.replace(/```location[\s\S]*?```/g, '');
    return withoutLocation ? renderMarkdown(withoutLocation, null, null, true) : null;
  }
  
  try {
    const locationData = JSON.parse(locationMatch[1]);
    const remainingContent = content.replace(/```location\n[\s\S]*?\n```/g, '');
    
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
        {remainingContent.trim() && renderMarkdown(remainingContent, null, null, true)}
      </div>
    );
  } catch (e) {
    // Prevent infinite recursion: if skipMarkdown is true, return plain text
    if (skipMarkdown) {
      return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
    }
    // Remove location block and render the rest
    const withoutLocation = content.replace(/```location[\s\S]*?```/g, '');
    return withoutLocation ? renderMarkdown(withoutLocation, null, null, true) : null;
  }
}

// Enhanced markdown renderer with visual components for travel assistant responses
function renderMarkdown(content, onGenerateItinerary = null, onSaveTrip = null, skipVisualCheck = false) {
  if (!content) return '';
  
  // Check for special visual patterns first (unless we're already processing them to prevent recursion)
  if (!skipVisualCheck) {
  if (content.includes('```itinerary')) {
      return renderItineraryVisual(content, false);
  }
  
  if (content.includes('```location')) {
      return renderLocationVisual(content, false);
    }
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
    // Skip rendering "Outbound Flights" and "Return Flights" headers as they're handled by the table renderer
    if (line.startsWith('# ')) {
      const headerText = line.substring(2).trim();
      if (!headerText.toLowerCase().includes('outbound flights') && !headerText.toLowerCase().includes('return flights')) {
        elements.push(<h1 key={i} style={{ fontSize: '18px', fontWeight: '700', margin: '12px 0 8px 0', color: '#004C8C' }}>{headerText}</h1>);
      }
    } else if (line.startsWith('## ')) {
      const headerText = line.substring(3).trim();
      if (!headerText.toLowerCase().includes('outbound flights') && !headerText.toLowerCase().includes('return flights')) {
        elements.push(<h2 key={i} style={{ fontSize: '16px', fontWeight: '600', margin: '10px 0 6px 0', color: '#004C8C' }}>{headerText}</h2>);
      }
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

function renderCellContent(cell, rowIndex, cellIndex, headerRow = null, isReturnFlightsTable = false) {
  if (!cell) return '';
  
  // Check if cell contains multiple markdown links (for hotel booking links)
  // Pattern: [text](url) [text](url) [text](url) or [text](url) | [text](url) | [text](url)
  const multipleLinksMatch = cell.match(/\[([^\]]+)\]\(([^)]+)\)/g);
  if (multipleLinksMatch && multipleLinksMatch.length > 1) {
    // Extract all links from the cell
    const links = [];
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let lastIndex = 0;
    let linkIndex = 0;
    
    while ((match = linkPattern.exec(cell)) !== null) {
      // Add text before the link (including separators like " | ")
      if (match.index > lastIndex) {
        const textBefore = cell.substring(lastIndex, match.index).trim();
        if (textBefore) {
          // Clean up separators (|) and add spacing
          const cleanedText = textBefore.replace(/\|/g, '').trim();
          if (cleanedText) {
            links.push(<span key={`text-${lastIndex}`}>{cleanedText} </span>);
          } else if (linkIndex > 0) {
            // Add separator between links
            links.push(<span key={`sep-${linkIndex}`}> | </span>);
          }
        } else if (linkIndex > 0) {
          // Add separator between links if no text between them
          links.push(<span key={`sep-${linkIndex}`}> | </span>);
        }
      } else if (linkIndex > 0) {
        // Add separator between links
        links.push(<span key={`sep-${linkIndex}`}> | </span>);
      }
      
      const [, text, url] = match;
      const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `https://${url}`;
      
      // Create hyperlink
      links.push(
        <a
          key={`link-${match.index}`}
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#004C8C',
            textDecoration: 'underline',
            fontWeight: '500',
            marginRight: '4px',
            display: 'inline-block'
          }}
        >
          {text}
        </a>
      );
      
      lastIndex = match.index + match[0].length;
      linkIndex++;
    }
    
    // Add any remaining text after the last link
    if (lastIndex < cell.length) {
      const textAfter = cell.substring(lastIndex).trim();
      if (textAfter) {
        const cleanedText = textAfter.replace(/\|/g, '').trim();
        if (cleanedText) {
          links.push(<span key={`text-${lastIndex}`}> {cleanedText}</span>);
        }
      }
    }
    
    return <span>{links}</span>;
  }
  
  // Check if it's a single markdown link [text](url)
  const linkMatch = cell.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (linkMatch) {
    const [, text, url] = linkMatch;
    const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
      ? url 
      : `https://${url}`;
    
    // Special styling for "Book Now" links
    if (text === 'Book Now') {
      return (
        <a
          href={fullUrl}
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
    
    // Regular link styling for other links (including hotel booking links)
    return (
      <a
        href={fullUrl}
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
  
  // Check if cell contains a single markdown link (not at start/end, might be mixed with text)
  const singleLinkMatch = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (singleLinkMatch) {
    const [, text, url] = singleLinkMatch;
    const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
      ? url 
      : `https://${url}`;
    
    // Replace the markdown link with actual hyperlink
    const parts = cell.split(singleLinkMatch[0]);
    return (
      <span>
        {parts[0]}
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#004C8C',
            textDecoration: 'underline',
            fontWeight: '500',
            margin: '0 4px'
          }}
        >
          {text}
        </a>
        {parts[1]}
      </span>
    );
  }
  
  // For Return Flights table: Process Departure column to remove layover parentheses
  if (isReturnFlightsTable && headerRow && rowIndex > 0) {
    const getColumnIndex = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const departureIndex = getColumnIndex(['departure']);
    if (cellIndex === departureIndex) {
      // Remove layover information in parentheses from departure cell
      let cleanedCell = cell.toString();
      // Remove patterns like "(AMS 8h 15m)" or "(via AMS)" or "(AMS)"
      cleanedCell = cleanedCell.replace(/\s*\([^)]*\)/g, '').trim();
      // Format date/time: "08:45 PM — Dec 26" format
      // Try to extract time and date
      const timeDateMatch = cleanedCell.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[—–-]?\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})/i);
      if (timeDateMatch) {
        const time = timeDateMatch[1].trim();
        const date = timeDateMatch[2].trim();
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            {time} — {date}
          </span>
        );
      }
      return <span style={{ whiteSpace: 'nowrap' }}>{cleanedCell}</span>;
    }
    
    // Process Stops/Layover column to combine stops and layover info
    const stopsIndex = getColumnIndex(['stop', 'stops', 'layover']);
    if (cellIndex === stopsIndex) {
      const stopsCell = cell.toString();
      // Extract stop count and layover info
      const stopMatch = stopsCell.match(/(\d+)\s+stop/i);
      const layoverMatch = stopsCell.match(/\(([A-Z]{3})\s*([^)]+)\)/);
      
      if (stopMatch && layoverMatch) {
        const stopCount = stopMatch[1];
        const airport = layoverMatch[1];
        const duration = layoverMatch[2].trim();
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span>{stopCount} stop</span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{airport} ({duration})</span>
          </div>
        );
      }
      // If no layover info, just return the stops
      return stopsCell;
    }
    
    // Process Duration column - make it bold
    const durationIndex = getColumnIndex(['duration']);
    if (cellIndex === durationIndex) {
      return <span style={{ fontWeight: '600' }}>{cell}</span>;
    }
    
    // Process Price column - make it green
    const priceIndex = getColumnIndex(['price']);
    if (cellIndex === priceIndex) {
      return (
        <span style={{
          fontWeight: '600',
          color: '#059669'
        }}>
          {cell}
        </span>
      );
    }
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

// Hotel Card Component
function HotelCard({ hotel }) {
  const normalizeHotelName = (name) => {
    if (!name) return '';
    return name.toString()
      .replace(/\*\*/g, '') // Remove markdown bold
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' '); // Normalize spaces
  };

  const extractRating = (ratingStr) => {
    if (!ratingStr) return null;
    const match = ratingStr.toString().match(/(\d+\.?\d*)\/5/);
    return match ? parseFloat(match[1]) : null;
  };

  const extractPrice = (priceStr) => {
    if (!priceStr) return null;
    // Extract price number and format as "$XXX / night"
    const match = priceStr.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (match) {
      return `$${match[1].replace(/,/g, '')} / night`;
    }
    return null;
  };

  const extractDescription = (description) => {
    if (!description) return '';
    // Format to one professional sentence, remove bold markdown
    let desc = description.toString()
      .replace(/\*\*/g, '')
      .trim();
    // If multiple sentences, take first one
    const firstSentence = desc.split(/[.!?]/)[0];
    return firstSentence ? firstSentence + '.' : desc;
  };

  const extractBookingLinks = (bookingCell) => {
    if (!bookingCell) return [];
    const links = [];
    const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkPattern.exec(bookingCell.toString())) !== null) {
      const [, text, url] = match;
      const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `https://${url}`;
      links.push({ text, url: fullUrl });
    }
    return links;
  };

  const formatLocation = (location) => {
    if (!location) return '';
    // Standardize location: remove bold, use " · " separator
    let loc = location.toString()
      .replace(/\*\*/g, '')
      .trim();
    // Replace common separators with " · "
    loc = loc.replace(/\s*[|•·]\s*/g, ' · ');
    return loc;
  };

  const hotelName = (hotel.name || '').replace(/\*\*/g, '').trim();
  const rating = extractRating(hotel.rating);
  const price = extractPrice(hotel.price);
  const location = formatLocation(hotel.location);
  const description = extractDescription(hotel.description);
  const bookingLinks = extractBookingLinks(hotel.booking);

  return (
    <div style={{
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      padding: '14px',
      margin: '8px 0',
      backgroundColor: 'white',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'all 0.2s ease'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
    >
      {/* Header Row - Icons aligned horizontally */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
        flexWrap: 'wrap'
      }}>
        {/* Hotel Icon */}
        <span style={{ 
          fontSize: '16px', 
          lineHeight: '16px',
          display: 'inline-flex',
          alignItems: 'center'
        }}>🏨</span>
        
        {/* Hotel Name */}
        <span style={{
          fontWeight: '600',
          fontSize: '16px',
          color: '#004C8C',
          flex: 1,
          minWidth: '200px'
        }}>
          {hotelName}
        </span>
        
        {/* Rating */}
        {rating && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#f59e0b',
            lineHeight: '16px'
          }}>
            <span style={{ fontSize: '16px', lineHeight: '16px' }}>⭐</span>
            <span>{rating}/5</span>
          </span>
        )}
        
        {/* Price */}
        {price && (
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#059669',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            lineHeight: '16px'
          }}>
            <span style={{ fontSize: '16px', lineHeight: '16px' }}>💵</span>
            <span>{price}</span>
          </span>
        )}
        
        {/* Location */}
        {location && (
          <span style={{
            fontSize: '14px',
            fontWeight: '400',
            color: '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            lineHeight: '16px'
          }}>
            <span style={{ fontSize: '16px', lineHeight: '16px' }}>📍</span>
            <span>{location}</span>
          </span>
        )}
      </div>
      
      {/* Description */}
      {description && (
        <p style={{
          margin: '0 0 10px 0',
          fontSize: '14px',
          fontWeight: '400',
          color: '#64748b',
          lineHeight: '1.5'
        }}>
          {description}
        </p>
      )}
      
      {/* Booking Links - Outline buttons */}
      {bookingLinks.length > 0 && (
        <div style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginTop: '8px'
        }}>
          {bookingLinks.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#004C8C',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '12px',
                padding: '4px 10px',
                backgroundColor: 'transparent',
                border: '1px solid #004C8C',
                borderRadius: '6px',
                display: 'inline-block',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f0f9ff';
                e.target.style.borderColor = '#00ADEF';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.borderColor = '#004C8C';
              }}
            >
              {link.text}
            </a>
          ))}
        </div>
      )}
    </div>
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
  
  // Check if this is a hotel table (has "Hotel" in header and "Price" or "Rating")
  const isHotelTable = rows.length > 0 && rows[0] && (
    rows[0].some(cell => cell && cell.toString().toLowerCase().includes('hotel')) &&
    (rows[0].some(cell => cell && cell.toString().toLowerCase().includes('price')) ||
     rows[0].some(cell => cell && cell.toString().toLowerCase().includes('rating')))
  );
  
  // Check if this is a Return Flights table (only show buttons for Return Flights, not Outbound)
  const isReturnFlightsTable = messageContent.toLowerCase().includes('return flights') || 
                                messageContent.toLowerCase().includes('## return flights');
  
  // Check if this is an Outbound Flights table
  const isOutboundFlightsTable = isFlightTable && !isReturnFlightsTable && (
    messageContent.toLowerCase().includes('outbound flights') ||
    messageContent.toLowerCase().includes('## outbound flights')
  );
  
  // Check if this is an Activity table (has "Activity" in header and "Duration" or "Price")
  const isActivityTable = rows.length > 0 && rows[0] && (
    (rows[0].some(cell => cell && cell.toString().toLowerCase().includes('activity')) ||
     rows[0].some(cell => cell && cell.toString().toLowerCase().includes('name'))) &&
    (rows[0].some(cell => cell && cell.toString().toLowerCase().includes('duration')) ||
     rows[0].some(cell => cell && cell.toString().toLowerCase().includes('price')) ||
     rows[0].some(cell => cell && cell.toString().toLowerCase().includes('booking')))
  );
  
  // If it's an Activity table, render with improved UI
  if (isActivityTable && rows.length > 1) {
    return <ActivityTable rows={rows} tableIndex={tableIndex} messageContent={messageContent} key={uniqueKey} />;
  }
  
  // Activity table component
  function ActivityTable({ rows, tableIndex, messageContent }) {
    const [selectedActivities, setSelectedActivities] = useState(new Set());
    
    const headerRow = rows[0];
    const getColumnIndex = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const nameIndex = getColumnIndex(['activity', 'name']);
    const descriptionIndex = getColumnIndex(['description', 'desc']);
    const durationIndex = getColumnIndex(['duration']);
    const priceIndex = getColumnIndex(['price']);
    const bookingIndex = getColumnIndex(['booking', 'book']);
    const typeIndex = getColumnIndex(['type', 'category']);
    
    // Extract activities from rows
    const activities = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const name = nameIndex >= 0 ? row[nameIndex] : '';
      if (!name) continue;
      
      // Remove markdown formatting from name
      const cleanName = name.toString().replace(/\*\*/g, '').trim();
      
      // Extract activity type from name or description
      let activityType = '';
      if (typeIndex >= 0 && row[typeIndex]) {
        activityType = row[typeIndex].toString().trim();
      } else {
        // Try to infer from name/description
        const nameLower = cleanName.toLowerCase();
        const desc = descriptionIndex >= 0 ? row[descriptionIndex]?.toString().toLowerCase() || '' : '';
        if (nameLower.includes('tour') || desc.includes('tour')) {
          activityType = 'Guided tour';
        } else if (nameLower.includes('cooking') || desc.includes('cooking')) {
          activityType = 'Cooking class';
        } else if (nameLower.includes('bike') || desc.includes('bike')) {
          activityType = 'Bike tour';
        } else if (nameLower.includes('walking') || desc.includes('walking')) {
          activityType = 'Walking tour';
        } else if (nameLower.includes('museum') || desc.includes('museum')) {
          activityType = 'Museum visit';
        } else if (nameLower.includes('food') || desc.includes('food')) {
          activityType = 'Food experience';
        }
      }
      
      // Format description - limit to 2 lines
      let description = '';
      if (descriptionIndex >= 0 && row[descriptionIndex]) {
        description = row[descriptionIndex].toString().trim();
        // Remove markdown
        description = description.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        // Limit to ~120 characters (approximately 2 lines)
        if (description.length > 120) {
          description = description.substring(0, 120).trim() + '...';
        }
      }
      
      // Format duration - unify to "X h" or "X h Y m" format
      let duration = '';
      if (durationIndex >= 0 && row[durationIndex]) {
        const durStr = row[durationIndex].toString().trim();
        // Parse various formats: "1.5 hours", "2 hours", "3h", "2h 30m", etc.
        const hourMatch = durStr.match(/(\d+\.?\d*)\s*h/i);
        const minMatch = durStr.match(/(\d+)\s*m/i);
        if (hourMatch || minMatch) {
          const hours = hourMatch ? parseFloat(hourMatch[1]) : 0;
          const mins = minMatch ? parseInt(minMatch[1]) : 0;
          if (hours > 0 && mins > 0) {
            duration = `${hours} h ${mins} m`;
          } else if (hours > 0) {
            duration = `${hours} h`;
          } else if (mins > 0) {
            duration = `${mins} m`;
          }
        } else {
          duration = durStr;
        }
      }
      
      // Format price - extract currency and amount
      let price = '';
      let currency = 'USD';
      if (priceIndex >= 0 && row[priceIndex]) {
        const priceStr = row[priceIndex].toString().trim();
        // Extract currency and amount
        const usdMatch = priceStr.match(/\$?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        const eurMatch = priceStr.match(/€?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        if (usdMatch) {
          price = usdMatch[1].replace(/,/g, '');
          currency = 'USD';
        } else if (eurMatch) {
          price = eurMatch[1].replace(/,/g, '');
          currency = 'EUR';
        } else {
          price = priceStr;
        }
      }
      
      // Extract booking links
      const bookingLinks = [];
      if (bookingIndex >= 0 && row[bookingIndex]) {
        const bookingCell = row[bookingIndex].toString();
        const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;
        while ((match = linkPattern.exec(bookingCell)) !== null) {
          const [, text, url] = match;
          const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
            ? url 
            : `https://${url}`;
          
          // Detect provider from URL
          let provider = '';
          if (fullUrl.includes('getyourguide')) {
            provider = 'GetYourGuide';
          } else if (fullUrl.includes('viator')) {
            provider = 'Viator';
          } else if (fullUrl.includes('booking.com')) {
            provider = 'Booking.com';
          }
          
          bookingLinks.push({ text, url: fullUrl, provider });
        }
      }
      
      activities.push({
        name: cleanName,
        type: activityType,
        description,
        duration,
        price,
        currency,
        bookingLinks
      });
    }
    
    // Extract city name from message content
    const cityMatch = messageContent.match(/in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    const cityName = cityMatch ? cityMatch[1] : 'Barcelona';
    
    return (
      <div style={{ margin: '16px 0', padding: '0 24px' }}>
        {/* Header with subheader */}
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ 
            fontSize: '20px', 
            fontWeight: '700', 
            margin: '0 0 4px 0', 
            color: '#004C8C' 
          }}>
            Top Activities in {cityName}
          </h2>
          <p style={{ 
            fontSize: '13px', 
            color: '#64748b', 
            margin: '0',
            fontStyle: 'italic'
          }}>
            Based on your dates and general preferences.
          </p>
        </div>
        
        {/* Instructions */}
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          backgroundColor: '#f0f9ff',
          border: '1px solid #bae6fd',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#004C8C'
        }}>
          Click an activity name or "Book tour" to add it to your itinerary.
        </div>
        
        {/* Activity Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'white'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '16px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Activity
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Duration
                </th>
                <th style={{ padding: '16px', textAlign: 'right', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Price
                </th>
                <th style={{ padding: '16px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Booking
                </th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity, idx) => {
                const isSelected = selectedActivities.has(idx);
                
                return (
                  <tr 
                    key={idx} 
                    onClick={() => {
                      const newSelected = new Set(selectedActivities);
                      if (isSelected) {
                        newSelected.delete(idx);
                      } else {
                        newSelected.add(idx);
                      }
                      setSelectedActivities(newSelected);
                    }}
                    style={{ 
                      backgroundColor: isSelected ? '#E6F7FF' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                      borderBottom: idx < activities.length - 1 ? '1px solid #e2e8f0' : 'none',
                      borderLeft: isSelected ? '4px solid #00ADEF' : '4px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#f0f9ff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
                      }
                    }}
                  >
                    {/* Activity Name + Type + Description */}
                    <td style={{ padding: '16px', textAlign: 'left', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        {isSelected && (
                          <span style={{ 
                            color: '#00ADEF', 
                            fontSize: '18px',
                            marginTop: '2px',
                            fontWeight: 'bold'
                          }}>✓</span>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <div style={{ 
                              fontWeight: '600', 
                              fontSize: '15px',
                              color: '#004C8C',
                              lineHeight: '1.4'
                            }}>
                              {activity.name}
                            </div>
                            {isSelected && (
                              <span style={{
                                display: 'inline-block',
                                fontSize: '10px',
                                fontWeight: '600',
                                color: '#00ADEF',
                                backgroundColor: '#E6F7FF',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                border: '1px solid #00ADEF'
                              }}>
                                ✓ Added to itinerary
                              </span>
                            )}
                          </div>
                          {activity.type && (
                            <div style={{ marginBottom: '8px' }}>
                              <span style={{
                                display: 'inline-block',
                                fontSize: '11px',
                                fontWeight: '500',
                                color: '#64748b',
                                backgroundColor: '#f1f5f9',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                marginRight: '6px'
                              }}>
                                {activity.type}
                              </span>
                            </div>
                          )}
                          {activity.description && (
                            <div style={{ 
                              fontSize: '13px', 
                              color: '#64748b',
                              lineHeight: '1.5',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxHeight: '2.6em'
                            }}>
                              {activity.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    {/* Duration */}
                    <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {activity.duration ? (
                        <span style={{ fontSize: '14px', color: '#64748b' }}>
                          {activity.duration}
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    
                    {/* Price */}
                    <td style={{ padding: '16px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {activity.price ? (
                        <span style={{ 
                          fontSize: '15px', 
                          fontWeight: '600',
                          color: '#059669'
                        }}>
                          {activity.currency} {activity.price}
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    
                    {/* Booking */}
                    <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {activity.bookingLinks.length > 0 ? (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                          {activity.bookingLinks.map((link, linkIdx) => {
                            const buttonText = link.provider 
                              ? `Book on ${link.provider}`
                              : link.text.includes('Book') 
                                ? link.text 
                                : `Book ${activity.name.length > 20 ? 'tour' : activity.name}`;
                            
                            return (
                              <a
                                key={linkIdx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  color: '#ffffff',
                                  textDecoration: 'none',
                                  fontWeight: '600',
                                  fontSize: '12px',
                                  padding: '8px 16px',
                                  backgroundColor: '#00ADEF',
                                  borderRadius: '6px',
                                  display: 'inline-block',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(0, 173, 239, 0.3)',
                                  whiteSpace: 'nowrap'
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
                                {buttonText}
                              </a>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Footer text */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          fontSize: '14px',
          color: '#64748b',
          lineHeight: '1.6',
          textAlign: 'left'
        }}>
          <p style={{ margin: '0 0 8px 0' }}>
            These activities are popular and can really enhance your time in Barcelona.
          </p>
          <p style={{ margin: '0' }}>
            Tell me which ones you like, and I'll add them to your itinerary or find more options.
          </p>
        </div>
      </div>
    );
  }
  
  // If it's a hotel table, render as cards (Option A - preferred) or improved table (Option B)
  if (isHotelTable && rows.length > 1) {
    const headerRow = rows[0];
    const getColumnIndex = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const nameIndex = getColumnIndex(['hotel', 'name']);
    const priceIndex = getColumnIndex(['price']);
    const ratingIndex = getColumnIndex(['rating']);
    const locationIndex = getColumnIndex(['location']);
    const bookingIndex = getColumnIndex(['booking', 'book']);
    const descriptionIndex = getColumnIndex(['description', 'desc']);
    
    // Extract hotels from rows
    const hotels = [];
    const seenNames = new Set();
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      
      const name = nameIndex >= 0 ? row[nameIndex] : null;
      if (!name) continue;
      
      // Normalize hotel name to check for duplicates
      const normalizedName = name.toString()
        .replace(/\*\*/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
      
      if (seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);
      
      hotels.push({
        name: nameIndex >= 0 ? row[nameIndex] : '',
        price: priceIndex >= 0 ? row[priceIndex] : '',
        rating: ratingIndex >= 0 ? row[ratingIndex] : '',
        location: locationIndex >= 0 ? row[locationIndex] : '',
        booking: bookingIndex >= 0 ? row[bookingIndex] : '',
        description: descriptionIndex >= 0 ? row[descriptionIndex] : ''
      });
    }
    
    // Sort hotels: rating (desc), price (asc), then by name
    hotels.sort((a, b) => {
      const ratingA = parseFloat(a.rating?.toString().match(/(\d+\.?\d*)/)?.[1] || '0');
      const ratingB = parseFloat(b.rating?.toString().match(/(\d+\.?\d*)/)?.[1] || '0');
      if (ratingB !== ratingA) return ratingB - ratingA;
      
      const priceA = parseFloat(a.price?.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/)?.[1]?.replace(/,/g, '') || '999999');
      const priceB = parseFloat(b.price?.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/)?.[1]?.replace(/,/g, '') || '999999');
      if (priceA !== priceB) return priceA - priceB;
      
      return (a.name || '').localeCompare(b.name || '');
    });
    
    // Option A: Render as cards (preferred)
    // Check if message suggests table view (e.g., "Top Recommendations" table)
    const useTableView = messageContent.toLowerCase().includes('top recommendations') && 
                         messageContent.toLowerCase().includes('table');
    
    if (useTableView) {
      // Option B: Render as improved table with icons
      return (
        <div key={uniqueKey} style={{ margin: '12px 0', overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  🏨 Hotel
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  ⭐ Rating
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  💵 Price
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  📍 Location
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Booking
                </th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((hotel, idx) => {
                const hotelName = (hotel.name || '').replace(/\*\*/g, '').trim();
                const rating = hotel.rating ? hotel.rating.toString().match(/(\d+\.?\d*)\/5/)?.[0] : null;
                const price = hotel.price ? (() => {
                  const match = hotel.price.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
                  return match ? `$${match[1].replace(/,/g, '')} / night` : null;
                })() : null;
                const location = hotel.location ? (() => {
                  let loc = hotel.location.toString().replace(/\*\*/g, '').trim();
                  return loc.replace(/\s*[|•·]\s*/g, ' · ');
                })() : '';
                const bookingLinks = (() => {
                  if (!hotel.booking) return [];
                  const links = [];
                  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
                  let match;
                  while ((match = linkPattern.exec(hotel.booking.toString())) !== null) {
                    const [, text, url] = match;
                    const fullUrl = url.startsWith('http://') || url.startsWith('https://') 
                      ? url 
                      : `https://${url}`;
                    links.push({ text, url: fullUrl });
                  }
                  return links;
                })();
                
                return (
                  <tr key={idx} style={{ 
                    backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                    borderBottom: idx < hotels.length - 1 ? '1px solid #e2e8f0' : 'none'
                  }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#004C8C' }}>
                      {hotelName}
                    </td>
                    <td style={{ padding: '12px', fontWeight: '500', color: '#f59e0b' }}>
                      {rating || '—'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: '500', color: '#059669' }}>
                      {price || '—'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: '400', color: '#64748b' }}>
                      {location || '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {bookingLinks.map((link, linkIdx) => (
                          <a
                            key={linkIdx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: '#004C8C',
                              textDecoration: 'none',
                              fontWeight: '500',
                              fontSize: '12px',
                              padding: '4px 10px',
                              backgroundColor: 'transparent',
                              border: '1px solid #004C8C',
                              borderRadius: '6px',
                              display: 'inline-block',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#f0f9ff';
                              e.target.style.borderColor = '#00ADEF';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'transparent';
                              e.target.style.borderColor = '#004C8C';
                            }}
                          >
                            {link.text}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
    
    // Default: Render as cards (Option A - preferred)
    return (
      <div key={uniqueKey} style={{ margin: '8px 0' }}>
        {hotels.map((hotel, idx) => (
          <HotelCard key={idx} hotel={hotel} />
        ))}
      </div>
    );
  }

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
    
    // Try to extract date from table's Departure column first
    if (rows.length > 1) {
      const departureColIndex = getColumnIndex(['departure']);
      if (departureColIndex >= 0 && rows[1] && rows[1][departureColIndex]) {
        const departureCell = rows[1][departureColIndex].toString();
        // Extract date from departure cell - handle "27 Nov 2025, 10:30" format
        // Pattern 1: "27 Nov 2025" or "27 Nov 2025, 10:30"
        const dateMatch = departureCell.match(/(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4})/i);
        if (dateMatch) {
          const extractedDate = dateMatch[1];
          if (isReturnFlightsTable) {
            returnDate = extractedDate;
          } else {
            departureDate = extractedDate;
          }
        } else {
          // Pattern 2: Try "Nov 27" or "Nov 27, 2025" format
          const monthDayMatch = departureCell.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s+(\d{1,2})/i);
          if (monthDayMatch) {
            const extractedDate = monthDayMatch[0];
            if (isReturnFlightsTable) {
              if (!returnDate) returnDate = extractedDate;
            } else {
              if (!departureDate) departureDate = extractedDate;
            }
          } else {
            // Pattern 3: Try other date patterns
            datePatterns.forEach(pattern => {
              const matches = departureCell.match(pattern);
              if (matches && matches.length > 0) {
                const extractedDate = matches[0];
                if (isReturnFlightsTable) {
                  if (!returnDate) returnDate = extractedDate;
                } else {
                  if (!departureDate) departureDate = extractedDate;
                }
              }
            });
          }
        }
      }
    }
    
    // For Return Flights, also check other rows in the table for date
    if (isReturnFlightsTable && !returnDate && rows.length > 1) {
      const departureColIndex = getColumnIndex(['departure']);
      if (departureColIndex >= 0) {
        // Check first few data rows (skip header row)
        for (let i = 1; i < Math.min(rows.length, 4); i++) {
          if (rows[i] && rows[i][departureColIndex]) {
            const cell = rows[i][departureColIndex].toString();
            // Try to extract "27 Nov 2025" format
            const dateMatch = cell.match(/(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4})/i);
            if (dateMatch) {
              returnDate = dateMatch[1];
              break;
            }
            // Try "Nov 27" format
            const monthDayMatch = cell.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s+(\d{1,2})/i);
            if (monthDayMatch) {
              returnDate = monthDayMatch[0];
              break;
            }
          }
        }
      }
    }
    
    // Extract all dates from message
    const dateMatches = [];
    datePatterns.forEach(pattern => {
      const matches = messageContent.match(pattern);
      if (matches) {
        dateMatches.push(...matches);
      }
    });
    
    if (dateMatches.length > 0) {
      if (isReturnFlightsTable) {
        // For Return Flights, ONLY find date in the "Return Flights" section
        // Do NOT use dates from Outbound Flights section
        const returnFlightsIndex = messageContent.toLowerCase().indexOf('return flights');
        if (returnFlightsIndex >= 0) {
          // Get section from "Return Flights" to end of message (or next section)
          const returnSection = messageContent.substring(returnFlightsIndex);
          const returnSectionDates = [];
          datePatterns.forEach(pattern => {
            const matches = returnSection.match(pattern);
            if (matches) {
              returnSectionDates.push(...matches);
            }
          });
          // Use first date found in Return Flights section
          if (returnSectionDates.length > 0 && !returnDate) {
            returnDate = returnSectionDates[0];
          }
        }
        
        // If still no returnDate, try to use second date from entire message (but not first date)
        if (!returnDate) {
          if (dateMatches.length > 1) {
            returnDate = dateMatches[1]; // Use second date as return date
          }
          // Don't use first date as fallback for return flights - it's the departure date
        }
        
        // Clear departureDate for Return Flights table - we don't want to show it
        departureDate = null;
      } else {
        // For Outbound Flights, ONLY find date in the "Outbound Flights" section
        // Do NOT use dates from Return Flights section
        const outboundFlightsIndex = messageContent.toLowerCase().indexOf('outbound flights');
        if (outboundFlightsIndex >= 0) {
          // Get the section from "Outbound Flights" to "Return Flights" (or end of message)
          const returnFlightsIndex = messageContent.toLowerCase().indexOf('return flights');
          const endIndex = returnFlightsIndex >= 0 ? returnFlightsIndex : messageContent.length;
          const outboundSection = messageContent.substring(outboundFlightsIndex, endIndex);
          const outboundSectionDates = [];
          datePatterns.forEach(pattern => {
            const matches = outboundSection.match(pattern);
            if (matches) {
              outboundSectionDates.push(...matches);
            }
          });
          // Use first date found in Outbound Flights section
          if (outboundSectionDates.length > 0) {
            departureDate = outboundSectionDates[0];
          }
        } else {
          // Fallback: use the first date from entire message
          departureDate = dateMatches[0];
        }
        
        // Clear returnDate for Outbound Flights table - we don't want to show it
        returnDate = null;
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
    
    // Use returnDate for Return Flights table, departureDate for Outbound Flights table
    // Ensure we have the correct date for each table type
    let dateToDisplay = null;
    if (isReturnFlightsTable) {
      // For Return Flights, use returnDate
      dateToDisplay = returnDate;
      // If returnDate is not found, try to extract from message one more time
      if (!dateToDisplay) {
        const returnFlightsIndex = messageContent.toLowerCase().indexOf('return flights');
        if (returnFlightsIndex >= 0) {
          const returnSection = messageContent.substring(returnFlightsIndex);
          const returnSectionDates = [];
          datePatterns.forEach(pattern => {
            const matches = returnSection.match(pattern);
            if (matches) {
              returnSectionDates.push(...matches);
            }
          });
          if (returnSectionDates.length > 0) {
            dateToDisplay = returnSectionDates[0];
          }
        }
      }
    } else {
      // For Outbound Flights, use departureDate
      dateToDisplay = departureDate;
      // If departureDate is not found, try to extract from message one more time
      if (!dateToDisplay) {
        const outboundFlightsIndex = messageContent.toLowerCase().indexOf('outbound flights');
        if (outboundFlightsIndex >= 0) {
          const returnFlightsIndex = messageContent.toLowerCase().indexOf('return flights');
          const endIndex = returnFlightsIndex >= 0 ? returnFlightsIndex : messageContent.length;
          const outboundSection = messageContent.substring(outboundFlightsIndex, endIndex);
          const outboundSectionDates = [];
          datePatterns.forEach(pattern => {
            const matches = outboundSection.match(pattern);
            if (matches) {
              outboundSectionDates.push(...matches);
            }
          });
          if (outboundSectionDates.length > 0) {
            dateToDisplay = outboundSectionDates[0];
          }
        }
      }
    }
    
    // Format date for display (convert to "Nov 20" format if needed)
    if (dateToDisplay) {
      // Handle "27 Nov 2025" format - convert to "Nov 27"
      const dayMonthYearMatch = dateToDisplay.match(/(\d{1,2})\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s+\d{4}/i);
      if (dayMonthYearMatch) {
        const day = dayMonthYearMatch[1];
        const month = dayMonthYearMatch[2].charAt(0).toUpperCase() + dayMonthYearMatch[2].slice(1).toLowerCase();
        dateToDisplay = `${month} ${day}`;
      } else {
        // Try format: "Nov 20" or "Nov 20, 2025"
        let monthDayMatch = dateToDisplay.match(/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\s+(\d{1,2})/i);
        if (monthDayMatch) {
          const month = monthDayMatch[1].charAt(0).toUpperCase() + monthDayMatch[1].slice(1).toLowerCase();
          const day = monthDayMatch[2];
          dateToDisplay = `${month} ${day}`;
        } else {
          // Try reverse format: "20 Nov" or "20 Nov 2025"
          const reverseMatch = dateToDisplay.match(/(\d{1,2})\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i);
          if (reverseMatch) {
            const day = reverseMatch[1];
            const month = reverseMatch[2].charAt(0).toUpperCase() + reverseMatch[2].slice(1).toLowerCase();
            dateToDisplay = `${month} ${day}`;
          }
        }
      }
      parts.push(dateToDisplay);
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
  
  // Special rendering for Outbound Flights table with new design rules
  if (isFlightTable && isOutboundFlightsTable && rows.length > 1) {
    const headerRow = rows[0];
    const getColumnIndexForOutbound = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const airlineIndex = getColumnIndexForOutbound(['airline']);
    const flightCodeIndex = getColumnIndexForOutbound(['flight code', 'flight']);
    const priceIndex = getColumnIndexForOutbound(['price']);
    const durationIndex = getColumnIndexForOutbound(['duration']);
    const stopsIndex = getColumnIndexForOutbound(['stop', 'stops', 'layover']);
    const departureIndex = getColumnIndexForOutbound(['departure']);
    const arrivalIndex = getColumnIndexForOutbound(['arrival']);
    const originIndex = getColumnIndexForOutbound(['origin']);
    const destIndex = getColumnIndexForOutbound(['destination']);
    
    // Format price: $1,590.79 (bold, green)
    const formatPrice = (priceStr) => {
      if (!priceStr) return '—';
      const match = priceStr.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (match) {
        const num = match[1].replace(/,/g, '');
        const formatted = parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `$${formatted}`;
      }
      return priceStr;
    };
    
    // Format duration: ⏱️ 21h 0m
    const formatDuration = (durationStr) => {
      if (!durationStr) return '—';
      const cleaned = durationStr.toString().replace(/⏱️\s*/g, '').trim();
      return `⏱️ ${cleaned}`;
    };
    
    // Format stops/layover: "1 stop • via AMS (2h 30m)" format
    const formatStops = (stopsStr) => {
      if (!stopsStr) return { stopText: 'Non-stop', layoverCodes: [], layoverTimes: [] };
      const cleaned = stopsStr.toString().trim();
      const stopMatch = cleaned.match(/(\d+)\s+stop/i);
      
      // Extract layover airport codes and times - try multiple patterns
      const layoverCodes = [];
      const layoverTimes = [];
      
      // Pattern 1: (AMS 8h 15m) or (AMS 2h 30m) - extract both code and time
      const layoverPattern1 = /\(([A-Z]{3})\s+(\d+h(?:\s+\d+m)?|\d+m)\)/g;
      let match;
      while ((match = layoverPattern1.exec(cleaned)) !== null) {
        layoverCodes.push(match[1]);
        layoverTimes.push(match[2]);
      }
      
      // Pattern 2: (AMS) without time - extract code only
      if (layoverCodes.length === 0) {
        const layoverPattern2 = /\(([A-Z]{3})\)/g;
        while ((match = layoverPattern2.exec(cleaned)) !== null) {
          layoverCodes.push(match[1]);
          layoverTimes.push(null); // No time info
        }
      }
      
      // Pattern 3: via AMS or AMS, CDG (standalone codes)
      if (layoverCodes.length === 0) {
        const viaPattern = /via\s+([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)/i;
        const viaMatch = cleaned.match(viaPattern);
        if (viaMatch) {
          const codes = viaMatch[1].split(',').map(c => c.trim());
          layoverCodes.push(...codes);
          codes.forEach(() => layoverTimes.push(null)); // No time info
        }
      }
      
      // Pattern 4: Just airport codes in the text (AMS, CDG)
      if (layoverCodes.length === 0) {
        const codePattern = /\b([A-Z]{3})\b/g;
        const codes = [];
        while ((match = codePattern.exec(cleaned)) !== null) {
          const code = match[1];
          // Skip common non-airport codes
          if (!['NON', 'STOP', 'STOPS'].includes(code)) {
            codes.push(code);
          }
        }
        // Only use if we have 1-3 codes (likely airport codes)
        if (codes.length >= 1 && codes.length <= 3) {
          layoverCodes.push(...codes);
          codes.forEach(() => layoverTimes.push(null)); // No time info
        }
      }
      
      let stopText = 'Non-stop';
      if (stopMatch) {
        const count = parseInt(stopMatch[1]);
        stopText = count === 0 ? 'Non-stop' : `${count} stop${count > 1 ? 's' : ''}`;
      } else if (!cleaned.toLowerCase().includes('non-stop') && !cleaned.toLowerCase().includes('nonstop')) {
        // If no explicit stop count but we found layover codes, infer stop count
        if (layoverCodes.length > 0) {
          stopText = `${layoverCodes.length} stop${layoverCodes.length > 1 ? 's' : ''}`;
        } else {
          stopText = cleaned;
        }
      }
      
      return { stopText, layoverCodes, layoverTimes };
    };
    
    // Format date/time: "20 Dec 2025, 06:00 AM"
    const formatDateTime = (dateTimeStr) => {
      if (!dateTimeStr) return '—';
      let cleaned = dateTimeStr.toString().trim();
      // Remove layover info in parentheses
      cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
      
      // Try to parse various formats
      // Format: "20 Dec 2025, 06:00 AM" or "Dec 20, 2025 06:00 AM"
      const patterns = [
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4}),?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4}),?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
      ];
      
      for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
          let day, month, year, time;
          if (match[1].match(/^\d+$/)) {
            // First pattern: "20 Dec 2025"
            day = match[1];
            month = match[2];
            year = match[3];
            time = match[4];
          } else {
            // Second pattern: "Dec 20, 2025"
            month = match[1];
            day = match[2];
            year = match[3];
            time = match[4];
          }
          const monthAbbr = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
          return `${day} ${monthAbbr} ${year}, ${time}`;
        }
      }
      
      return cleaned;
    };
    
    // Extract route and date information from message for description
    const extractRouteInfo = () => {
      let origin = null;
      let destination = null;
      let departureDate = null;
      let returnDate = null;
      
      // Try to extract from message content
      const originMatch = messageContent.match(/from\s+([^to]+?)\s+to/i);
      const destMatch = messageContent.match(/to\s+([^\n(]+?)(?:\s*\(|\s*on|\s*$)/i);
      
      if (originMatch) origin = originMatch[1].trim();
      if (destMatch) destination = destMatch[1].trim();
      
      // Extract dates
      const datePatterns = [
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi,
        /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/gi,
        /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/gi,
        /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/gi
      ];
      
      const dates = [];
      datePatterns.forEach(pattern => {
        const matches = messageContent.match(pattern);
        if (matches) dates.push(...matches);
      });
      
      if (dates.length > 0) {
        departureDate = dates[0];
        if (dates.length > 1) returnDate = dates[1];
      }
      
      return { origin, destination, departureDate, returnDate };
    };
    
    const routeInfo = extractRouteInfo();
    const formatDateForDescription = (dateStr) => {
      if (!dateStr) return '';
      // Convert "January 6th, 2026" to "Jan 6, 2026" or "Dec 20, 2025"
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                         'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbrevs = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      for (let i = 0; i < monthNames.length; i++) {
        const pattern = new RegExp(monthNames[i] + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})', 'i');
        const match = dateStr.match(pattern);
        if (match) {
          return `${monthAbbrevs[i]} ${match[1]}, ${match[2]}`;
        }
      }
      
      // Try abbreviated months
      for (let i = 0; i < monthAbbrevs.length; i++) {
        const pattern = new RegExp(monthAbbrevs[i] + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})', 'i');
        const match = dateStr.match(pattern);
        if (match) {
          return `${monthAbbrevs[i]} ${match[1]}, ${match[2]}`;
        }
      }
      
      return dateStr;
    };
    
    // Get first flight data for summary chip (selected flight)
    const firstFlightRow = rows[1];
    const firstAirline = airlineIndex >= 0 && firstFlightRow[airlineIndex] ? firstFlightRow[airlineIndex].toString().trim() : '';
    const firstFlightCode = flightCodeIndex >= 0 && firstFlightRow[flightCodeIndex] ? firstFlightRow[flightCodeIndex].toString().trim() : '';
    const firstPrice = priceIndex >= 0 && firstFlightRow[priceIndex] ? formatPrice(firstFlightRow[priceIndex]) : '';
    const firstStops = stopsIndex >= 0 && firstFlightRow[stopsIndex] ? formatStops(firstFlightRow[stopsIndex]) : { stopText: 'Non-stop', layoverCodes: [] };
    const firstOrigin = originIndex >= 0 && firstFlightRow[originIndex] ? firstFlightRow[originIndex].toString().trim() : '';
    const firstDest = destIndex >= 0 && firstFlightRow[destIndex] ? firstFlightRow[destIndex].toString().trim() : '';
    const firstDeparture = departureIndex >= 0 && firstFlightRow[departureIndex] ? formatDateTime(firstFlightRow[departureIndex]) : '';
    const firstDate = firstDeparture.match(/(\d{1,2}\s+\w+\s+\d{4})/)?.[1] || '';
    
    // Generate description text
    const originDisplay = routeInfo.origin || firstOrigin || 'origin';
    const destDisplay = routeInfo.destination || firstDest || 'destination';
    const depDateDisplay = routeInfo.departureDate ? formatDateForDescription(routeInfo.departureDate) : '';
    const retDateDisplay = routeInfo.returnDate ? formatDateForDescription(routeInfo.returnDate) : '';
    const dateRangeDisplay = depDateDisplay && retDateDisplay 
      ? `${depDateDisplay}–${retDateDisplay}` 
      : depDateDisplay || '';
    
    return (
      <div key={uniqueKey} style={{ marginBottom: '24px' }}>
        {/* FlightTableComparison component for modal management */}
        <FlightTableComparison rows={rows} messageContent={messageContent} tableIndex={tableIndex} />
        
        {/* Description text above table */}
        <div style={{ 
          marginBottom: '12px',
          fontSize: '14px',
          color: '#64748b',
          lineHeight: '1.5'
        }}>
          Here are round-trip flight options from <strong style={{ color: '#1e293b' }}>{originDisplay}</strong> to <strong style={{ color: '#1e293b' }}>{destDisplay}</strong>
          {dateRangeDisplay && <span> (<strong style={{ color: '#1e293b' }}>{dateRangeDisplay}</strong>)</span>}.
          You can compare duration, layovers, and price side by side.
        </div>
        
        {/* Section Title */}
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '700', 
          margin: '8px 0 12px 0', 
          color: '#004C8C' 
        }}>
          Outbound Flights
        </h2>
        
        <div style={{ margin: '8px 0', overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Price
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Duration
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Stops/Layover
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Departure
                </th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Arrival
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0', width: '90px' }}>
                  Compare
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, rowIndex) => {
                const airline = airlineIndex >= 0 && row[airlineIndex] ? row[airlineIndex].toString().trim() : '';
                const flightCode = flightCodeIndex >= 0 && row[flightCodeIndex] ? row[flightCodeIndex].toString().trim() : '';
                const price = priceIndex >= 0 && row[priceIndex] ? formatPrice(row[priceIndex]) : '—';
                const duration = durationIndex >= 0 && row[durationIndex] ? formatDuration(row[durationIndex]) : '—';
                const stops = stopsIndex >= 0 && row[stopsIndex] ? formatStops(row[stopsIndex]) : { stopText: 'Non-stop', layoverCodes: [] };
                const departure = departureIndex >= 0 && row[departureIndex] ? formatDateTime(row[departureIndex]) : '—';
                const arrival = arrivalIndex >= 0 && row[arrivalIndex] ? formatDateTime(row[arrivalIndex]) : '—';
                
                // Check if this is the selected flight (first row = selected by default)
                const isSelected = rowIndex === 0;
                
                return (
                  <tr key={`${uniqueKey}-row-${rowIndex + 1}`} style={{ 
                    backgroundColor: isSelected ? '#E6F7FF' : (rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'),
                    borderLeft: isSelected ? '4px solid #00ADEF' : 'none',
                    borderBottom: rowIndex < rows.length - 2 ? '1px solid #e2e8f0' : 'none',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = '#f0f9ff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                    } else {
                      e.currentTarget.style.backgroundColor = '#E6F7FF';
                    }
                  }}
                  >
                    {/* Price */}
                    <td style={{ padding: '12px', verticalAlign: 'top' }}>
                      <div style={{ marginBottom: '4px', fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                        <strong>{airline}</strong>
                        <br />
                        <span style={{ fontFamily: 'monospace' }}>{flightCode}</span>
                      </div>
                      <div style={{ 
                        fontWeight: '700', 
                        color: '#059669',
                        fontSize: '15px'
                      }}>
                        {price}
                      </div>
                    </td>
                    
                    {/* Duration */}
                    <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top' }}>
                      <div style={{ 
                        fontWeight: '500',
                        color: '#1e293b'
                      }}>
                        {duration}
                      </div>
                    </td>
                    
                    {/* Stops/Layover */}
                    <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top' }}>
                      {stops.layoverCodes.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            display: 'inline-block'
                          }}>
                            {stops.stopText}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>
                            via {stops.layoverCodes.map((code, idx) => {
                              const time = stops.layoverTimes && stops.layoverTimes[idx];
                              return time ? `${code} (${time})` : code;
                            }).join(', ')}
                          </span>
                        </div>
                      ) : (
                        <span style={{
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}>
                          {stops.stopText}
                        </span>
                      )}
                    </td>
                    
                    {/* Departure */}
                    <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {departure}
                    </td>
                    
                    {/* Arrival */}
                    <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {arrival}
                    </td>
                    
                    {/* Compare */}
                    <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top', width: '90px' }}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const event = new CustomEvent('compareFlight', {
                            detail: { rowIndex: rowIndex + 1, tableIndex }
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
                          whiteSpace: 'nowrap',
                          width: '90px'
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Summary Chip */}
        {firstAirline && firstFlightCode && (
          <div style={{
            marginTop: '16px',
            padding: '10px 16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #00ADEF',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#004C8C',
            display: 'inline-block'
          }}>
            ✈️ {firstOrigin || 'IAD'} → {firstDest || 'BCN'} | {firstDate || '20 Dec'} | {firstPrice || '$1,590.79'} | {firstStops.stopText}{firstStops.layoverCodes.length > 0 ? ` • via ${firstStops.layoverCodes.map((code, idx) => {
              const time = firstStops.layoverTimes && firstStops.layoverTimes[idx];
              return time ? `${code} (${time})` : code;
            }).join(', ')}` : ''}
          </div>
        )}
      </div>
    );
  }
  
  // Special rendering for Return Flights table with new design rules
  if (isFlightTable && isReturnFlightsTable && rows.length > 1) {
    const headerRow = rows[0];
    const getColumnIndexForReturn = (keywords) => {
      for (let i = 0; i < headerRow.length; i++) {
        const header = headerRow[i]?.toString().toLowerCase().trim() || '';
        if (keywords.some(keyword => header.includes(keyword))) {
          return i;
        }
      }
      return -1;
    };
    
    const airlineIndex = getColumnIndexForReturn(['airline']);
    const flightCodeIndex = getColumnIndexForReturn(['flight code', 'flight']);
    const priceIndex = getColumnIndexForReturn(['price']);
    const durationIndex = getColumnIndexForReturn(['duration']);
    const stopsIndex = getColumnIndexForReturn(['stop', 'stops', 'layover']);
    const departureIndex = getColumnIndexForReturn(['departure']);
    const arrivalIndex = getColumnIndexForReturn(['arrival']);
    const originIndex = getColumnIndexForReturn(['origin']);
    const destIndex = getColumnIndexForReturn(['destination']);
    
    // Format price: $1,590.79 (bold, green)
    const formatPrice = (priceStr) => {
      if (!priceStr) return '—';
      const match = priceStr.toString().match(/\$?(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (match) {
        const num = match[1].replace(/,/g, '');
        const formatted = parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `$${formatted}`;
      }
      return priceStr;
    };
    
    // Format duration: ⏱️ 24h 10m
    const formatDuration = (durationStr) => {
      if (!durationStr) return '—';
      const cleaned = durationStr.toString().replace(/⏱️\s*/g, '').trim();
      return `⏱️ ${cleaned}`;
    };
    
    // Format stops/layover: "1 stop • via AMS (2h 30m)" format (same as outbound)
    const formatStops = (stopsStr) => {
      if (!stopsStr) return { stopText: 'Non-stop', layoverCodes: [], layoverTimes: [] };
      const cleaned = stopsStr.toString().trim();
      const stopMatch = cleaned.match(/(\d+)\s+stop/i);
      
      // Extract layover airport codes and times - try multiple patterns
      const layoverCodes = [];
      const layoverTimes = [];
      
      // Pattern 1: (AMS 8h 15m) or (AMS 2h 30m) - extract both code and time
      const layoverPattern1 = /\(([A-Z]{3})\s+(\d+h(?:\s+\d+m)?|\d+m)\)/g;
      let match;
      while ((match = layoverPattern1.exec(cleaned)) !== null) {
        layoverCodes.push(match[1]);
        layoverTimes.push(match[2]);
      }
      
      // Pattern 2: (AMS) without time - extract code only
      if (layoverCodes.length === 0) {
        const layoverPattern2 = /\(([A-Z]{3})\)/g;
        while ((match = layoverPattern2.exec(cleaned)) !== null) {
          layoverCodes.push(match[1]);
          layoverTimes.push(null); // No time info
        }
      }
      
      // Pattern 3: via AMS or AMS, CDG (standalone codes)
      if (layoverCodes.length === 0) {
        const viaPattern = /via\s+([A-Z]{3}(?:\s*,\s*[A-Z]{3})*)/i;
        const viaMatch = cleaned.match(viaPattern);
        if (viaMatch) {
          const codes = viaMatch[1].split(',').map(c => c.trim());
          layoverCodes.push(...codes);
          codes.forEach(() => layoverTimes.push(null)); // No time info
        }
      }
      
      // Pattern 4: Just airport codes in the text (AMS, CDG)
      if (layoverCodes.length === 0) {
        const codePattern = /\b([A-Z]{3})\b/g;
        const codes = [];
        while ((match = codePattern.exec(cleaned)) !== null) {
          const code = match[1];
          // Skip common non-airport codes
          if (!['NON', 'STOP', 'STOPS'].includes(code)) {
            codes.push(code);
          }
        }
        // Only use if we have 1-3 codes (likely airport codes)
        if (codes.length >= 1 && codes.length <= 3) {
          layoverCodes.push(...codes);
          codes.forEach(() => layoverTimes.push(null)); // No time info
        }
      }
      
      let stopText = 'Non-stop';
      if (stopMatch) {
        const count = parseInt(stopMatch[1]);
        stopText = count === 0 ? 'Non-stop' : `${count} stop${count > 1 ? 's' : ''}`;
      } else if (!cleaned.toLowerCase().includes('non-stop') && !cleaned.toLowerCase().includes('nonstop')) {
        // If no explicit stop count but we found layover codes, infer stop count
        if (layoverCodes.length > 0) {
          stopText = `${layoverCodes.length} stop${layoverCodes.length > 1 ? 's' : ''}`;
        } else {
          stopText = cleaned;
        }
      }
      
      return { stopText, layoverCodes, layoverTimes };
    };
    
    // Format date/time: "26 Dec 2025, 08:30 PM"
    const formatDateTime = (dateTimeStr) => {
      if (!dateTimeStr) return '—';
      let cleaned = dateTimeStr.toString().trim();
      // Remove layover info in parentheses
      cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
      
      // Try to parse various formats
      const patterns = [
        /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4}),?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
        /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4}),?\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i
      ];
      
      for (const pattern of patterns) {
        const match = cleaned.match(pattern);
        if (match) {
          let day, month, year, time;
          if (match[1].match(/^\d+$/)) {
            day = match[1];
            month = match[2];
            year = match[3];
            time = match[4];
          } else {
            month = match[1];
            day = match[2];
            year = match[3];
            time = match[4];
          }
          const monthAbbr = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
          return `${day} ${monthAbbr} ${year}, ${time}`;
        }
      }
      
      return cleaned;
    };
    
    // Extract route info for description
    const extractRouteInfo = () => {
      let origin = null;
      let destination = null;
      
      // Try to extract from message content (for return, destination is origin and vice versa)
      const originMatch = messageContent.match(/from\s+([^to]+?)\s+to/i);
      const destMatch = messageContent.match(/to\s+([^\n(]+?)(?:\s*\(|\s*on|\s*$)/i);
      
      if (originMatch) destination = originMatch[1].trim(); // Return: destination becomes origin
      if (destMatch) origin = destMatch[1].trim(); // Return: origin becomes destination
      
      return { origin, destination };
    };
    
    const routeInfo = extractRouteInfo();
    
    // Get first flight data for summary chip (selected flight)
    const firstFlightRow = rows[1];
    const firstAirline = airlineIndex >= 0 && firstFlightRow[airlineIndex] ? firstFlightRow[airlineIndex].toString().trim() : '';
    const firstFlightCode = flightCodeIndex >= 0 && firstFlightRow[flightCodeIndex] ? firstFlightRow[flightCodeIndex].toString().trim() : '';
    const firstPrice = priceIndex >= 0 && firstFlightRow[priceIndex] ? formatPrice(firstFlightRow[priceIndex]) : '';
    const firstStops = stopsIndex >= 0 && firstFlightRow[stopsIndex] ? formatStops(firstFlightRow[stopsIndex]) : { stopText: 'Non-stop', layoverCodes: [] };
    const firstOrigin = originIndex >= 0 && firstFlightRow[originIndex] ? firstFlightRow[originIndex].toString().trim() : '';
    const firstDest = destIndex >= 0 && firstFlightRow[destIndex] ? firstFlightRow[destIndex].toString().trim() : '';
    const firstDeparture = departureIndex >= 0 && firstFlightRow[departureIndex] ? formatDateTime(firstFlightRow[departureIndex]) : '';
    const firstDate = firstDeparture.match(/(\d{1,2}\s+\w+\s+\d{4})/)?.[1] || '';
    
    // Generate description text for return
    const originDisplay = routeInfo.origin || firstOrigin || 'destination';
    const destDisplay = routeInfo.destination || firstDest || 'origin';
    
    return (
      <div key={uniqueKey} style={{ marginTop: '8px' }}>
        {/* FlightTableComparison component for modal management */}
        <FlightTableComparison rows={rows} messageContent={messageContent} tableIndex={tableIndex} />
        
        {/* Section Title */}
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '700', 
          margin: '8px 0 12px 0', 
          color: '#004C8C' 
        }}>
          Return Flights
        </h2>
        
        {/* Description text above return table */}
        <div style={{ 
          marginBottom: '12px',
          fontSize: '14px',
          color: '#64748b',
          lineHeight: '1.5'
        }}>
          Select your preferred return flight from <strong style={{ color: '#1e293b' }}>{originDisplay}</strong> back to <strong style={{ color: '#1e293b' }}>{destDisplay}</strong>.
        </div>
        
        <div style={{ margin: '8px 0', overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse', 
            fontSize: '14px',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Price
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Duration
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Stops / Layover
                </th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Departure
                </th>
                <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0' }}>
                  Arrival
                </th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#004C8C', borderBottom: '2px solid #e2e8f0', width: '90px' }}>
                  Compare
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, rowIndex) => {
                const airline = airlineIndex >= 0 && row[airlineIndex] ? row[airlineIndex].toString().trim() : '';
                const flightCode = flightCodeIndex >= 0 && row[flightCodeIndex] ? row[flightCodeIndex].toString().trim() : '';
                const price = priceIndex >= 0 && row[priceIndex] ? formatPrice(row[priceIndex]) : '—';
                const duration = durationIndex >= 0 && row[durationIndex] ? formatDuration(row[durationIndex]) : '—';
                const stops = stopsIndex >= 0 && row[stopsIndex] ? formatStops(row[stopsIndex]) : { stopText: 'Non-stop', layoverCodes: [] };
                const departure = departureIndex >= 0 && row[departureIndex] ? formatDateTime(row[departureIndex]) : '—';
                const arrival = arrivalIndex >= 0 && row[arrivalIndex] ? formatDateTime(row[arrivalIndex]) : '—';
                
                // Check if this is the selected flight (first row = selected by default)
                const isSelected = rowIndex === 0;
                
                return (
                  <React.Fragment key={`${uniqueKey}-fragment-${rowIndex + 1}`}>
                    {/* Airline name and flight code above the row */}
                    {airline && flightCode && (
                      <tr style={{ backgroundColor: 'transparent', border: 'none' }}>
                        <td colSpan={6} style={{ padding: '8px 12px 4px 12px', border: 'none', fontSize: '12px', color: '#64748b' }}>
                          <strong style={{ fontWeight: '600', color: '#1e293b' }}>{airline}</strong>
                          <br />
                          <span style={{ fontFamily: 'monospace' }}>{flightCode}</span>
                        </td>
                      </tr>
                    )}
                    
                    {/* Data row */}
                    <tr key={`${uniqueKey}-row-${rowIndex + 1}`} style={{ 
                      backgroundColor: isSelected ? '#E6F7FF' : (rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'),
                      borderLeft: isSelected ? '4px solid #00ADEF' : 'none',
                      borderBottom: rowIndex < rows.length - 2 ? '1px solid #e2e8f0' : 'none',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = '#f0f9ff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.backgroundColor = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                      } else {
                        e.currentTarget.style.backgroundColor = '#E6F7FF';
                      }
                    }}
                    >
                      {/* Price */}
                      <td style={{ padding: '12px', verticalAlign: 'top' }}>
                        <div style={{ 
                          fontWeight: '700', 
                          color: '#059669',
                          fontSize: '15px'
                        }}>
                          {price}
                        </div>
                      </td>
                      
                      {/* Duration */}
                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top' }}>
                        <div style={{ 
                          fontWeight: '500',
                          color: '#1e293b'
                        }}>
                          {duration}
                        </div>
                      </td>
                      
                      {/* Stops/Layover */}
                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top' }}>
                        {stops.layoverCodes.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span style={{
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              padding: '4px 10px',
                              borderRadius: '12px',
                              fontSize: '12px',
                              fontWeight: '500',
                              display: 'inline-block'
                            }}>
                              {stops.stopText}
                            </span>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              via {stops.layoverCodes.map((code, idx) => {
                                const time = stops.layoverTimes && stops.layoverTimes[idx];
                                return time ? `${code} (${time})` : code;
                              }).join(', ')}
                            </span>
                          </div>
                        ) : (
                          <span style={{
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: '500',
                            display: 'inline-block'
                          }}>
                            {stops.stopText}
                          </span>
                        )}
                      </td>
                      
                      {/* Departure */}
                      <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {departure}
                      </td>
                      
                      {/* Arrival */}
                      <td style={{ padding: '12px', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        {arrival}
                      </td>
                      
                      {/* Compare */}
                      <td style={{ padding: '12px', textAlign: 'center', verticalAlign: 'top', width: '90px' }}>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const event = new CustomEvent('compareFlight', {
                              detail: { rowIndex: rowIndex + 1, tableIndex }
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
                            whiteSpace: 'nowrap',
                            width: '90px'
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
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {/* Summary Chip */}
        {firstAirline && firstFlightCode && (
          <div style={{
            marginTop: '16px',
            padding: '10px 16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #00ADEF',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#004C8C',
            display: 'inline-block'
          }}>
            ✈️ {firstOrigin || 'BCN'} → {firstDest || 'IAD'} | {firstDate || '26 Dec'} | {firstPrice || '$1,590.79'} | {firstStops.stopText}{firstStops.layoverCodes.length > 0 ? ` • via ${firstStops.layoverCodes.map((code, idx) => {
              const time = firstStops.layoverTimes && firstStops.layoverTimes[idx];
              return time ? `${code} (${time})` : code;
            }).join(', ')}` : ''}
          </div>
        )}
      </div>
    );
  }
  
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
                  borderBottom: rowIndex < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (rowIndex > 0) {
                    e.currentTarget.style.backgroundColor = '#f0f9ff';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                }}
                >
                  {row.map((cell, cellIndex) => (
                    <td key={`${uniqueKey}-cell-${rowIndex}-${cellIndex}`} style={{ 
                      padding: '8px 12px', 
                      textAlign: cellIndex === 0 ? 'center' : 'left',
                      borderRight: cellIndex < row.length - 1 ? '1px solid var(--border)' : 'none',
                      fontWeight: rowIndex === 0 ? '600' : 'normal',
                      color: rowIndex === 0 ? '#004C8C' : 'inherit',
                      verticalAlign: 'middle'
                    }}>
                      {renderCellContent(cell, rowIndex, cellIndex, rows[0], isReturnFlightsTable)}
                    </td>
                  ))}
                  {/* Add compare button column for flight tables (data rows only) */}
                  {isFlightTable && rowIndex > 0 && (
                    <td style={{ 
                      padding: '8px 12px', 
                      textAlign: 'center',
                      borderRight: 'none',
                      verticalAlign: 'middle',
                      width: '90px'
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
                          whiteSpace: 'nowrap',
                          width: '90px'
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
                      verticalAlign: 'middle',
                      width: '90px'
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
      
      {/* Add buttons for flight tables - only show for Return Flights, hide for Outbound Flights */}
      {isFlightTable && isReturnFlightsTable && (onGenerateItinerary || onSaveTrip) && (
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