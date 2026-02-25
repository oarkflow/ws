package ws

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
	properties  map[string]any
	isBanned    bool
	pendingFile *Message
	alias       string
	mu          sync.RWMutex
}

// Hub manages all WebSocket connections and event handlers
type Hub struct {
	sockets        map[string]*Socket
	userSockets    map[string]*Socket // Track one socket per user
	handlers       map[string][]Handler
	globalHandlers map[string][]Handler
	mu             sync.RWMutex
	connCount      int64
	maxConns       int64
	storage        MessageStorage
}

// Handler is a function type for event handlers
type Handler func(socket *Socket)

// NewHub creates a new WebSocket hub
func NewHub(storage MessageStorage) *Hub {
	if storage == nil {
		storage = NewInMemoryMessageStorage(24 * time.Hour)
	}
	return &Hub{
		sockets:        make(map[string]*Socket),
		userSockets:    make(map[string]*Socket),
		handlers:       make(map[string][]Handler),
		globalHandlers: make(map[string][]Handler),
		maxConns:       100000,
		storage:        storage,
	}
}

func (h *Hub) Storage() MessageStorage {
	return h.storage
}

// NewSocket creates a new socket instance
func (h *Hub) NewSocket(conn *Connection, userToken string) *Socket {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.connCount >= h.maxConns {
		log.Println("Connection limit reached, rejecting connection")
		conn.conn.Close()
		return nil
	}

	// Check if user already has an active connection
	if userToken != "" {
		if existingSocket, exists := h.userSockets[userToken]; exists {
			// Try to detect if the existing connection is truly alive
			// For now, we'll be more lenient: forcibly close the old connection
			// and allow the new one to prevent reconnection loops
			log.Printf("User %s has an existing connection, forcibly closing old connection and accepting new one", userToken)

			// Close the old connection
			if existingSocket.conn != nil && existingSocket.conn.conn != nil {
				existingSocket.conn.conn.Close()
			}

			// Clean up old socket
			delete(h.sockets, existingSocket.ID)
			delete(h.userSockets, userToken)
			h.connCount--
		}
	}

	socketID := generateSocketID()
	socket := &Socket{
		ID:         socketID,
		conn:       conn,
		hub:        h,
		properties: make(map[string]any),
		isBanned:   false,
	}

	// Store socket by user token for connection limiting
	if userToken != "" {
		h.userSockets[userToken] = socket
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
func (h *Hub) Broadcast(event string, data any) {
	h.BroadcastExcept(event, data, nil)
}

// BroadcastExcept sends a message to all connected sockets except the specified sender
func (h *Hub) BroadcastExcept(event string, data any, excludeSocket *Socket) {
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
			if !socket.IsBanned() {
				// If this is a topic message, only send to subscribers (excluding sender)
				if msg.Topic != "" && msg.Topic != "general" {
					if socket == excludeSocket || !socket.conn.IsSubscribed(msg.Topic) {
						continue // Skip this client if not subscribed to the topic or is the sender
					}
				} else if socket == excludeSocket {
					// For non-topic messages, exclude the sender
					continue
				}
				socket.conn.writeAsync(jsonData)
				sentCount++
			}
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

// BroadcastBinaryToAll sends binary data to all connected sockets including the sender
func (h *Hub) BroadcastBinaryToAll(data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	sentCount := 0
	for _, socket := range h.sockets {
		if !socket.IsBanned() {
			socket.conn.writeBinaryAsync(data)
			sentCount++
		}
	}
	log.Printf("Broadcasting binary data to %d clients (including sender)", sentCount)
}

// Notify sends a message to specific sockets
func (h *Hub) Notify(socketIDs []string, event string, data any) {
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
func (h *Hub) Emit(socketID string, event string, data any) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if socket, exists := h.sockets[socketID]; exists {
		socket.Send(event, data)
	} else {
		// Client is offline, store the message
		msgType := stringToMsgType(event)
		message := Message{
			T:    msgType,
			Data: data,
			ID:   generateMessageID(),
		}
		h.storage.StoreMessage(socketID, message)
	}
}

// EmitBinary sends binary data to a single socket
func (h *Hub) EmitBinary(socketID string, data []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if socket, exists := h.sockets[socketID]; exists && !socket.IsBanned() {
		socket.conn.writeBinaryAsync(data)
	} else {
		// Client is offline, store the binary message
		message := Message{
			T:    MsgFile,
			Data: data,
			ID:   generateMessageID(),
		}
		h.storage.StoreMessage(socketID, message)
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
func (h *Hub) GetSocketsByProperty(key string, value any) []*Socket {
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

// DeliverOfflineMessages sends stored messages to a newly connected socket
func (h *Hub) DeliverOfflineMessages(socket *Socket) error {
	messages, err := h.storage.GetMessages(socket.ID)
	if err != nil {
		return err
	}

	messageIDs := make([]string, 0, len(messages))
	for _, msg := range messages {
		if msg.ID != "" {
			messageIDs = append(messageIDs, msg.ID)
		}

		// Mark message as offline and add delivery timestamp
		offlineMsg := msg
		if offlineMsg.Data == nil {
			offlineMsg.Data = make(map[string]any)
		}
		if dataMap, ok := offlineMsg.Data.(map[string]any); ok {
			dataMap["offline"] = true
			dataMap["delivered_at"] = time.Now().Unix()
		}

		socket.SendMessage(offlineMsg)
	}

	// Delete delivered messages
	if len(messageIDs) > 0 {
		return h.storage.DeleteMessages(socket.ID, messageIDs)
	}

	return nil
}

// RemoveSocket removes a socket from the hub
func (h *Hub) RemoveSocket(socketID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if socket, exists := h.sockets[socketID]; exists {
		delete(h.sockets, socketID)
		h.connCount--

		// Also remove from userSockets map if it exists there
		for userToken, userSocket := range h.userSockets {
			if userSocket.ID == socketID {
				delete(h.userSockets, userToken)
				log.Printf("Removed user token mapping for socket %s", socketID)
				break
			}
		}

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

// GetAllTopics returns a list of all active topics across all connections
func (h *Hub) GetAllTopics() []string {
	h.mu.RLock()
	defer h.mu.RUnlock()

	topicSet := make(map[string]bool)
	for _, socket := range h.sockets {
		if !socket.IsBanned() {
			subs := socket.conn.GetSubscriptions()
			for topic := range subs {
				topicSet[topic] = true
			}
		}
	}

	topics := make([]string, 0, len(topicSet))
	for topic := range topicSet {
		topics = append(topics, topic)
	}
	return topics
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
func (s *Socket) SetProperty(key string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.properties[key] = value
}

// GetProperty gets a custom property from the socket
func (s *Socket) GetProperty(key string) any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.properties[key]
}

// GetAlias returns the socket's alias
func (s *Socket) GetAlias() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.alias == "" {
		return s.ID[:12] // Return first 12 chars of ID if no alias
	}
	return s.alias
}

// SetAlias sets the socket's alias
func (s *Socket) SetAlias(alias string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.alias = alias
}

// GetUserList returns a list of all connected users with their aliases
func (h *Hub) GetUserList() []map[string]any {
	h.mu.RLock()
	defer h.mu.RUnlock()

	users := make([]map[string]any, 0, len(h.sockets))
	for _, socket := range h.sockets {
		if !socket.IsBanned() {
			user := map[string]any{
				"id":    socket.ID,
				"alias": socket.GetAlias(),
			}
			users = append(users, user)
		}
	}
	return users
}

// GetID returns the socket ID
func (s *Socket) GetID() string {
	return s.ID
}

// Subscribe subscribes the socket to a topic
func (s *Socket) Subscribe(topic string) {
	s.conn.Subscribe(topic)
}

// Unsubscribe unsubscribes the socket from a topic
func (s *Socket) Unsubscribe(topic string) {
	s.conn.Unsubscribe(topic)
}

// Close closes the socket connection
func (s *Socket) Close() {
	s.conn.conn.Close()
}
