import { MapPin, Calendar, Clock } from 'lucide-react';
import { Card } from './ui/card';

interface ItinerarySummaryProps {
  destination: string;
  startDate: string;
  endDate: string;
  tripLength: number;
}

export function ItinerarySummary({ destination, startDate, endDate, tripLength }: ItinerarySummaryProps) {
  return (
    <Card className="p-6 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <MapPin className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-primary mb-1">{destination}</h2>
            <p className="text-muted-foreground">Your dream destination awaits</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>Dates</p>
              <p>{startDate} - {endDate}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>Duration</p>
              <p>{tripLength} days</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
