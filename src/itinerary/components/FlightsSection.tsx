import { Plane, Clock, Info } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface Flight {
  id: string;
  type: 'departure' | 'return';
  airline: string;
  flightNumber: string;
  departure: {
    airport: string;
    time: string;
    date: string;
  };
  arrival: {
    airport: string;
    time: string;
    date: string;
  };
  duration: string;
  price: number;
  class: string;
}

interface FlightsSectionProps {
  flights: Flight[];
}

export function FlightsSection({ flights }: FlightsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Plane className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-primary">Flights</h2>
      </div>

      <div className="space-y-3">
        {flights.map((flight) => (
          <Card 
            key={flight.id} 
            className="p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-foreground">{flight.airline}</h4>
                    <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                      {flight.flightNumber} • {flight.class}
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-auto lg:ml-0">
                    {flight.type === 'departure' ? 'Outbound' : 'Return'}
                  </Badge>
                </div>

                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-foreground">{flight.departure.time}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                      {flight.departure.airport}
                    </p>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <div className="h-px bg-border flex-1"></div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span style={{ fontSize: '0.75rem' }}>{flight.duration}</span>
                    </div>
                    <div className="h-px bg-border flex-1"></div>
                  </div>

                  <div>
                    <p className="text-foreground">{flight.arrival.time}</p>
                    <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                      {flight.arrival.airport}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 lg:flex-col lg:items-end">
                <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>from</p>
                <p className="text-primary">${flight.price}</p>
                <Button variant="outline" size="sm" className="ml-auto lg:ml-0">
                  <Info className="w-4 h-4 mr-2" />
                  Details
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
