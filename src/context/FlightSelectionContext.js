import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const FlightSelectionContext = createContext(null);

export function FlightSelectionProvider({ children }) {
  const [selectedFlights, setSelectedFlights] = useState([]);

  const toggleFlightSelection = useCallback((flight) => {
    if (!flight || !flight.id) {
      return;
    }

    setSelectedFlights((prev) => {
      const existing = prev.find((item) => item.id === flight.id);
      if (existing) {
        return prev.filter((item) => item.id !== flight.id);
      }

      return [...prev, flight];
    });
  }, []);

  const clearSelectedFlights = useCallback(() => {
    setSelectedFlights([]);
  }, []);

  const value = useMemo(() => {
    const getSelectedFlights = () => selectedFlights;
    const isFlightSelected = (flightId) =>
      !!selectedFlights.find((item) => item.id === flightId);

    return {
      selectedFlights,
      toggleFlightSelection,
      clearSelectedFlights,
      getSelectedFlights,
      isFlightSelected,
    };
  }, [selectedFlights, toggleFlightSelection, clearSelectedFlights]);

  return (
    <FlightSelectionContext.Provider value={value}>
      {children}
    </FlightSelectionContext.Provider>
  );
}

export function useFlightSelection() {
  const context = useContext(FlightSelectionContext);
  if (!context) {
    throw new Error('useFlightSelection must be used within a FlightSelectionProvider');
  }
  return context;
}

