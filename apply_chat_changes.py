#!/usr/bin/env python3
"""
Comprehensive script to apply all Chat.jsx and tripState.js modifications
for the new trip conversation UX feature.
"""

import re
import sys

def apply_trip_state_changes():
    """Add resetAllTripData function to tripState.js"""
    with open('src/utils/tripState.js', 'r') as f:
        content = f.read()
    
    # Add resetAllTripData function
    reset_function = '''
// Reset all trip data (conversation + tripState) - for starting a new trip
export const resetAllTripData = () => {
  // Clear conversation
  clearConversation();
  // Clear trip state completely
  clearTripState();
  // Also clear current itinerary
  const state = loadTripState();
  if (state.currentItinerary) {
    delete state.currentItinerary;
    state.hasExistingItinerary = false;
    saveTripState(state);
  }
  return { ...defaultTripState, lastUpdated: new Date().toISOString() };
};
'''
    
    # Insert before selectOutboundFlight
    pattern = r'(// Clear saved conversation[^}]+return state;\s+\};\s+)(// Select outbound flight)'
    replacement = r'\1' + reset_function + r'\n\2'
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    
    with open('src/utils/tripState.js', 'w') as f:
        f.write(content)
    
    print("✓ tripState.js updated")

def apply_chat_changes():
    """Apply all Chat.jsx modifications"""
    with open('src/pages/Chat.jsx', 'r') as f:
        content = f.read()
    
    # 1. Update import
    content = content.replace(
        'import { recordTripSelection, loadTripState, saveTripState, updateTripRoute, loadCurrentItinerary, loadConversation, saveConversation, clearConversation, recordMustDoActivities, selectOutboundFlight, selectReturnFlight } from \'../utils/tripState\';',
        'import { recordTripSelection, loadTripState, saveTripState, updateTripRoute, loadCurrentItinerary, loadConversation, saveConversation, clearConversation, resetAllTripData, recordMustDoActivities, selectOutboundFlight, selectReturnFlight } from \'../utils/tripState\';'
    )
    
    # 2. Add state variables
    content = re.sub(
        r'(const \[hasExistingItinerary, setHasExistingItinerary\] = useState\(location\.state\?\.hasExistingItinerary \|\| false\);)',
        r'\1\n  const [showTripChoiceBanner, setShowTripChoiceBanner] = useState(false);\n  const [showNewTripConfirm, setShowNewTripConfirm] = useState(false);',
        content
    )
    
    # 3. Add handler functions
    handlers = '''
  // Function to continue previous trip - restores saved conversation
  const handleContinuePreviousTrip = async () => {
    setShowTripChoiceBanner(false);
    setOnboardingComplete(true);
    
    const savedConv = loadConversation();
    const tripState = loadTripState();
    
    if (savedConv && savedConv.messages && savedConv.messages.length > 0) {
      console.log('Restoring saved conversation:', savedConv.messages.length, 'messages');
      setMessages(savedConv.messages);
      if (savedConv.sessionId) {
        setSessionId(savedConv.sessionId);
      }
      if (savedConv.context) {
        setContext(savedConv.context);
      }
      if (savedConv.userPreferences) {
        setUserPreferences(savedConv.userPreferences);
      }
      if (tripState?.currentItinerary) {
        setHasExistingItinerary(true);
      }
    } else {
      const locationContext = await getLocationContext();
      setContext(locationContext);
      const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      let welcomeMessage = "Hi! I'm Miles, your AI travel assistant. I'm here to help you plan the perfect trip.";
      if (locationContext.user_location.city && locationContext.user_location.country) {
        welcomeMessage += ` I can see you're in ${locationContext.user_location.city}, ${locationContext.user_location.country}.`;
      } else if (locationContext.user_location.country) {
        welcomeMessage += ` I can see you're in ${locationContext.user_location.country}.`;
      }
      welcomeMessage += " You can continue building your itinerary. What would you like to add?";
      setMessages([{
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }]);
      if (tripState?.currentItinerary) {
        setHasExistingItinerary(true);
      }
    }
    setIsLoadingContext(false);
  };

  // Function to start a new trip - clears everything and initializes fresh
  const handleStartNewTrip = async () => {
    resetAllTripData();
    setMessages([]);
    setSessionId(null);
    setContext(null);
    setUserPreferences(null);
    setHasExistingItinerary(false);
    setShowTripChoiceBanner(false);
    setShowNewTripConfirm(false);
    const locationContext = await getLocationContext();
    setContext(locationContext);
    const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setSessionId(newSessionId);
    let welcomeMessage = "Great, let's start a new trip. Where would you like to go?";
    if (locationContext.user_location.city && locationContext.user_location.country) {
      welcomeMessage = `Great, let's start a new trip. I can see you're in ${locationContext.user_location.city}, ${locationContext.user_location.country}. Where would you like to go?`;
    } else if (locationContext.user_location.country) {
      welcomeMessage = `Great, let's start a new trip. I can see you're in ${locationContext.user_location.country}. Where would you like to go?`;
    }
    setMessages([{
      role: 'assistant',
      content: welcomeMessage,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }]);
    setIsLoadingContext(false);
    setOnboardingComplete(true);
  };
'''
    
    content = re.sub(
        r'(const handleOnboardingComplete = \(preferences\) => \{[^}]+\};\s*)(// Initialize context and welcome message)',
        r'\1' + handlers + r'\n  \2',
        content,
        flags=re.DOTALL
    )
    
    # 4. Modify initialization logic
    init_pattern = r'(// Check if we should restore conversation \(from Back to Results flow\)\s+const shouldRestore = location\.state\?\.restoreConversation \|\| false;\s+const hasItinerary = location\.state\?\.hasExistingItinerary \|\| false;\s+if \(hasItinerary\) \{\s+setHasExistingItinerary\(true\);\s+\}\s+)(// If Back to Results was clicked)'
    init_replacement = r'''\1// Check for saved conversation when NOT from Back to Results
        if (!shouldRestore && !isRefresh) {
          const savedConv = loadConversation();
          const tripState = loadTripState();
          const hasSavedData = (savedConv && savedConv.messages && savedConv.messages.length > 0) || 
                               (tripState && (tripState.origin || tripState.destination || tripState.currentItinerary));
          if (hasSavedData) {
            setShowTripChoiceBanner(true);
            setIsLoadingContext(false);
            return;
          }
        }
        
        \2'''
    content = re.sub(init_pattern, init_replacement, content, flags=re.DOTALL)
    
    # 5. Add "New trip" button in header
    header_button = '''            <button
              onClick={() => {
                if (messages.length > 1 || showTripChoiceBanner) {
                  setShowNewTripConfirm(true);
                } else {
                  handleStartNewTrip();
                }
              }}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                color: '#00ADEF',
                border: '2px solid #00ADEF',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                marginLeft: 'auto',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#E6F7FF';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
              }}
            >
              New trip
            </button>'''
    
    content = re.sub(
        r'(</div>\s+</div>\s+</div>\s+</header>)',
        header_button + r'\n          \1',
        content,
        count=1
    )
    
    # Fix the header structure - button should be inside chat-header-content
    content = re.sub(
        r'(<div className="chat-header-info">[^<]+</div>\s+)(</div>\s+</div>\s+</header>)',
        r'\1' + header_button + r'\n          \2',
        content,
        flags=re.DOTALL,
        count=1
    )
    
    # 6. Add banner in chat-messages
    banner = '''{showTripChoiceBanner && (
            <div style={{
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: '#f0f9ff',
              borderRadius: '12px',
              border: '2px solid #bae6fd',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#004C8C', marginBottom: '4px' }}>
                Welcome back! You have a saved trip conversation.
              </div>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>
                Would you like to continue your previous trip or start a new one?
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleContinuePreviousTrip}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#00ADEF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 600,
                    flex: '1',
                    minWidth: '150px'
                  }}
                >
                  Continue previous trip
                </button>
                <button
                  onClick={handleStartNewTrip}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'white',
                    color: '#00ADEF',
                    border: '2px solid #00ADEF',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 600,
                    flex: '1',
                    minWidth: '150px'
                  }}
                >
                  Start a new trip
                </button>
              </div>
            </div>
          )}
          '''
    
    content = re.sub(
        r'(<div className="container">\s+)(\{showItineraryMessage)',
        r'\1' + banner + r'\2',
        content,
        flags=re.DOTALL,
        count=1
    )
    
    # 7. Add confirmation dialog
    dialog = '''{showNewTripConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setShowNewTripConfirm(false)}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '12px',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px', color: '#004C8C' }}>
              Start a new trip?
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px' }}>
              Your current chat will be cleared. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewTripConfirm(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowNewTripConfirm(false);
                  handleStartNewTrip();
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#00ADEF',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Start New Trip
              </button>
            </div>
          </div>
        </div>
      )}
      '''
    
    content = re.sub(
        r'(</div>\s+</div>\s+</div>\s+</div>\s+\);?\s*})',
        r'\1' + dialog,
        content,
        flags=re.DOTALL,
        count=1
    )
    
    with open('src/pages/Chat.jsx', 'w') as f:
        f.write(content)
    
    print("✓ Chat.jsx updated")

if __name__ == '__main__':
    try:
        apply_trip_state_changes()
        apply_chat_changes()
        print("\n✅ All changes applied successfully!")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

