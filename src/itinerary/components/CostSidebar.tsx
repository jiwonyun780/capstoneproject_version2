import { Download, Edit, MapIcon, DollarSign, Plane, Hotel, Calendar } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Separator } from './ui/separator';

interface CostBreakdown {
  flights: number;
  hotels: number;
  activities: number;
}

interface CostSidebarProps {
  costs: CostBreakdown;
}

export function CostSidebar({ costs }: CostSidebarProps) {
  const total = costs.flights + costs.hotels + costs.activities;

  return (
    <div className="lg:sticky lg:top-24 space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5 text-primary" />
          <h3 className="text-primary">Cost Summary</h3>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Plane className="w-4 h-4" />
              <span style={{ fontSize: '0.875rem' }}>Flights</span>
            </div>
            <span className="text-foreground">${costs.flights.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Hotel className="w-4 h-4" />
              <span style={{ fontSize: '0.875rem' }}>Hotels</span>
            </div>
            <span className="text-foreground">${costs.hotels.toLocaleString()}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span style={{ fontSize: '0.875rem' }}>Activities</span>
            </div>
            <span className="text-foreground">${costs.activities.toLocaleString()}</span>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="flex items-center justify-between mb-6">
          <h4 className="text-foreground">Total Cost</h4>
          <p className="text-primary">${total.toLocaleString()}</p>
        </div>

        <div className="space-y-2">
          <Button className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Download Itinerary
          </Button>
          <Button variant="outline" className="w-full">
            <Edit className="w-4 h-4 mr-2" />
            Edit Preferences
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapIcon className="w-5 h-5 text-primary" />
          <h3 className="text-primary">Map Preview</h3>
        </div>
        <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
          <div className="text-center">
            <MapIcon className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
              Interactive map view
            </p>
          </div>
        </div>
        <Button variant="outline" className="w-full mt-4">
          View Full Map
        </Button>
      </Card>
    </div>
  );
}
