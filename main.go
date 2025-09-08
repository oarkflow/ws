package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// WebSocket opcodes
const (
	TextMessage   = 1
	BinaryMessage = 2
	CloseMessage  = 8
	PingMessage   = 9
	PongMessage   = 10
)

// Message types (compact protocol)
const (
	MsgBroadcast   = 1
	MsgPrivate     = 2
	MsgSystem      = 3
	MsgSubscribe   = 4
	MsgUnsubscribe = 5
	MsgPing        = 6
	MsgPong        = 7
	MsgError       = 8
	MsgAck         = 9
)

// CompactMessage represents an efficient message format
type CompactMessage struct {
	T     int         `json:"t"`               // Message type
	Topic string      `json:"topic,omitempty"` // Topic for broadcasts
	To    string      `json:"to,omitempty"`    // Recipient for private messages
	Data  interface{} `json:"data,omitempty"`  // Message data
	Code  int         `json:"code,omitempty"`  // Error/system code
	ID    string      `json:"id,omitempty"`    // Message ID for tracking
}

// Legacy Message struct for backward compatibility
type Message struct {
	Event string      `json:"event"`
	Topic string      `json:"topic,omitempty"`
	Data  interface{} `json:"data"`
	ID    string      `json:"id,omitempty"`
}

// Socket wraps a WebSocket connection with additional functionality
type Socket struct {
	ID         string
	conn       *Connection
	hub        *Hub
	properties map[string]interface{}
	isBanned   bool
	mu         sync.RWMutex
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

// Socket methods

// Send sends a message to the socket using compact format
func (s *Socket) Send(event string, data interface{}) {
	if s.isBanned {
		return
	}

	// Convert string event to numeric type
	msgType := stringToMsgType(event)
	compactMsg := CompactMessage{
		T:    msgType,
		Data: data,
		ID:   s.ID,
	}

	if jsonData, err := json.Marshal(compactMsg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// SendCompact sends a compact message directly
func (s *Socket) SendCompact(msg CompactMessage) {
	if s.isBanned {
		return
	}

	if jsonData, err := json.Marshal(msg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// stringToMsgType converts string event names to numeric types
func stringToMsgType(event string) int {
	switch event {
	case "broadcast":
		return MsgBroadcast
	case "private":
		return MsgPrivate
	case "system":
		return MsgSystem
	case "subscribed":
		return MsgAck
	case "unsubscribed":
		return MsgAck
	case "ping":
		return MsgPing
	case "pong":
		return MsgPong
	case "error":
		return MsgError
	default:
		return MsgSystem // Default to system message
	}
}

// Emit emits a custom event to the socket
func (s *Socket) Emit(event string, data interface{}) {
	s.Send(event, data)
}

// Close closes the socket connection
func (s *Socket) Close() {
	s.conn.conn.Close()
}

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

	// Create compact message
	msgType := stringToMsgType(event)
	compactMsg := CompactMessage{
		T:    msgType,
		Data: data,
	}

	if jsonData, err := json.Marshal(compactMsg); err == nil {
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

// BroadcastCompact sends a pre-built compact message
func (h *Hub) BroadcastCompact(msg CompactMessage) {
	h.BroadcastCompactExcept(msg, nil)
}

// BroadcastCompactExcept sends a compact message excluding the sender
func (h *Hub) BroadcastCompactExcept(msg CompactMessage, excludeSocket *Socket) {
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
			log.Printf("Broadcasting compact type %d to %d clients (excluding sender)", msg.T, sentCount)
		} else {
			log.Printf("Broadcasting compact type %d to %d clients", msg.T, sentCount)
		}
	}
}

// Notify sends a message to specific sockets
func (h *Hub) Notify(socketIDs []string, event string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	message := Message{
		Event: event,
		Data:  data,
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

// Connection represents a WebSocket connection
type Connection struct {
	conn          net.Conn
	reader        *bufio.Reader
	writer        *bufio.Writer
	subscriptions map[string]bool
	mu            sync.Mutex
	writeChan     chan []byte
	closeChan     chan bool
}

// Server wraps the Hub for backward compatibility
type Server struct {
	hub *Hub
}

// NewServer creates a new WebSocket server with Hub
func NewServer() *Server {
	return &Server{
		hub: NewHub(),
	}
}

// HandleWebSocket handles the WebSocket upgrade and connection
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		http.Error(w, "Method not allowed", 405)
		return
	}

	// Check authentication (header or query)
	token := r.Header.Get("Authorization")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token != "mysecrettoken" && token != "Bearer mysecrettoken" {
		http.Error(w, "Unauthorized", 401)
		return
	}

	// Check for WebSocket headers
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") ||
		!strings.EqualFold(r.Header.Get("Connection"), "Upgrade") {
		http.Error(w, "Bad request", 400)
		return
	}

	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "Missing Sec-WebSocket-Key", 400)
		return
	}

	// Compute accept key
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	accept := base64.StdEncoding.EncodeToString(h.Sum(nil))

	// Hijack the connection
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "WebSocket upgrade failed", 500)
		return
	}

	conn, _, err := hj.Hijack()
	if err != nil {
		log.Println("Hijack error:", err)
		return
	}

	// Send upgrade response
	response := fmt.Sprintf("HTTP/1.1 101 Switching Protocols\r\n"+
		"Upgrade: websocket\r\n"+
		"Connection: Upgrade\r\n"+
		"Sec-WebSocket-Accept: %s\r\n\r\n", accept)
	conn.Write([]byte(response))

	// Create connection
	wsConn := &Connection{
		conn:          conn,
		reader:        bufio.NewReader(conn),
		writer:        bufio.NewWriter(conn),
		subscriptions: make(map[string]bool),
		writeChan:     make(chan []byte, 256), // Buffered channel for high throughput
		closeChan:     make(chan bool),
	}

	// Create socket and add to hub
	socket := s.hub.NewSocket(wsConn)
	if socket == nil {
		return // Connection limit reached
	}

	// Start writer goroutine for async writes
	go wsConn.writerLoop()

	// Trigger connect event
	s.hub.triggerHandlers("connect", socket)

	// Handle connection in goroutine
	go s.handleConnection(socket)
}

// GetHub returns the underlying hub for advanced operations
func (s *Server) GetHub() *Hub {
	return s.hub
}

// Convenience methods for easy access to Hub functionality

// On registers a global event handler
func (s *Server) On(event string, handler Handler) {
	s.hub.On(event, handler)
}

// OnConnect registers a handler for new connections
func (s *Server) OnConnect(handler Handler) {
	s.hub.OnConnect(handler)
}

// OnMessage registers a handler for messages
func (s *Server) OnMessage(handler Handler) {
	s.hub.OnMessage(handler)
}

// OnClose registers a handler for connection closes
func (s *Server) OnClose(handler Handler) {
	s.hub.OnClose(handler)
}

// OnDisconnect registers a handler for disconnections
func (s *Server) OnDisconnect(handler Handler) {
	s.hub.OnDisconnect(handler)
}

// Broadcast sends a message to all connected sockets
func (s *Server) Broadcast(event string, data interface{}) {
	s.hub.Broadcast(event, data)
}

// BroadcastExcept sends a message to all connected sockets except the sender
func (s *Server) BroadcastExcept(event string, data interface{}, excludeSocket *Socket) {
	s.hub.BroadcastExcept(event, data, excludeSocket)
}

// Notify sends a message to specific sockets
func (s *Server) Notify(socketIDs []string, event string, data interface{}) {
	s.hub.Notify(socketIDs, event, data)
}

// Emit sends a message to a single socket
func (s *Server) Emit(socketID string, event string, data interface{}) {
	s.hub.Emit(socketID, event, data)
}

// GetSocket gets a socket by ID
func (s *Server) GetSocket(socketID string) *Socket {
	return s.hub.GetSocket(socketID)
}

// GetAllSockets returns all connected sockets
func (s *Server) GetAllSockets() []*Socket {
	return s.hub.GetAllSockets()
}

// GetSocketsByProperty returns sockets that have a specific property value
func (s *Server) GetSocketsByProperty(key string, value interface{}) []*Socket {
	return s.hub.GetSocketsByProperty(key, value)
}

// BanSocket bans a socket
func (s *Server) BanSocket(socketID string) {
	s.hub.BanSocket(socketID)
}

// UnbanSocket unbans a socket
func (s *Server) UnbanSocket(socketID string) {
	s.hub.UnbanSocket(socketID)
}

// CloseSocket closes a socket connection
func (s *Server) CloseSocket(socketID string) {
	s.hub.CloseSocket(socketID)
}

// GetConnectionCount returns the current connection count
func (s *Server) GetConnectionCount() int64 {
	return s.hub.GetConnectionCount()
}

// handleConnection handles a WebSocket connection
func (s *Server) handleConnection(socket *Socket) {
	defer func() {
		socket.conn.conn.Close()
		// Signal writer to stop
		close(socket.conn.closeChan)
		// Send empty message to unblock writer
		select {
		case socket.conn.writeChan <- []byte{}:
		default:
		}
		s.hub.RemoveSocket(socket.ID)
		s.hub.triggerHandlers("close", socket)
	}()

	for {
		opcode, payload, err := socket.conn.readFrame()
		if err != nil {
			log.Println("Read frame error:", err)
			return
		}

		switch opcode {
		case TextMessage:
			// Handle custom events
			s.handleMessage(socket, payload)
		case CloseMessage:
			return
		case PingMessage:
			socket.conn.writeMessage(PongMessage, payload)
		}
	}
}

// handleMessage handles incoming messages
func (s *Server) handleMessage(socket *Socket, payload []byte) {
	message := string(payload)

	// Trigger message event
	s.hub.triggerHandlers("message", socket)

	// Try to parse as compact JSON first
	if strings.HasPrefix(message, "{") {
		var compactMsg CompactMessage
		if err := json.Unmarshal(payload, &compactMsg); err == nil {
			s.handleCompactMessage(socket, compactMsg)
			return
		}

		// Fallback to legacy Message format
		var legacyMsg Message
		if err := json.Unmarshal(payload, &legacyMsg); err == nil {
			s.handleLegacyMessage(socket, legacyMsg)
			return
		}
	}

	// Fallback to simple text protocol
	s.handleTextMessage(socket, message)
}

// handleCompactMessage handles compact protocol messages
func (s *Server) handleCompactMessage(socket *Socket, msg CompactMessage) {
	// Trigger event handler based on message type
	eventName := msgTypeToString(msg.T)
	s.hub.triggerHandlers(eventName, socket)

	switch msg.T {
	case MsgSubscribe:
		// Handle subscription
		response := CompactMessage{
			T:    MsgAck,
			Data: map[string]string{"action": "subscribed", "topic": msg.Topic},
		}
		socket.SendCompact(response)

	case MsgUnsubscribe:
		// Handle unsubscription
		response := CompactMessage{
			T:    MsgAck,
			Data: map[string]string{"action": "unsubscribed", "topic": msg.Topic},
		}
		socket.SendCompact(response)

	case MsgBroadcast:
		// Broadcast to all clients (excluding sender)
		broadcastMsg := CompactMessage{
			T:     MsgBroadcast,
			Topic: msg.Topic,
			Data:  msg.Data,
		}
		s.hub.BroadcastCompactExcept(broadcastMsg, socket)

	case MsgPing:
		// Respond to ping
		pongMsg := CompactMessage{
			T:    MsgPong,
			Data: map[string]int64{"timestamp": time.Now().Unix()},
		}
		socket.SendCompact(pongMsg)

	default:
		// For unknown types, send ack
		ackMsg := CompactMessage{
			T:    MsgAck,
			Data: map[string]string{"status": "received"},
		}
		socket.SendCompact(ackMsg)
	}
}

// handleLegacyMessage handles legacy Message format
func (s *Server) handleLegacyMessage(socket *Socket, msg Message) {
	// Convert legacy to compact and handle
	compactMsg := CompactMessage{
		T:     stringToMsgType(msg.Event),
		Topic: msg.Topic,
		Data:  msg.Data,
		ID:    msg.ID,
	}
	s.handleCompactMessage(socket, compactMsg)
}

// handleTextMessage handles simple text protocol
func (s *Server) handleTextMessage(socket *Socket, message string) {
	if strings.HasPrefix(message, "subscribe:") {
		topic := strings.TrimPrefix(message, "subscribe:")
		response := CompactMessage{
			T:    MsgAck,
			Data: map[string]string{"action": "subscribed", "topic": topic},
		}
		socket.SendCompact(response)
	} else if strings.HasPrefix(message, "unsubscribe:") {
		topic := strings.TrimPrefix(message, "unsubscribe:")
		response := CompactMessage{
			T:    MsgAck,
			Data: map[string]string{"action": "unsubscribed", "topic": topic},
		}
		socket.SendCompact(response)
	} else if strings.HasPrefix(message, "publish:") {
		parts := strings.SplitN(message, ":", 3)
		if len(parts) == 3 {
			topic := parts[1]
			data := parts[2]
			broadcastMsg := CompactMessage{
				T:     MsgBroadcast,
				Topic: topic,
				Data:  data,
			}
			s.hub.BroadcastCompactExcept(broadcastMsg, socket)
		}
	}
}

// msgTypeToString converts numeric message type to string
func msgTypeToString(msgType int) string {
	switch msgType {
	case MsgBroadcast:
		return "broadcast"
	case MsgPrivate:
		return "private"
	case MsgSystem:
		return "system"
	case MsgSubscribe:
		return "subscribe"
	case MsgUnsubscribe:
		return "unsubscribe"
	case MsgPing:
		return "ping"
	case MsgPong:
		return "pong"
	case MsgError:
		return "error"
	case MsgAck:
		return "ack"
	default:
		return "unknown"
	}
}

// readFrame reads a WebSocket frame
func (c *Connection) readFrame() (opcode byte, payload []byte, err error) {
	// Read first byte
	b, err := c.reader.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	opcode = b & 0x0F

	// Read second byte
	b, err = c.reader.ReadByte()
	if err != nil {
		return 0, nil, err
	}
	masked := (b & 0x80) != 0
	payloadLen := int(b & 0x7F)

	if payloadLen == 126 {
		// Read extended payload length (16 bits)
		lenBytes := make([]byte, 2)
		_, err = io.ReadFull(c.reader, lenBytes)
		if err != nil {
			return 0, nil, err
		}
		payloadLen = int(lenBytes[0])<<8 | int(lenBytes[1])
	} else if payloadLen == 127 {
		// Read extended payload length (64 bits)
		lenBytes := make([]byte, 8)
		_, err = io.ReadFull(c.reader, lenBytes)
		if err != nil {
			return 0, nil, err
		}
		payloadLen = int(lenBytes[0])<<56 | int(lenBytes[1])<<48 | int(lenBytes[2])<<40 | int(lenBytes[3])<<32 |
			int(lenBytes[4])<<24 | int(lenBytes[5])<<16 | int(lenBytes[6])<<8 | int(lenBytes[7])
	}

	// Read masking key if masked
	var maskKey []byte
	if masked {
		maskKey = make([]byte, 4)
		_, err = io.ReadFull(c.reader, maskKey)
		if err != nil {
			return 0, nil, err
		}
	}

	// Read payload
	payload = make([]byte, payloadLen)
	_, err = io.ReadFull(c.reader, payload)
	if err != nil {
		return 0, nil, err
	}

	// Unmask payload if masked
	if masked {
		for i := 0; i < payloadLen; i++ {
			payload[i] ^= maskKey[i%4]
		}
	}

	return opcode, payload, nil
}

// writeMessage writes a WebSocket message
func (c *Connection) writeMessage(opcode byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	payloadLen := len(payload)
	var frame []byte

	// First byte: FIN + opcode
	frame = append(frame, 0x80|opcode)

	// Second byte: payload length
	if payloadLen <= 125 {
		frame = append(frame, byte(payloadLen))
	} else if payloadLen <= 65535 {
		frame = append(frame, 126)
		frame = append(frame, byte(payloadLen>>8), byte(payloadLen&0xFF))
	} else {
		frame = append(frame, 127)
		for i := 7; i >= 0; i-- {
			frame = append(frame, byte(payloadLen>>(i*8)))
		}
	}

	// Payload
	frame = append(frame, payload...)

	_, err := c.writer.Write(frame)
	if err != nil {
		return err
	}
	return c.writer.Flush()
}

// writerLoop handles async message writing
func (c *Connection) writerLoop() {
	for {
		select {
		case data := <-c.writeChan:
			if len(data) == 0 {
				return // Empty message signals close
			}
			c.writeMessage(TextMessage, data)
		case <-c.closeChan:
			return
		}
	}
}

// writeAsync writes a message asynchronously
func (c *Connection) writeAsync(data []byte) {
	select {
	case c.writeChan <- data:
	default:
		// Channel full, drop message to prevent blocking
	}
}

func main() {
	server := NewServer()
	hub := server.GetHub()

	// Set up event handlers
	hub.OnConnect(func(socket *Socket) {
		log.Printf("Client connected: %s", socket.ID)
		welcomeMsg := CompactMessage{
			T: MsgSystem,
			Data: map[string]interface{}{
				"message": "Connected to WebSocket server",
				"id":      socket.ID,
				"type":    "welcome",
			},
		}
		socket.SendCompact(welcomeMsg)
	})

	hub.OnMessage(func(socket *Socket) {
		log.Printf("Message from %s", socket.ID)
	})

	hub.OnClose(func(socket *Socket) {
		log.Printf("Client disconnected: %s", socket.ID)
	})

	hub.OnDisconnect(func(socket *Socket) {
		log.Printf("Client disconnect event: %s", socket.ID)
	})

	// Custom event handler example
	hub.On("ping", func(socket *Socket) {
		pongMsg := CompactMessage{
			T:    MsgPong,
			Data: map[string]int64{"timestamp": time.Now().Unix()},
		}
		socket.SendCompact(pongMsg)
	})

	// Admin functionality example - broadcast every 30 seconds
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			heartbeatMsg := CompactMessage{
				T: MsgSystem,
				Data: map[string]interface{}{
					"timestamp":   time.Now().Unix(),
					"connections": server.GetConnectionCount(),
					"type":        "heartbeat",
				},
			}
			server.hub.BroadcastCompact(heartbeatMsg)
		}
	}()

	// Add a simple broadcast test endpoint
	http.HandleFunc("/broadcast", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			message := r.URL.Query().Get("message")
			if message == "" {
				message = "Test broadcast from HTTP endpoint"
			}
			broadcastMsg := CompactMessage{
				T: MsgSystem,
				Data: map[string]interface{}{
					"message":   message,
					"timestamp": time.Now().Unix(),
					"source":    "http_endpoint",
					"type":      "announcement",
				},
			}
			hub.BroadcastCompact(broadcastMsg)
			w.WriteHeader(200)
			w.Write([]byte("Broadcast sent"))
		} else {
			w.WriteHeader(405)
			w.Write([]byte("Method not allowed"))
		}
	})

	http.HandleFunc("/ws", server.HandleWebSocket)
	http.Handle("/", http.FileServer(http.Dir("./views")))

	log.Println("Secure WebSocket server with Hub starting on :8080")
	log.Fatal(http.ListenAndServeTLS(":8080", "cert.pem", "key.pem", nil))
}
