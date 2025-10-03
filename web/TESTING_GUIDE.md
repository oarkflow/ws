# Testing Guide - WebSocket Chat & WebRTC Call Application

## 🎯 Overview
This document provides comprehensive testing procedures for both the WebSocket Chat and WebRTC Call features.

## 🔧 Prerequisites

### Backend Server
```bash
cd /Users/sujit/Sites/ws
go run cmd/server/main.go
```
- Server runs on: `http://localhost:8080`
- WebSocket endpoint: `ws://localhost:8080/ws`
- Authentication: Optional (demo mode enabled)

### Frontend Application
```bash
cd /Users/sujit/Sites/ws/web
npm run dev
```
- Application runs on: `http://localhost:5173`
- Chat interface: `http://localhost:5173/`
- Call interface: `http://localhost:5173/call`

## 📋 WebSocket Chat Testing

### ✅ Test 1: Connection & Authentication
**Status: VERIFIED** ✓

**Test Steps:**
1. Open `http://localhost:5173/` in browser
2. Click "Connect" button
3. Observe connection status indicator (green dot)

**Expected Results:**
- Connection status shows green dot
- Toast notification: "Connected to WebSocket server"
- Server logs: `Client connected: [socket_id]`

**Backend Verification:**
```bash
tail -f /Users/sujit/Sites/ws/server.log | grep "Client connected"
```

---

### ✅ Test 2: Broadcast Messages
**Status: VERIFIED** ✓

**Test Steps:**
1. Select "Broadcast" message type
2. Type a message in the input field
3. Press Enter or click Send
4. Open another browser tab/window
5. Connect and observe messages

**Expected Results:**
- Message appears in both tabs with blue globe icon
- Message stats show incremented broadcast count
- Server logs: `Received message: type=1 (broadcast)`

**Message Type:** `1` (MsgBroadcast)

---

### ✅ Test 3: Direct Messages
**Status: VERIFIED** ✓

**Test Steps:**
1. Open two browser tabs (Tab A and Tab B)
2. Connect both tabs
3. In Tab A: Set alias to "Alice"
4. In Tab B: Set alias to "Bob"
5. In Tab A: Select "Direct" message type
6. Select "Bob" from recipient dropdown
7. Send message

**Expected Results:**
- Message shows green user icon in both tabs
- Only "Bob" receives the message (not other users)
- Message stats show incremented direct count
- Server logs: `Received message: type=12 (direct)`

**Message Type:** `12` (MsgDirect)

**Backend Verification:**
```bash
# Server logs show type=12 messages
tail -f server.log | grep "type=12"
```
✓ **Confirmed in logs:** `type=12 (direct)` messages appearing

---

### ✅ Test 4: Topic/PubSub System
**Status: VERIFIED** ✓

**Test Steps:**
1. Subscribe to topic "sports"
2. In another tab, subscribe to "sports" and "news"
3. Publish message to "sports" topic
4. Publish message to "news" topic

**Expected Results:**
- Both tabs receive "sports" messages
- Only second tab receives "news" messages
- Purple hash icon for topic messages
- Subscriptions list shows active topics with unsubscribe buttons

**Message Types:**
- `4` (MsgSubscribe) - Subscribe to topic
- `5` (MsgUnsubscribe) - Unsubscribe from topic
- Topic messages use broadcast with topic field

---

### ✅ Test 5: Typing Indicators
**Status: VERIFIED** ✓

**Test Steps:**
1. Open two tabs, connect both
2. In Tab A: Start typing (don't send)
3. Observe Tab B

**Expected Results:**
- Tab B shows "Someone is typing..." in italic gray text
- Indicator disappears 1 second after typing stops
- Server logs: `Received message: type=11 (typing)`

**Message Type:** `11` (MsgTyping)

**Backend Verification:**
```bash
tail -f server.log | grep "type=11"
```
✓ **Confirmed in logs:** Multiple `type=11 (typing)` messages appearing

---

### ✅ Test 6: File Transfer
**Status: READY FOR TESTING**

**Test Steps:**
1. Click the file upload button
2. Select a file (e.g., image, PDF)
3. Click "Send File"
4. In another tab, click download link

**Expected Results:**
- File size displayed during upload
- Message shows file icon and metadata
- Download link works in recipient tab
- File transferred via ArrayBuffer (binary)

**Message Type:** `10` (MsgFile)

**Implementation Details:**
- Binary data sent as ArrayBuffer
- Metadata sent as JSON first
- Blob URL created for download

---

### ✅ Test 7: User Management
**Status: VERIFIED** ✓

**Test Steps:**
1. Connect to server
2. Set alias: "TestUser"
3. Click "Refresh User List"
4. Open second tab and connect

**Expected Results:**
- User list updates automatically
- Current user shows "(Me)" label with blue highlight
- Alias changes trigger system messages
- User list shows all connected users

**Message Types:**
- `14` (MsgUserList) - Request/receive user list
- `15` (MsgSetAlias) - Set user alias
- `3` (MsgSystem) - System notifications

---

### ✅ Test 8: System Messages
**Status: VERIFIED** ✓

**Test Steps:**
1. Connect/disconnect users
2. Change user alias
3. Observe toast notifications

**Expected Results:**
- Welcome message on connect
- "User connected" toast when peer joins
- "User disconnected" toast when peer leaves
- "Alias changed" toast when user updates name
- System messages appear in message log with gray color

**Message Type:** `3` (MsgSystem)

---

### ✅ Test 9: Ping/Pong
**Status: READY FOR TESTING**

**Test Steps:**
1. Click "Ping Server" button
2. Observe response

**Expected Results:**
- Pong response received
- Round-trip time displayed
- Server logs both ping and pong

**Message Types:**
- `6` (MsgPing) - Ping request
- `7` (MsgPong) - Pong response

---

## 🎥 WebRTC Call Testing

### ✅ Test 10: Setup Screen
**Status: READY FOR TESTING**

**Test Steps:**
1. Navigate to `http://localhost:5173/call`
2. Enter display name
3. Optionally enter room ID (or leave blank for auto-generate)
4. Check/uncheck audio and video options
5. Click "Join Call"

**Expected Results:**
- Room ID auto-generates if blank
- Join button disabled until display name entered
- Media permissions requested
- Loading spinner during connection
- Success tone plays on connect

**Message Types:**
- `16` (MsgAuth) - Authentication
- `17` (MsgJoin) - Join room request

---

### ✅ Test 11: Room & Participant Management
**Status: READY FOR TESTING**

**Test Steps:**
1. User A joins room "test-room"
2. User B joins same room "test-room"
3. User C joins different room "other-room"

**Expected Results:**
- User A and B see each other in participants panel
- User C doesn't see A or B
- Participant count updates in header
- Avatar circles show first letter of display name
- "(You)" label on local user

**Message Types:**
- `25` (MsgJoined) - Successfully joined
- `26` (MsgPeerJoined) - Another peer joined
- `27` (MsgPeerLeft) - Peer disconnected

**Backend Verification:**
```go
// Call manager tracks rooms and peers
type Room struct {
    ID           string
    Participants map[string]*Peer
}
```

---

### ✅ Test 12: Video Streaming
**Status: READY FOR TESTING**

**Test Steps:**
1. Two users join same room
2. Observe video streams

**Expected Results:**
- Local video shows in bottom-right PiP (48x36)
- Remote videos show in responsive grid
- Grid adjusts: 1 column (1 user), 2 columns (2-4 users), 3 columns (5+ users)
- Participant names overlay on videos
- Videos autoplay with proper aspect ratio

**Message Types:**
- `18` (MsgOffer) - SDP offer
- `19` (MsgAnswer) - SDP answer
- `20` (MsgIceCandidate) - ICE candidate exchange

**Technical Details:**
- Media constraints: `{ video: { width: 1280, height: 720 }, audio: true }`
- STUN servers: `stun.l.google.com:19302`
- RTCPeerConnection for each peer

---

### ✅ Test 13: Audio/Video Controls
**Status: READY FOR TESTING**

**Test Steps:**
1. Click microphone button to mute/unmute
2. Click video button to disable/enable camera
3. Observe remote peer's view

**Expected Results:**
- Mute: Red background, MicOff icon, audio track disabled
- Unmute: Gray background, Mic icon, audio track enabled
- Video Off: Red background, VideoOff icon, video track disabled
- Video On: Gray background, Video icon, video track enabled
- Remote peer sees visual indicators

**Message Types:**
- `21` (MsgMute) - Muted audio
- `22` (MsgUnmute) - Unmuted audio

**Implementation:**
```typescript
toggleMute() {
    audioTrack.enabled = !audioTrack.enabled;
    sendSignalingMessage(isMuted ? MSG_TYPES.MUTE : MSG_TYPES.UNMUTE);
}
```

---

### ✅ Test 14: Screen Sharing
**Status: READY FOR TESTING**

**Test Steps:**
1. Click screen share button (Monitor icon)
2. Select screen/window to share
3. Click again to stop sharing

**Expected Results:**
- Share: Red background, fullscreen overlay, screen content visible to all
- Remote peers see screen instead of camera
- Stop button (X) in top-right of shared screen
- Automatically stops if user cancels share dialog
- Reverts to camera video on stop

**Technical Implementation:**
```typescript
getDisplayMedia({ video: { width: 1920, height: 1080 } })
sender.replaceTrack(screenTrack) // Replace in peer connections
```

---

### ✅ Test 15: Call Recording
**Status: READY FOR TESTING**

**Test Steps:**
1. Click record button (Circle icon)
2. Wait 10 seconds
3. Click again to stop recording
4. Download recorded file

**Expected Results:**
- Recording: Red background, white pulsing circle icon
- Not Recording: Gray background, static circle icon
- Recording starts immediately
- Stop triggers blob creation
- Auto-download as WebM file
- Server notification sent

**Message Types:**
- `29` (MsgRecordingStarted) - Recording began
- `30` (MsgRecordingFinished) - Recording completed

**Technical Implementation:**
```typescript
MediaRecorder(localStream, { mimeType: 'video/webm;codecs=vp9' })
recordedChunks -> Blob -> Download URL
```

---

### ✅ Test 16: In-Call Chat
**Status: READY FOR TESTING**

**Test Steps:**
1. During active call, click chat button (MessageCircle icon)
2. Type message and press Enter
3. Observe chat panel slide in from right
4. Check other participant's chat panel

**Expected Results:**
- Chat panel slides in from right (80px wide)
- Messages show sender name and timestamp
- Blue sender name for self, white for others
- Enter key sends message
- Chat history persists during call
- Close button (X) hides panel

**Message Type:** `36` (CHAT - Custom type for in-call text)

**Implementation:**
```typescript
sendChatMessage(message: string) {
    sendSignalingMessage(MSG_TYPES.CHAT, { message, sender: displayName });
}
```

---

### ✅ Test 17: Audio Tones
**Status: READY FOR TESTING**

**Test Steps:**
1. Connect to call - listen for success tone
2. Disconnect - listen for end call tone

**Expected Results:**
- **Success Tone:** 880Hz + 1108.73Hz sequence
- **Calling Tone:** 800Hz beep every 2 seconds
- **Ringtone:** Alternating 800Hz/1200Hz every 800ms
- **End Call Tone:** Descending 800/600/400Hz
- Audio context auto-resumes on user interaction

**Implementation:**
```typescript
class AudioToneManager {
    playSuccessTone() // 2-tone beep
    playCallingTone() // Repeated 800Hz
    playRingtone()    // Alternating tones
    playEndCallTone() // 3-tone descend
}
```

---

### ✅ Test 18: Error Handling
**Status: READY FOR TESTING**

**Test Steps:**
1. Deny camera/microphone permissions
2. Try to join call with invalid room ID
3. Disconnect during active call
4. Attempt screen share without permissions

**Expected Results:**
- Error modal displays with clear message
- Red AlertCircle icon shown
- Close button dismisses modal
- Appropriate error logged to console
- ErrorBoundary catches React errors

**Components:**
- `<ErrorModal />` - Display errors
- `<ErrorBoundary />` - Catch React errors
- Error states in useWebRTC hook

---

## 🔍 Backend Message Type Reference

### Chat Messages (1-15)
```go
const (
    MsgBroadcast   = 1  // Broadcast to all users
    MsgPrivate     = 2  // Private message (deprecated, use MsgDirect)
    MsgSystem      = 3  // System message
    MsgSubscribe   = 4  // Subscribe to topic
    MsgUnsubscribe = 5  // Unsubscribe from topic
    MsgPing        = 6  // Ping server
    MsgPong        = 7  // Pong response
    MsgError       = 8  // Error message
    MsgAck         = 9  // Acknowledgment
    MsgFile        = 10 // File transfer
    MsgTyping      = 11 // Typing indicator
    MsgDirect      = 12 // Direct message
    MsgThread      = 13 // Threaded message
    MsgUserList    = 14 // User list request/response
    MsgSetAlias    = 15 // Set user alias
)
```

### WebRTC Messages (16-35)
```go
const (
    MsgAuth              = 16 // Authentication
    MsgJoin              = 17 // Join room
    MsgOffer             = 18 // SDP offer
    MsgAnswer            = 19 // SDP answer
    MsgIceCandidate      = 20 // ICE candidate
    MsgMute              = 21 // Mute audio
    MsgUnmute            = 22 // Unmute audio
    MsgHold              = 23 // Put on hold
    MsgDTMF              = 24 // DTMF tone
    MsgJoined            = 25 // Successfully joined
    MsgPeerJoined        = 26 // Peer joined room
    MsgPeerLeft          = 27 // Peer left room
    MsgCallStateChanged  = 28 // Call state changed
    MsgRecordingStarted  = 29 // Recording started
    MsgRecordingFinished = 30 // Recording finished
    // Direct calling (31-35) defined but not yet implemented
)
```

### Custom Frontend Types
```typescript
const MSG_TYPES = {
    // ... (16-30 same as backend)
    DIRECT_CALL_INVITE: 31,
    DIRECT_CALL_ACCEPT: 32,
    DIRECT_CALL_REJECT: 33,
    DIRECT_CALL_END: 34,
    DIRECT_CALL_RINGING: 35,
    CHAT: 36, // In-call text chat
};
```

---

## ✅ Current Test Status

### Chat Features - VERIFIED
- [x] Connection & authentication
- [x] Broadcast messages
- [x] Direct messages (Type 12 confirmed in logs)
- [x] Topic/PubSub
- [x] Typing indicators (Type 11 confirmed in logs)
- [ ] File transfer (ready to test)
- [x] User management
- [x] System messages
- [ ] Ping/pong (ready to test)

### Call Features - READY FOR TESTING
- [ ] Setup screen
- [ ] Room & participant management
- [ ] Video streaming
- [ ] Audio/video controls
- [ ] Screen sharing
- [ ] Call recording
- [ ] In-call chat
- [ ] Audio tones
- [ ] Error handling

---

## 🚀 Quick Test Commands

### Terminal 1: Start Backend
```bash
cd /Users/sujit/Sites/ws
go run cmd/server/main.go
```

### Terminal 2: Start Frontend
```bash
cd /Users/sujit/Sites/ws/web
npm run dev
```

### Terminal 3: Monitor Logs
```bash
tail -f /Users/sujit/Sites/ws/server.log
```

### Check Specific Message Types
```bash
# Chat messages
grep "type=1\|type=11\|type=12" server.log

# WebRTC messages
grep "type=16\|type=17\|type=18" server.log
```

---

## 📊 Test Results Summary

### WebSocket Chat
- **Connection**: ✅ Working (Server logs confirm)
- **Typing**: ✅ Working (Type 11 messages seen)
- **Direct Messages**: ✅ Working (Type 12 messages seen)
- **UI**: ✅ Loads correctly at localhost:5173

### WebRTC Call
- **Backend**: ✅ CallManager configured
- **Message Routing**: ✅ Types 16+ routed to CallManager
- **Frontend**: ✅ Components built and compiled
- **Testing**: 🔄 Ready for live testing

---

## 🐛 Known Issues & Notes

1. **Database**: Running without persistence (DATABASE_URL not set)
   - This is intentional for demo/testing
   - All data is in-memory only

2. **Authentication**: Disabled for demo
   - Token validation commented out in server.go
   - Any client can connect

3. **CORS**: May need configuration for production
   - Currently open for development

4. **WebRTC**: Requires HTTPS for production
   - localhost works fine for testing
   - Production needs SSL/TLS

---

## 📝 Next Steps

1. **Complete Chat Testing**
   - Test file transfer functionality
   - Test ping/pong across multiple tabs
   - Verify topic subscriptions with 3+ users

2. **Begin Call Testing**
   - Test 2-person video call
   - Test screen sharing
   - Test recording functionality
   - Test in-call chat

3. **Cross-Browser Testing**
   - Chrome vs Firefox vs Safari
   - Mobile browsers (iOS Safari, Chrome Mobile)

4. **Performance Testing**
   - 5+ participants in video call
   - Large file transfers
   - Long-running connections

5. **Error Scenarios**
   - Network interruptions
   - Permission denials
   - Invalid room IDs
   - Malformed messages

---

## 📚 Additional Resources

- **React Documentation**: https://react.dev
- **WebRTC API**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- **WebSocket API**: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **Tailwind CSS**: https://tailwindcss.com
- **Lucide Icons**: https://lucide.dev

---

**Last Updated**: October 3, 2025
**Version**: 1.0.0
**Status**: Production-Ready for Testing
