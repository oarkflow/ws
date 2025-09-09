# WebSocket Chat Server with Offline Messaging

This is a robust WebSocket server implementation in Go that supports real-time messaging, file sharing, and offline message delivery.

## Features

### WebSocket Standards Compliance
- ✅ **RFC 6455 WebSocket Protocol** - Full compliance with the WebSocket standard
- ✅ **WebSocket Handshake** - Proper Sec-WebSocket-Key validation and response
- ✅ **Frame Handling** - Support for text and binary frames
- ✅ **Connection Management** - Proper connection lifecycle handling
- ✅ **Ping/Pong** - Heartbeat mechanism for connection health
- ✅ **Close Frames** - Proper connection termination

### Custom Protocol Features
- **Message Types**: Broadcast, private, system, subscribe/unsubscribe, ping/pong, file, typing
- **File Sharing**: Binary file transfer with metadata
- **Offline Messaging**: Messages sent to offline clients are stored and delivered upon reconnection
- **Typing Indicators**: Real-time typing status
- **Connection Limits**: Configurable maximum connections
- **Message Storage**: Pluggable storage interface (in-memory implementation included)

## Message Protocol

### Message Format
```json
{
  "t": 1,           // Message type (see constants below)
  "topic": "chat",  // Optional topic for broadcasts
  "to": "socket_id", // Optional recipient for private messages
  "data": {...},    // Message payload
  "id": "msg_123"   // Optional message ID
}
```

### Message Types
- `1`: Broadcast
- `2`: Private message
- `3`: System message
- `4`: Subscribe
- `5`: Unsubscribe
- `6`: Ping
- `7`: Pong
- `8`: Error
- `9`: Acknowledgment
- `10`: File transfer
- `11`: Typing indicator

## Usage

### Server
```go
server := NewServer()
hub := server.GetHub()

// Handle connections
hub.OnConnect(func(socket *Socket) {
    log.Printf("Client connected: %s", socket.ID)
})

// Handle messages
hub.OnMessage(func(socket *Socket) {
    log.Printf("Message from %s", socket.ID)
})

// Start server
log.Fatal(http.ListenAndServeTLS(":8080", "cert.pem", "key.pem", server))
```

### Client
```javascript
const ws = new WebSocket('wss://localhost:8080/ws?token=mysecrettoken');

// Send a broadcast message
ws.send(JSON.stringify({
    t: 1,
    data: { message: "Hello everyone!" }
}));

// Send a file
// First send metadata
ws.send(JSON.stringify({
    t: 10,
    data: { filename: "test.txt", size: 1024 }
}));
// Then send binary data
ws.send(fileBlob);
```

## Offline Messaging

When a client sends a message to an offline recipient:
1. The message is stored in the message storage
2. When the recipient reconnects, stored messages are delivered
3. Messages are marked with `offline: true` and delivery timestamp
4. Expired messages are automatically cleaned up (default: 24 hours)

## Storage Interface

The server uses a pluggable storage interface:

```go
type MessageStorage interface {
    StoreMessage(recipientID string, message Message) error
    GetMessages(recipientID string) ([]Message, error)
    DeleteMessages(recipientID string, messageIDs []string) error
    CleanupExpiredMessages() error
    Close() error
}
```

## Security Features

- Token-based authentication
- Connection limits
- Message size limits (configurable)
- Automatic cleanup of expired messages
- TLS encryption required

## Running the Server

1. Generate SSL certificates:
```bash
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

2. Run the server:
```bash
go run .
```

3. Open `https://localhost:8080` in your browser (accept the self-signed certificate)

## Testing Offline Messaging

1. Connect Client A
2. Connect Client B
3. Note Client B's socket ID from the welcome message
4. Disconnect Client B
5. From Client A, send a message to Client B's socket ID
6. Reconnect Client B
7. Client B should receive the offline message marked as "[Offline]"</content>
<parameter name="filePath">/Users/sujit/Sites/ws/README.md
