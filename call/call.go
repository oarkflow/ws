package call

import (
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/oarkflow/ws"
	"github.com/pion/webrtc/v3"
)

// Manager manages WebRTC calls and signaling
type Manager struct {
	db    ws.Database
	hub   *ws.Hub
	rooms map[string]*Room
	peers map[string]*Peer
	mu    sync.RWMutex
	// redis      *RedisClient // For scaling - TODO
}

// Ensure Manager implements ws.CallManager
var _ ws.CallManager = (*Manager)(nil)

// Room represents a call room
type Room struct {
	ID           string
	CallID       uuid.UUID
	Participants map[string]*Peer
	CreatedAt    time.Time
	mu           sync.RWMutex
}

// Peer represents a WebRTC peer in a room
type Peer struct {
	ID          string
	UserID      string
	RoomID      string
	Socket      *ws.Socket
	PeerConn    *webrtc.PeerConnection
	DataChannel *webrtc.DataChannel
	Role        string
	DisplayName string
	JoinedAt    time.Time
	IsMuted     bool
	IsOnHold    bool
}

// msgTypeToString converts numeric message type to string
func msgTypeToString(msgType int) string {
	switch msgType {
	case 16:
		return "auth"
	case 17:
		return "join"
	case 18:
		return "offer"
	case 19:
		return "answer"
	case 20:
		return "ice-candidate"
	case 21:
		return "mute"
	case 22:
		return "unmute"
	case 23:
		return "hold"
	case 24:
		return "dtmf"
	default:
		return "unknown"
	}
}

// NewManager creates a new call manager
func NewManager(db ws.Database, hub *ws.Hub) *Manager {
	return &Manager{
		db:    db,
		hub:   hub,
		rooms: make(map[string]*Room),
		peers: make(map[string]*Peer),
	}
}

// HandleSignalingMessage processes WebRTC signaling messages
func (m *Manager) HandleSignalingMessage(socketID string, msg ws.Message) {
	socket := m.hub.GetSocket(socketID)
	if socket == nil {
		return
	}
	var signalingMsg ws.SignalingMessage
	if data, ok := msg.Data.(map[string]interface{}); ok {
		signalingMsg.Type = data["type"].(string)
		signalingMsg.ID = data["id"].(string)
		signalingMsg.Payload = data["payload"]
	} else {
		// Handle direct message format
		signalingMsg.Type = msgTypeToString(msg.T)
		signalingMsg.ID = msg.ID
		signalingMsg.Payload = msg.Data
	}

	switch signalingMsg.Type {
	case "auth":
		m.handleAuth(socket, signalingMsg)
	case "join":
		m.handleJoin(socket, signalingMsg)
	case "offer":
		m.handleOffer(socket, signalingMsg)
	case "answer":
		m.handleAnswer(socket, signalingMsg)
	case "ice-candidate":
		m.handleICECandidate(socket, signalingMsg)
	case "mute", "unmute":
		m.handleMute(socket, signalingMsg)
	case "hold":
		m.handleHold(socket, signalingMsg)
	case "dtmf":
		m.handleDTMF(socket, signalingMsg)
	}
}

// handleAuth handles authentication
func (m *Manager) handleAuth(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.AuthPayload)

	// Validate JWT token
	userID, err := m.validateToken(payload.Token)
	if err != nil {
		m.sendError(socket, "Invalid token")
		return
	}

	// Store user ID in socket properties
	socket.SetProperty("user_id", userID)

	// Send success response
	response := ws.Message{
		T: ws.MsgAck,
		Data: map[string]interface{}{
			"status":  "authenticated",
			"user_id": userID,
		},
	}
	socket.SendMessage(response)
}

// handleJoin handles room joining
func (m *Manager) handleJoin(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.JoinPayload)

	userID := socket.GetProperty("user_id")
	if userID == nil {
		m.sendError(socket, "Not authenticated")
		return
	}

	// Create or get room
	room := m.getOrCreateRoom(payload.Room)

	// Create peer
	peer := &Peer{
		ID:          socket.ID,
		UserID:      userID.(string),
		RoomID:      payload.Room,
		Socket:      socket,
		Role:        "participant", // Default role
		DisplayName: payload.DisplayName,
		JoinedAt:    time.Now(),
		IsMuted:     false,
		IsOnHold:    false,
	}

	// Add peer to room
	room.mu.Lock()
	room.Participants[socket.ID] = peer
	room.mu.Unlock()

	// Store peer
	m.mu.Lock()
	m.peers[socket.ID] = peer
	m.mu.Unlock()

	// Add participant to database
	if m.db != nil {
		_, err := m.db.AddParticipant(room.CallID, userID.(string), peer.Role, "", payload.Capabilities)
		if err != nil {
			log.Printf("Error adding participant: %v", err)
		}
	}

	// Send joined message
	roomState := m.getRoomState(room)
	joinedMsg := ws.Message{
		T: ws.MsgJoined,
		Data: map[string]interface{}{
			"participant_id": socket.ID,
			"room_state":     roomState,
		},
	}
	socket.SendMessage(joinedMsg)

	// Notify other participants
	peerJoinedMsg := ws.Message{
		T: ws.MsgPeerJoined,
		Data: map[string]interface{}{
			"participant": ws.ParticipantInfo{
				ID:          peer.ID,
				UserID:      peer.UserID,
				DisplayName: peer.DisplayName,
				Role:        peer.Role,
			},
		},
	}
	m.broadcastToRoomExceptPtr(room, peerJoinedMsg, socket.ID)
}

// handleOffer handles WebRTC offer
func (m *Manager) handleOffer(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.SDPPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	// Forward offer to other participants in the room
	offerMsg := ws.Message{
		T: ws.MsgOffer,
		Data: map[string]interface{}{
			"sdp":     payload.SDP,
			"call_id": payload.CallID,
			"from":    socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, offerMsg, socket.ID)
}

// handleAnswer handles WebRTC answer
func (m *Manager) handleAnswer(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.SDPPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	// Forward answer to the target participant
	answerMsg := ws.Message{
		T: ws.MsgAnswer,
		Data: map[string]interface{}{
			"sdp":     payload.SDP,
			"call_id": payload.CallID,
			"from":    socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, answerMsg, socket.ID)
}

// handleICECandidate handles ICE candidates
func (m *Manager) handleICECandidate(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.ICEPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	// Forward ICE candidate to other participants
	iceMsg := ws.Message{
		T: ws.MsgIceCandidate,
		Data: map[string]interface{}{
			"candidate":     payload.Candidate,
			"sdpMid":        payload.SDPMid,
			"sdpMLineIndex": payload.SDPMLineIndex,
			"from":          socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, iceMsg, socket.ID)
}

// handleMute handles mute/unmute
func (m *Manager) handleMute(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.ControlPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	isMuted := (msg.Type == "mute")
	peer.IsMuted = isMuted

	// Broadcast mute status
	muteMsg := ws.Message{
		T: ws.MsgMute,
		Data: map[string]interface{}{
			"call_id": payload.CallID,
			"track":   payload.Track,
			"muted":   isMuted,
			"from":    socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, muteMsg, socket.ID)
}

// handleHold handles call hold
func (m *Manager) handleHold(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.ControlPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	peer.IsOnHold = true

	// Broadcast hold status
	holdMsg := ws.Message{
		T: ws.MsgHold,
		Data: map[string]interface{}{
			"call_id": payload.CallID,
			"track":   payload.Track,
			"from":    socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, holdMsg, socket.ID)
}

// handleDTMF handles DTMF tones
func (m *Manager) handleDTMF(socket *ws.Socket, msg ws.SignalingMessage) {
	payload := msg.Payload.(ws.DTMFPayload)

	peer := m.getPeer(socket.ID)
	if peer == nil {
		return
	}

	// Forward DTMF to other participants
	dtmfMsg := ws.Message{
		T: ws.MsgDTMF,
		Data: map[string]interface{}{
			"call_id": payload.CallID,
			"tones":   payload.Tones,
			"from":    socket.ID,
		},
	}
	m.broadcastToRoomExcept(peer.RoomID, dtmfMsg, socket.ID)
}

// HandleDisconnect handles peer disconnection
func (m *Manager) HandleDisconnect(socketID string) {
	peer := m.getPeer(socketID)
	if peer == nil {
		return
	}

	// Update database
	if m.db != nil {
		currentRoom := m.getRoom(peer.RoomID)
		if currentRoom != nil {
			participants, err := m.db.GetParticipants(currentRoom.CallID)
			if err == nil {
				for _, p := range participants {
					if p.UserID == peer.UserID {
						m.db.UpdateParticipantLeft(p.ID)
						break
					}
				}
			}
		}
	}

	// Remove from room
	room := m.getRoom(peer.RoomID)
	if room != nil {
		room.mu.Lock()
		delete(room.Participants, socketID)
		room.mu.Unlock()

		// Notify others
		peerLeftMsg := ws.Message{
			T: ws.MsgPeerLeft,
			Data: map[string]interface{}{
				"participant_id": socketID,
			},
		}
		m.broadcastToRoomExceptPtr(room, peerLeftMsg, socketID)

		// If room is empty, clean up
		if len(room.Participants) == 0 {
			m.mu.Lock()
			delete(m.rooms, peer.RoomID)
			m.mu.Unlock()
		}
	}

	// Remove peer
	m.mu.Lock()
	delete(m.peers, socketID)
	m.mu.Unlock()
}

// Helper methods

func (m *Manager) getOrCreateRoom(roomID string) *Room {
	m.mu.Lock()
	defer m.mu.Unlock()

	if room, exists := m.rooms[roomID]; exists {
		return room
	}

	// Create new call in database
	var callID uuid.UUID
	if m.db != nil {
		call, err := m.db.CreateCall(roomID)
		if err != nil {
			log.Printf("Error creating call: %v", err)
			return nil
		}
		callID = call.ID
	} else {
		callID = uuid.New()
	}

	room := &Room{
		ID:           roomID,
		CallID:       callID,
		Participants: make(map[string]*Peer),
		CreatedAt:    time.Now(),
	}

	m.rooms[roomID] = room
	return room
}

func (m *Manager) getRoom(roomID string) *Room {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.rooms[roomID]
}

func (m *Manager) getPeer(socketID string) *Peer {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.peers[socketID]
}

func (m *Manager) broadcastToRoomExceptPtr(room *Room, msg ws.Message, excludeSocketID string) {
	room.mu.RLock()
	defer room.mu.RUnlock()

	for socketID, peer := range room.Participants {
		if socketID != excludeSocketID {
			peer.Socket.SendMessage(msg)
		}
	}
}

func (m *Manager) broadcastToRoomExcept(roomID string, msg ws.Message, excludeSocketID string) {
	room := m.getRoom(roomID)
	if room != nil {
		m.broadcastToRoomExceptPtr(room, msg, excludeSocketID)
	}
}

func (m *Manager) getRoomState(room *Room) ws.RoomState {
	room.mu.RLock()
	defer room.mu.RUnlock()

	var participants []ws.ParticipantInfo
	for _, peer := range room.Participants {
		participants = append(participants, ws.ParticipantInfo{
			ID:          peer.ID,
			UserID:      peer.UserID,
			DisplayName: peer.DisplayName,
			Role:        peer.Role,
		})
	}

	return ws.RoomState{
		RoomID:       room.ID,
		Participants: participants,
		CallID:       room.CallID,
		Status:       "active",
	}
}

func (m *Manager) sendError(socket *ws.Socket, message string) {
	errorMsg := ws.Message{
		T: ws.MsgError,
		Data: map[string]interface{}{
			"message": message,
		},
	}
	socket.SendMessage(errorMsg)
}

func (m *Manager) validateToken(token string) (string, error) {
	// Placeholder JWT validation
	// In real implementation, validate JWT and return user ID
	return "user123", nil
}
