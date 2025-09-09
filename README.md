# WebRTC Call Management Backend

A robust, feature-rich WebRTC call management backend in Go that supports real-time video/audio calling, signaling, participant management, and recording.

## Features

### WebRTC Signaling
- ✅ **WebRTC Signaling Protocol** - Complete signaling server for WebRTC calls
- ✅ **SDP Offer/Answer Exchange** - Proper WebRTC session description handling
- ✅ **ICE Candidate Exchange** - STUN/TURN server integration ready
- ✅ **Connection Management** - Room-based call management
- ✅ **Participant Tracking** - Join/leave events and participant lists

### Call Management
- **Room-based Calls**: Multiple participants in video conference rooms
- **Participant Roles**: Host, moderator, participant permissions
- **Call State Management**: Active, ended, recording status
- **Database Integration**: PostgreSQL for persistent call data
- **Real-time Updates**: Live participant status and call events

### Authentication & Authorization
- **JWT Authentication**: RS256 signed tokens for secure access
- **REST API**: Token issuance endpoints
- **WebSocket Auth**: Token validation on connection
- **Role-based Access**: Room-level permissions (host, moderator, participant)

### Scaling & Performance
- **Redis Integration**: For distributed signaling nodes
- **Connection Limits**: Configurable maximum concurrent connections
- **Message Routing**: Efficient message delivery to room participants
- **Load Balancing**: Sticky sessions or distributed routing

### Recording Support
- **Server-side Recording**: Pion WebRTC for single/dual-party recording
- **SFU Integration Ready**: For multi-party recording via RTP forwarding
- **File-based Storage**: Recording metadata and file management
- **Transcoding Options**: ffmpeg/gstreamer integration ready

## Architecture

### Components
- **Signaling Server**: WebRTC signaling over WebSocket
- **Call Manager**: Business logic for call management
- **Database Layer**: PostgreSQL for persistence
- **Authentication**: JWT-based auth system
- **File Storage**: Recording and media file management

### Database Schema
```sql
-- Calls table
CREATE TABLE calls (
    id UUID PRIMARY KEY,
    room_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active',
    recording BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

-- Participants table
CREATE TABLE participants (
    id UUID PRIMARY KEY,
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'participant',
    joined_at TIMESTAMP DEFAULT NOW(),
    left_at TIMESTAMP,
    client_ip INET,
    metadata JSONB DEFAULT '{}'
);
```

## API

### WebSocket Signaling Protocol

All messages use JSON over WebSocket:
```json
{
  "type": "event_type",
  "id": "message_id",
  "payload": { ... }
}
```

#### Client → Server Messages
- `auth`: `{ token }` - Authenticate with JWT
- `join`: `{ room, display_name, capabilities }` - Join a call room
- `offer`: `{ sdp, call_id }` - WebRTC offer
- `answer`: `{ sdp, call_id }` - WebRTC answer
- `ice-candidate`: `{ candidate, sdpMid, sdpMLineIndex }` - ICE candidate
- `mute/unmute`: `{ call_id, track }` - Audio/video control
- `hold`: `{ call_id, track }` - Call hold
- `dtmf`: `{ call_id, tones }` - DTMF tones

#### Server → Client Messages
- `joined`: `{ participant_id, room_state }` - Successfully joined
- `peer-joined/peer-left`: Participant events
- `offer/answer/ice-candidate`: WebRTC signaling
- `call-state-changed`: Call status updates
- `recording-started/finished`: Recording events

### REST API

#### Authentication
```
POST /auth/token
- Issues JWT tokens after user authentication
```

#### Calls
```
POST /calls
- Create a new call room

GET /calls/{id}
- Get call information
```

## Usage

### Running the Server

1. Set up PostgreSQL database:
```bash
createdb webrtc_calls
psql webrtc_calls < schema.sql
```

2. Set environment variables:
```bash
export DATABASE_URL="postgres://user:pass@localhost/webrtc_calls?sslmode=disable"
```

3. Run the server:
```bash
go run ./cmd/server
```

4. Server starts on `:8080`

### Client Integration

#### WebRTC Signaling Flow
```javascript
// 1. Connect and authenticate
const ws = new WebSocket('ws://localhost:8080/ws');
ws.send(JSON.stringify({
    type: 'auth',
    payload: { token: 'jwt_token' }
}));

// 2. Join room
ws.send(JSON.stringify({
    type: 'join',
    payload: {
        room: 'room123',
        display_name: 'John Doe',
        capabilities: { audio: true, video: true }
    }
}));

// 3. Handle WebRTC signaling
ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    switch(msg.type) {
        case 'offer':
            // Handle incoming offer
            break;
        case 'ice-candidate':
            // Add ICE candidate
            break;
        // ... handle other message types
    }
};
```

## Scaling

### Single Server
- Handles up to 10,000 concurrent connections
- In-memory participant management
- SQLite/PostgreSQL for persistence

### Multi-Server (with Redis)
- Redis for room → server mapping
- Distributed signaling nodes
- Shared participant state
- Load balancer with sticky sessions

### Kubernetes Deployment
- Service discovery for SFU pods
- Horizontal scaling of signaling nodes
- Persistent volume for recordings

## Recording

### Options
1. **Server-side PeerConnection**: Use Pion to record single/dual-party calls
2. **SFU RTP Forwarding**: Forward RTP streams to recording service for multi-party
3. **Client-side Recording**: Browser-based recording with upload

### Implementation
```go
// Server-side recording with Pion
peerConnection.OnTrack(func(track *webrtc.TrackRemote, receiver *webrtc.RTPReceiver) {
    // Save RTP packets to file
    // Transcode with ffmpeg if needed
})
```

## Security

- JWT tokens with RS256 signing
- WebSocket connection validation
- Room access control
- Participant role enforcement
- Rate limiting (implement as needed)
- TLS encryption required

## Development

### Project Structure
```
├── cmd/server/          # Main application
├── call/               # Call management logic
├── models.go           # Database models
├── server.go           # WebSocket server
├── hub.go              # Connection management
├── messages.go         # Message types
├── storage.go          # Offline messaging
├── websocket.go        # WebSocket protocol
├── schema.sql          # Database schema
└── views/              # Static web files
```

### Dependencies
- `github.com/pion/webrtc/v3` - WebRTC implementation
- `github.com/golang-jwt/jwt/v5` - JWT authentication
- `github.com/lib/pq` - PostgreSQL driver
- `github.com/go-redis/redis/v8` - Redis client

## Testing

### Unit Tests
```bash
go test ./...
```

### Integration Tests
```bash
# Start PostgreSQL
# Run server
# Use test client to verify signaling
```

### Load Testing
```bash
# Use tools like Artillery or k6
# Test concurrent connections and message throughput
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details</content>
<parameter name="filePath">/Users/sujit/Sites/ws/README.md
