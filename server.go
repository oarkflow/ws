package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

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

	// Try to parse as JSON first (this handles both arrays and objects)
	var jsonValue interface{}
	if err := json.Unmarshal(payload, &jsonValue); err == nil {
		// Check if it's an array (ultra-compact format)
		if arr, ok := jsonValue.([]interface{}); ok {
			ultraCompactMsg := UltraCompactMessage(arr)
			s.handleUltraCompactMessage(socket, ultraCompactMsg)
			return
		}

		// Check if it's an object (compact or legacy format)
		if obj, ok := jsonValue.(map[string]interface{}); ok {
			// Check for compact format (has 't' field)
			if t, hasT := obj["t"]; hasT {
				if tInt, ok := t.(float64); ok {
					compactMsg := CompactMessage{
						T: int(tInt),
					}
					if topic, ok := obj["topic"].(string); ok {
						compactMsg.Topic = topic
					}
					if data, exists := obj["data"]; exists {
						compactMsg.Data = data
					}
					if id, ok := obj["id"].(string); ok {
						compactMsg.ID = id
					}
					if to, ok := obj["to"].(string); ok {
						compactMsg.To = to
					}
					if code, ok := obj["code"].(float64); ok {
						compactMsg.Code = int(code)
					}
					s.handleCompactMessage(socket, compactMsg)
					return
				}
			}

			// Check for legacy format (has 'event' field)
			if event, hasEvent := obj["event"]; hasEvent {
				if eventStr, ok := event.(string); ok {
					legacyMsg := Message{
						Event: eventStr,
					}
					if topic, ok := obj["topic"].(string); ok {
						legacyMsg.Topic = topic
					}
					if data, exists := obj["data"]; exists {
						legacyMsg.Data = data
					}
					if id, ok := obj["id"].(string); ok {
						legacyMsg.ID = id
					}
					s.handleLegacyMessage(socket, legacyMsg)
					return
				}
			}
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

// handleUltraCompactMessage handles ultra-compact array messages
func (s *Server) handleUltraCompactMessage(socket *Socket, msg UltraCompactMessage) {
	msgType := msg.Type()

	// Trigger event handler based on message type
	eventName := ucMsgTypeToString(msgType)
	s.hub.triggerHandlers(eventName, socket)

	switch msgType {
	case UCMsgSubscribe:
		topic := msg.Topic()
		response := NewUCMsg(UCMsgAck, topic, map[string]string{"action": "subscribed"})
		socket.SendUltraCompact(response)

	case UCMsgUnsubscribe:
		topic := msg.Topic()
		response := NewUCMsg(UCMsgAck, topic, map[string]string{"action": "unsubscribed"})
		socket.SendUltraCompact(response)

	case UCMsgBroadcast:
		topic := msg.Topic()
		data := msg.Data()
		broadcastMsg := NewUCMsg(UCMsgBroadcast, topic, data)
		s.hub.BroadcastUltraCompactExcept(broadcastMsg, socket)

	case UCMsgPing:
		data := msg.Data()
		pongMsg := NewUCMsg(UCMsgPong, nil, map[string]int64{"timestamp": time.Now().Unix()})
		if data != nil {
			pongMsg = NewUCMsg(UCMsgPong, nil, data)
		}
		socket.SendUltraCompact(pongMsg)

	default:
		// For unknown types, send ack
		ackMsg := NewUCMsg(UCMsgAck, nil, map[string]string{"status": "received"})
		socket.SendUltraCompact(ackMsg)
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
