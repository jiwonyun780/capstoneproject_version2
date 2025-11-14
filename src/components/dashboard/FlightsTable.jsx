import React from 'react';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';

// Helper function to check if a value is a placeholder (hyphens, dashes, or empty)
const isPlaceholderValue = (value) => {
  if (!value) return true;
  const trimmed = String(value).trim();
  // Check for various placeholder patterns: '---', '--', '-', 'N/A', 'n/a', empty string
  return trimmed === '' || 
         trimmed === '---' || 
         trimmed === '--' || 
         trimmed === '-' || 
         trimmed.toLowerCase() === 'n/a' ||
         trimmed === 'null' ||
         trimmed === 'undefined';
};

// Helper function to check if a flight is a placeholder/dummy row
const isPlaceholderRow = (flight) => {
  if (!flight) return true;
  
  // Check all key fields for placeholder values
  const airline = isPlaceholderValue(flight.airline);
  const flightNumber = isPlaceholderValue(flight.flightNumber);
  const departure = isPlaceholderValue(flight.departure);
  const arrival = isPlaceholderValue(flight.arrival);
  const duration = isPlaceholderValue(flight.duration);
  
  // If ALL main fields are placeholders, it's a dummy row
  if (airline && flightNumber && departure && arrival && duration) {
    return true;
  }
  
  // Also check if price is invalid (0, null, undefined, or NaN)
  const price = flight.price;
  if (price === undefined || price === null || price === 0 || isNaN(price)) {
    // If price is invalid AND all other fields are placeholders, it's a dummy row
    if (airline && flightNumber && departure && arrival && duration) {
      return true;
    }
  }
  
  return false;
};

export function FlightsTable({ flights }) {
  // Filter out invalid, empty, or placeholder flights BEFORE rendering
  const validFlights = (flights || []).filter(flight => {
    // Basic validation
    if (!flight || !flight.id) {
      return false;
    }
    
    // CRITICAL: Filter out any placeholder/dummy rows with '---' values
    if (isPlaceholderRow(flight)) {
      console.log('[FlightsTable] Filtered out placeholder row:', flight);
      return false;
    }
    
    // Standard validation - ensure required fields exist and are not placeholders
    const hasValidAirline = flight.airline && !isPlaceholderValue(flight.airline);
    const hasValidFlightNumber = flight.flightNumber && !isPlaceholderValue(flight.flightNumber);
    const hasValidPrice = flight.price !== undefined && 
                         flight.price !== null && 
                         flight.price > 0 && 
                         !isNaN(flight.price);
    
    return hasValidAirline && hasValidFlightNumber && hasValidPrice;
  });
  
  if (validFlights.length === 0) {
    return null;
  }
  
  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Available Flights</CardTitle>
        <CardDescription>
          Flights sorted by optimization score - best deals highlighted
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Airline</TableHead>
              <TableHead>Flight Code</TableHead>
              <TableHead>Departure</TableHead>
              <TableHead>Arrival</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Stops</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-center">Book Now</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validFlights.map((flight) => (
              <TableRow
                key={flight.id}
                className={flight.isOptimal ? 'bg-accent/50' : ''}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-muted-foreground" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
                    </svg>
                    {flight.airline || 'N/A'}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{flight.flightNumber || 'N/A'}</span>
                </TableCell>
                <TableCell>{flight.departure || 'N/A'}</TableCell>
                <TableCell>{flight.arrival || 'N/A'}</TableCell>
                <TableCell>{flight.duration || 'N/A'}</TableCell>
                <TableCell>
                  {flight.stops === 0 ? (
                    <Badge variant="secondary">Non-stop</Badge>
                  ) : (
                    <span>{flight.stops} stop{flight.stops > 1 ? 's' : ''}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className={flight.isOptimal ? 'font-medium' : ''}>
                      {flight.currency === 'EUR' ? '€' : flight.currency === 'USD' ? '$' : flight.currency || '$'}{flight.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {flight.isOptimal && (
                      <Badge variant="default" style={{backgroundColor: 'var(--chart-2)', color: 'white'}}>
                        Best Deal
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <a
                    href={flight.bookingLink || `https://www.google.com/search?q=${encodeURIComponent(flight.airline + ' ' + flight.flightNumber + ' booking')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Book Now
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </>
  );
}
