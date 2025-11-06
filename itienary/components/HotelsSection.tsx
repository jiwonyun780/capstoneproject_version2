import { Hotel, MapPin, Star, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface HotelProps {
  id: string;
  name: string;
  image: string;
  rating: number;
  reviewCount: number;
  location: string;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  totalNights: number;
}

interface HotelsSectionProps {
  hotels: HotelProps[];
}

export function HotelsSection({ hotels }: HotelsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Hotel className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-primary">Accommodations</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {hotels.map((hotel) => (
          <Card 
            key={hotel.id} 
            className="overflow-hidden hover:shadow-md transition-shadow group"
          >
            <div className="aspect-[16/10] overflow-hidden">
              <ImageWithFallback
                src={hotel.image}
                alt={hotel.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-foreground">{hotel.name}</h3>
                <Badge variant="secondary" className="shrink-0">
                  <Star className="w-3 h-3 fill-current mr-1" />
                  {hotel.rating}
                </Badge>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground mb-3">
                <MapPin className="w-4 h-4" />
                <p style={{ fontSize: '0.875rem' }}>{hotel.location}</p>
              </div>

              <div className="flex items-center gap-4 mb-3 text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span style={{ fontSize: '0.875rem' }}>Check-in: {hotel.checkIn}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 text-muted-foreground mb-4">
                <Calendar className="w-4 h-4" />
                <span style={{ fontSize: '0.875rem' }}>Check-out: {hotel.checkOut}</span>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div>
                  <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                    ${hotel.nightlyRate}/night × {hotel.totalNights} nights
                  </p>
                </div>
                <p className="text-primary">${hotel.nightlyRate * hotel.totalNights}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
