package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// Socket wraps a WebSocket connection with additional functionality
type Socket struct {
	ID          string
	conn        *Connection
	hub         *Hub
	properties  map[string]interface{}
	isBanned    bool
	pendingFile *Message
	mu          sync.RWMutex
}

// Hub manages all WebSocket connections and event handlers
type Hub struct {
	sockets        map[string]*Socket
	handlers       map[string][]Handler
	globalHandlers map[string][]Handler
	mu             sync.RWMutex
	connCount      int64
	maxConns       int64
}

// Handler is a function type for event handlers
type Handler func(socket *Socket)

// NewHub creates a new WebSocket hub
func NewHub() *Hub {
	return &Hub{
		sockets:        make(map[string]*Socket),
		handlers:       make(map[string][]Handler),
		globalHandlers: make(map[string][]Handler),
		maxConns:       100000,
	}
}

// NewSocket creates a new socket instance
func (h *Hub) NewSocket(conn *Connection) *Socket {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.connCount >= h.maxConns {
		log.Println("Connection limit reached, rejecting connection")
		conn.conn.Close()
		return nil
	}

	socketID := generateSocketID()
	socket := &Socket{
		ID:         socketID,
		conn:       conn,
		hub:        h,
		properties: make(map[string]interface{}),
		isBanned:   false,
	}

	h.sockets[socketID] = socket
	h.connCount++

	return socket
}

// generateSocketID generates a unique socket ID
func generateSocketID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// Hub methods

// On registers a global event handler
func (h *Hub) On(event string, handler Handler) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.globalHandlers[event] == nil {
		h.globalHandlers[event] = []Handler{}
	}
	h.globalHandlers[event] = append(h.globalHandlers[event], handler)
}

// OnConnect registers a handler for new connections
func (h *Hub) OnConnect(handler Handler) {
	h.On("connect", handler)
}

// OnMessage registers a handler for messages
func (h *Hub) OnMessage(handler Handler) {
	h.On("message", handler)
}

// OnClose registers a handler for connection closes
func (h *Hub) OnClose(handler Handler) {
	h.On("close", handler)
}

// OnDisconnect registers a handler for disconnections
func (h *Hub) OnDisconnect(handler Handler) {
	h.On("disconnect", handler)
}

// Broadcast sends a message to all connected sockets except the sender
func (h *Hub) Broadcast(event string, data interface{}) {
	h.BroadcastExcept(event, data, nil)
}

// BroadcastExcept sends a message to all connected sockets except the specified sender
func (h *Hub) BroadcastExcept(event string, data interface{}, excludeSocket *Socket) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	// Create unified message
	msgType := stringToMsgType(event)
	msg := Message{
		T:    msgType,
		Data: data,
	}

	if jsonData, err := json.Marshal(msg); err == nil {
		sentCount := 0
		for _, socket := range h.sockets {
			if !socket.IsBanned() && socket != excludeSocket {
				socket.conn.writeAsync(jsonData)
				sentCount++
			}
		}
		if excludeSocket != nil {
			log.Printf("Broadcasting type %d to %d clients (excluding sender)", msgType, sentCount)
		} else {
			log.Printf("Broadcasting type %d to %d clients", msgType, sentCount)
		}
	}
}

// BroadcastMessage sends a pre-built unified Message
func (h *Hub) BroadcastMessage(msg Message) {
	h.BroadcastMessageExcept(msg, nil)
}

// BroadcastMessageExcept sends a unified Message excluding the sender
func (h *Hub) BroadcastMessageExcept(msg Message, excludeSocket *Socket) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if jsonData, err := json.Marshal(msg); err == nil {
		sentCount := 0
		for _, socket := range h.sockets {
			if !socket.IsBanned() && socket != excludeSocket {
				socket.conn.writeAsync(jsonData)
				sentCount++
			}
		}
		if excludeSocket != nil {
			log.Printf("Broadcasting message type %d to %d clients (excluding sender)", msg.T, sentCount)
		} else {
			log.Printf("Broadcasting message type %d to %d clients", msg.T, sentCount)
		}
	}
}

// BroadcastBinary sends binary data to all connected sockets except the sender
func (h *Hub) BroadcastBinary(data []byte, excludeSocket *Socket) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	sentCount := 0
	for _, socket := range h.sockets {
		if !socket.IsBanned() && socket != excludeSocket {
			socket.conn.writeBinaryAsync(data)
			sentCount++
		}
	}
	if excludeSocket != nil {
		log.Printf("Broadcasting binary data to %d clients (excluding sender)", sentCount)
	} else {
		log.Printf("Broadcasting binary data to %d clients", sentCount)
	}
}

// Notify sends a message to specific sockets
func (h *Hub) Notify(socketIDs []string, event string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	message := Message{
		T:    stringToMsgType(event),
		Data: data,
	}

	if jsonData, err := json.Marshal(message); err == nil {
		for _, socketID := range socketIDs {
			if socket, exists := h.sockets[socketID]; exists && !socket.IsBanned() {
				socket.conn.writeAsync(jsonData)
			}
		}
	}
}

// Emit sends a message to a single socket
func (h *Hub) Emit(socketID string, event string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if socket, exists := h.sockets[socketID]; exists {
		socket.Send(event, data)
	}
}

// EmitBinary sends binary data to a single socket
func (h *Hub) EmitBinary(socketID string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if socket, exists := h.sockets[socketID]; exists && !socket.IsBanned() {
		socket.conn.writeBinaryAsync(data)
	}
}

// GetSocket gets a socket by ID
func (h *Hub) GetSocket(socketID string) *Socket {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.sockets[socketID]
}

// GetAllSockets returns all connected sockets
func (h *Hub) GetAllSockets() []*Socket {
	h.mu.RLock()
	defer h.mu.RUnlock()

	sockets := make([]*Socket, 0, len(h.sockets))
	for _, socket := range h.sockets {
		sockets = append(sockets, socket)
	}
	return sockets
}

// GetSocketsByProperty returns sockets that have a specific property value
func (h *Hub) GetSocketsByProperty(key string, value interface{}) []*Socket {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var matchingSockets []*Socket
	for _, socket := range h.sockets {
		if socket.GetProperty(key) == value {
			matchingSockets = append(matchingSockets, socket)
		}
	}
	return matchingSockets
}

// RemoveSocket removes a socket from the hub
func (h *Hub) RemoveSocket(socketID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if socket, exists := h.sockets[socketID]; exists {
		delete(h.sockets, socketID)
		h.connCount--
		h.triggerHandlers("disconnect", socket)
	}
}

// BanSocket bans a socket
func (h *Hub) BanSocket(socketID string) {
	if socket := h.GetSocket(socketID); socket != nil {
		socket.Ban()
	}
}

// UnbanSocket unbans a socket
func (h *Hub) UnbanSocket(socketID string) {
	if socket := h.GetSocket(socketID); socket != nil {
		socket.Unban()
	}
}

// CloseSocket closes a socket connection
func (h *Hub) CloseSocket(socketID string) {
	if socket := h.GetSocket(socketID); socket != nil {
		socket.Close()
	}
}

// GetConnectionCount returns the current connection count
func (h *Hub) GetConnectionCount() int64 {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.connCount
}

// triggerHandlers triggers all handlers for a specific event
func (h *Hub) triggerHandlers(event string, socket *Socket) {
	// Trigger global handlers
	if handlers, exists := h.globalHandlers[event]; exists {
		for _, handler := range handlers {
			go handler(socket)
		}
	}

	// Trigger socket-specific handlers
	if handlers, exists := h.handlers[socket.ID]; exists {
		for _, handler := range handlers {
			go handler(socket)
		}
	}
}

// Socket methods

// Ban bans the socket (prevents sending/receiving)
func (s *Socket) Ban() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isBanned = true
}

// Unban unbans the socket
func (s *Socket) Unban() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.isBanned = false
}

// IsBanned checks if socket is banned
func (s *Socket) IsBanned() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isBanned
}

// SetProperty sets a custom property on the socket
func (s *Socket) SetProperty(key string, value interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.properties[key] = value
}

// GetProperty gets a custom property from the socket
func (s *Socket) GetProperty(key string) interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.properties[key]
}

// GetID returns the socket ID
func (s *Socket) GetID() string {
	return s.ID
}

// Close closes the socket connection
func (s *Socket) Close() {
	s.conn.conn.Close()
}
