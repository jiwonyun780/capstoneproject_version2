import React from 'react';
import { useNavigate } from 'react-router-dom';
import ChatMockup from '../components/ChatMockup';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div>
      <nav className="nav">
        <div className="container">
          <div className="nav-left">
            <img src={process.env.PUBLIC_URL + '/sta_tpt_logo.png'} alt="logo" width={48} height={48} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span className="brand-name">Wayfinder</span>
              <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 400 }}>Plan Smarter.</span>
            </div>
          </div>
          <div className="nav-right">
            <a className="nav-link" href="#features">Features</a>
            <a className="nav-link" href="#about">About</a>
            <a className="nav-link signin" href="#signin">Sign In</a>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="container" style={{ display: 'grid', gridTemplateColumns: '1fr 480px', gap: 32, alignItems: 'center' }}>
          <div>
            <div className="muted" style={{ fontWeight: 700 }}>AI-Powered Travel Planning</div>
            <h1 className="hero-title">One conversation,<br/> <span style={{ color: '#00ADEF' }}>optimized travel</span></h1>
            <p className="hero-subtitle">Transform the way you plan trips with our intelligent assistant. Get personalized recommendations for flights, hotels, activities, and dining— all through natural conversation.</p>
            <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-primary" onClick={() => navigate('/chat', { state: { newTrip: true } })}>Start Planning</button>
                <button className="btn btn-secondary">Try Demo</button>
            </div>
            <div className="metrics">
              <div className="card metric">
                <h3>10K+</h3>
                <p>Trips Planned</p>
              </div>
              <div className="card metric">
                <h3>95%</h3>
                <p>Satisfaction</p>
              </div>
              <div className="card metric">
                <h3>24/7</h3>
                <p>Support</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ChatMockup />
          </div>
        </div>
      </section>

      <section id="features">
        <div className="container">
          <h3 style={{ textAlign: 'center', margin: '8px 0' }}>Everything you need</h3>
          <p className="muted" style={{ textAlign: 'center' }}>Comprehensive travel planning tools in one intelligent assistant</p>
          <div className="features">
            <div className="card feature-card">
              <h4 className="feature-title">Flights</h4>
              <p className="feature-desc">Find the best flight options based on your preferences and budget</p>
            </div>
            <div className="card feature-card">
              <h4 className="feature-title">Accommodations</h4>
              <p className="feature-desc">Discover stays perfectly matched to your travel style and budget</p>
            </div>
            <div className="card feature-card">
              <h4 className="feature-title">Weather</h4>
              <p className="feature-desc">Real-time forecasts and climate insights for your destination</p>
            </div>
            <div className="card feature-card">
              <h4 className="feature-title">Activity</h4>
              <p className="feature-desc">Personalized recommendations for tours, attractions, and experiences</p>
            </div>
            <div className="card feature-card">
              <h4 className="feature-title">Safety</h4>
              <p className="feature-desc">Travel with confidence with real-time safety updates and alerts</p>
            </div>
          </div>
        </div>
      </section>

      <section id="about" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <h4>Smart Trip Planning</h4>
                <p className="muted">Our AI analyzes millions of data points to create the perfect itinerary</p>
              </div>
              <div>
                <h4>Personalized Insights</h4>
                <p className="muted">Get recommendations tailored to your unique preferences and interests</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="cta">
        <h4>Ready to plan your next adventure?</h4>
        <p>Join thousands of travelers who’ve discovered a better way to plan trips</p>
        <div style={{ display: 'inline-flex', gap: 12 }}>
            <button className="btn btn-secondary">Get Started Free</button>
            <button className="btn btn-secondary">View Pricing</button>
        </div>
      </div>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="nav-left" style={{ paddingBottom: 8 }}>
              <img src={process.env.PUBLIC_URL + '/sta_tpt_logo.png'} alt="logo" width={32} height={32} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className="brand-name">Wayfinder</span>
                <span style={{ fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 400 }}>Plan Smarter.</span>
              </div>
              </div>
              <div className="muted">AI-powered travel planning made simple</div>
          </div>
          <div>
            <h5>Product</h5>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div>
            <h5>Company</h5>
            <a href="#about">About</a>
            <a href="#blog">Blog</a>
            <a href="#careers">Careers</a>
          </div>
          <div>
            <h5>Legal</h5>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
            <a href="#security">Security</a>
          </div>
        </div>
        <div className="container" style={{ paddingTop: 24 }}>
          <div className="muted">© 2025 Wayfinder. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}



