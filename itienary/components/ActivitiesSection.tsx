import { Calendar, Clock, MapPin, ChevronDown } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { useState } from 'react';

interface Activity {
  id: string;
  time: string;
  title: string;
  description: string;
  location: string;
  duration: string;
  price: number;
}

interface DayActivities {
  day: number;
  date: string;
  activities: Activity[];
}

interface ActivitiesSectionProps {
  days: DayActivities[];
}

export function ActivitiesSection({ days }: ActivitiesSectionProps) {
  const [openDays, setOpenDays] = useState<number[]>([1]);

  const toggleDay = (day: number) => {
    setOpenDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calendar className="w-5 h-5 text-primary" />
        </div>
        <h2 className="text-primary">Daily Activities</h2>
      </div>

      <div className="space-y-3">
        {days.map((day) => (
          <Collapsible
            key={day.day}
            open={openDays.includes(day.day)}
            onOpenChange={() => toggleDay(day.day)}
          >
            <Card className="overflow-hidden">
              <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="text-primary">Day {day.day}</span>
                  </div>
                  <div className="text-left">
                    <h3 className="text-foreground">Day {day.day}</h3>
                    <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                      {day.date}
                    </p>
                  </div>
                  <Badge variant="secondary" className="ml-4">
                    {day.activities.length} activities
                  </Badge>
                </div>
                <ChevronDown 
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    openDays.includes(day.day) ? 'rotate-180' : ''
                  }`}
                />
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border">
                  {day.activities.map((activity, index) => (
                    <div
                      key={activity.id}
                      className={`p-4 hover:bg-muted/30 transition-colors ${
                        index !== day.activities.length - 1 ? 'border-b border-border' : ''
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Clock className="w-5 h-5 text-primary" />
                          </div>
                          {index !== day.activities.length - 1 && (
                            <div className="w-px bg-border flex-1 my-2"></div>
                          )}
                        </div>

                        <div className="flex-1 pb-2">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-muted-foreground" style={{ fontSize: '0.875rem' }}>
                                {activity.time} • {activity.duration}
                              </p>
                              <h4 className="text-foreground mt-1">{activity.title}</h4>
                            </div>
                            <p className="text-primary shrink-0">${activity.price}</p>
                          </div>

                          <p className="text-muted-foreground mb-2" style={{ fontSize: '0.875rem' }}>
                            {activity.description}
                          </p>

                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="w-4 h-4" />
                            <span style={{ fontSize: '0.875rem' }}>{activity.location}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
