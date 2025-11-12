import { Header } from './components/Header';
import { ItinerarySummary } from './components/ItinerarySummary';
import { FlightsSection } from './components/FlightsSection';
import { HotelsSection } from './components/HotelsSection';
import { ActivitiesSection } from './components/ActivitiesSection';
import { CostSidebar } from './components/CostSidebar';

// Mock data for the itinerary
const itineraryData = {
  destination: 'Tokyo, Japan',
  startDate: 'Nov 15, 2025',
  endDate: 'Nov 22, 2025',
  tripLength: 7,
};

const flights = [
  {
    id: '1',
    type: 'departure' as const,
    airline: 'Japan Airlines',
    flightNumber: 'JL 061',
    departure: {
      airport: 'LAX',
      time: '12:30 PM',
      date: 'Nov 15',
    },
    arrival: {
      airport: 'NRT',
      time: '4:00 PM +1',
      date: 'Nov 16',
    },
    duration: '11h 30m',
    price: 850,
    class: 'Economy',
  },
  {
    id: '2',
    type: 'return' as const,
    airline: 'Japan Airlines',
    flightNumber: 'JL 060',
    departure: {
      airport: 'NRT',
      time: '6:30 PM',
      date: 'Nov 22',
    },
    arrival: {
      airport: 'LAX',
      time: '11:00 AM',
      date: 'Nov 22',
    },
    duration: '10h 30m',
    price: 850,
    class: 'Economy',
  },
];

const hotels = [
  {
    id: '1',
    name: 'Park Hyatt Tokyo',
    image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBob3RlbCUyMHJvb218ZW58MXx8fHwxNzYyMzUwMDg3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rating: 4.8,
    reviewCount: 1240,
    location: 'Shinjuku, Tokyo',
    checkIn: 'Nov 16',
    checkOut: 'Nov 19',
    nightlyRate: 420,
    totalNights: 3,
  },
  {
    id: '2',
    name: 'The Strings by InterContinental',
    image: 'https://images.unsplash.com/photo-1649731000184-7ced04998f44?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxib3V0aXF1ZSUyMGhvdGVsfGVufDF8fHx8MTc2MjM0ODM4N3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral',
    rating: 4.6,
    reviewCount: 890,
    location: 'Shinagawa, Tokyo',
    checkIn: 'Nov 19',
    checkOut: 'Nov 22',
    nightlyRate: 350,
    totalNights: 3,
  },
];

const activities = [
  {
    day: 1,
    date: 'November 16, 2025',
    activities: [
      {
        id: '1-1',
        time: '9:00 AM',
        title: 'Airport Transfer to Hotel',
        description: 'Private car transfer from Narita Airport to Park Hyatt Tokyo',
        location: 'Narita Airport → Shinjuku',
        duration: '1h 30m',
        price: 85,
      },
      {
        id: '1-2',
        time: '2:00 PM',
        title: 'Shinjuku Walking Tour',
        description: 'Explore the vibrant Shinjuku district, including Kabukicho and Golden Gai',
        location: 'Shinjuku District',
        duration: '3h',
        price: 45,
      },
      {
        id: '1-3',
        time: '7:00 PM',
        title: 'Traditional Izakaya Dinner',
        description: 'Authentic Japanese dining experience at a local izakaya',
        location: 'Omoide Yokocho',
        duration: '2h',
        price: 65,
      },
    ],
  },
  {
    day: 2,
    date: 'November 17, 2025',
    activities: [
      {
        id: '2-1',
        time: '8:00 AM',
        title: 'Tsukiji Outer Market Food Tour',
        description: 'Sample fresh sushi and local delicacies at Tokyo\'s famous fish market',
        location: 'Tsukiji Market',
        duration: '2h 30m',
        price: 75,
      },
      {
        id: '2-2',
        time: '11:30 AM',
        title: 'Imperial Palace Gardens',
        description: 'Guided tour of the historic Imperial Palace and East Gardens',
        location: 'Chiyoda',
        duration: '2h',
        price: 40,
      },
      {
        id: '2-3',
        time: '3:00 PM',
        title: 'Ginza Shopping Experience',
        description: 'Explore luxury boutiques and department stores in upscale Ginza',
        location: 'Ginza District',
        duration: '3h',
        price: 0,
      },
      {
        id: '2-4',
        time: '7:30 PM',
        title: 'Kaiseki Dinner',
        description: 'Multi-course traditional Japanese haute cuisine',
        location: 'Ginza',
        duration: '2h 30m',
        price: 180,
      },
    ],
  },
  {
    day: 3,
    date: 'November 18, 2025',
    activities: [
      {
        id: '3-1',
        time: '9:00 AM',
        title: 'Day Trip to Nikko',
        description: 'Visit UNESCO World Heritage shrines and natural beauty',
        location: 'Nikko',
        duration: '8h',
        price: 150,
      },
      {
        id: '3-2',
        time: '7:00 PM',
        title: 'Dinner at Hotel',
        description: 'Relax with dinner at the hotel restaurant',
        location: 'Park Hyatt Tokyo',
        duration: '1h 30m',
        price: 90,
      },
    ],
  },
  {
    day: 4,
    date: 'November 19, 2025',
    activities: [
      {
        id: '4-1',
        time: '10:00 AM',
        title: 'TeamLab Borderless',
        description: 'Immersive digital art museum experience',
        location: 'Odaiba',
        duration: '2h 30m',
        price: 35,
      },
      {
        id: '4-2',
        time: '2:00 PM',
        title: 'Asakusa & Senso-ji Temple',
        description: 'Explore Tokyo\'s oldest temple and traditional shopping street',
        location: 'Asakusa',
        duration: '3h',
        price: 30,
      },
      {
        id: '4-3',
        time: '7:00 PM',
        title: 'Tokyo Skytree Observation',
        description: 'Evening views from Japan\'s tallest structure',
        location: 'Sumida',
        duration: '1h 30m',
        price: 28,
      },
    ],
  },
  {
    day: 5,
    date: 'November 20, 2025',
    activities: [
      {
        id: '5-1',
        time: '9:00 AM',
        title: 'Meiji Shrine Visit',
        description: 'Peaceful Shinto shrine surrounded by forest',
        location: 'Harajuku',
        duration: '1h 30m',
        price: 0,
      },
      {
        id: '5-2',
        time: '11:00 AM',
        title: 'Harajuku & Takeshita Street',
        description: 'Youth fashion and pop culture shopping experience',
        location: 'Harajuku',
        duration: '2h',
        price: 0,
      },
      {
        id: '5-3',
        time: '2:30 PM',
        title: 'Shibuya Crossing & Shopping',
        description: 'World\'s busiest intersection and trendy shopping',
        location: 'Shibuya',
        duration: '3h',
        price: 0,
      },
      {
        id: '5-4',
        time: '7:00 PM',
        title: 'Yakiniku Dinner',
        description: 'Japanese BBQ experience',
        location: 'Shibuya',
        duration: '2h',
        price: 85,
      },
    ],
  },
  {
    day: 6,
    date: 'November 21, 2025',
    activities: [
      {
        id: '6-1',
        time: '8:00 AM',
        title: 'Day Trip to Hakone',
        description: 'Hot springs, Mt. Fuji views, and scenic nature',
        location: 'Hakone',
        duration: '9h',
        price: 180,
      },
      {
        id: '6-2',
        time: '7:30 PM',
        title: 'Farewell Dinner',
        description: 'Final dinner in Tokyo at a rooftop restaurant',
        location: 'Roppongi',
        duration: '2h',
        price: 120,
      },
    ],
  },
  {
    day: 7,
    date: 'November 22, 2025',
    activities: [
      {
        id: '7-1',
        time: '10:00 AM',
        title: 'Last-minute Shopping',
        description: 'Final souvenir shopping in the neighborhood',
        location: 'Shinagawa',
        duration: '2h',
        price: 0,
      },
      {
        id: '7-2',
        time: '3:00 PM',
        title: 'Airport Transfer',
        description: 'Private transfer to Narita Airport',
        location: 'Shinagawa → Narita',
        duration: '1h 30m',
        price: 85,
      },
    ],
  },
];

const costs = {
  flights: 1700,
  hotels: 2370,
  activities: 1488,
};

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 lg:px-8 py-8">
        <h1 className="text-primary mb-6">Your Optimized Itinerary</h1>
        
        <ItinerarySummary
          destination={itineraryData.destination}
          startDate={itineraryData.startDate}
          endDate={itineraryData.endDate}
          tripLength={itineraryData.tripLength}
        />

        <div className="mt-8 grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <FlightsSection flights={flights} />
            <HotelsSection hotels={hotels} />
            <ActivitiesSection days={activities} />
          </div>

          <div className="lg:col-span-1">
            <CostSidebar costs={costs} />
          </div>
        </div>
      </main>
    </div>
  );
}
