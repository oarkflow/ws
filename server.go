package ws

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

// CallManager interface for WebRTC call management
type CallManager interface {
	HandleSignalingMessage(socketID string, msg Message)
	HandleDisconnect(socketID string)
}

// Server wraps the Hub for backward compatibility
type Server struct {
	hub         *Hub
	callManager CallManager
}

// NewServer creates a new WebSocket server with Hub
func NewServer() *Server {
	storage := NewInMemoryMessageStorage(24 * time.Hour)
	return &Server{
		hub: NewHub(storage),
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
		binaryChan:    make(chan []byte, 256), // Buffered channel for binary data
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

	// Deliver any offline messages
	if err := s.hub.DeliverOfflineMessages(socket); err != nil {
		log.Printf("Error delivering offline messages to %s: %v", socket.ID, err)
	}

	// Handle connection in goroutine
	go s.handleConnection(socket)
}

func (s *Server) GetHub() *Hub {
	return s.hub
}

// SetCallManager sets the call manager for WebRTC signaling
func (s *Server) SetCallManager(cm CallManager) {
	s.callManager = cm
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
		case BinaryMessage:
			// Handle binary file data
			s.handleBinaryMessage(socket, payload)
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
		// Check if it's an array (legacy ultra-compact format)
		if arr, ok := jsonValue.([]interface{}); ok {
			var msg Message
			// [type, topic?, data?, id?, to?, code?]
			if len(arr) > 0 {
				switch t := arr[0].(type) {
				case float64:
					msg.T = int(t)
				case int:
					msg.T = t
				}
			}
			if len(arr) > 1 {
				if topic, ok := arr[1].(string); ok {
					msg.Topic = topic
				}
			}
			if len(arr) > 2 {
				msg.Data = arr[2]
			}
			if len(arr) > 3 {
				if id, ok := arr[3].(string); ok {
					msg.ID = id
				}
			}
			if len(arr) > 4 {
				if to, ok := arr[4].(string); ok {
					msg.To = to
				}
			}
			if len(arr) > 5 {
				switch code := arr[5].(type) {
				case float64:
					msg.Code = int(code)
				case int:
					msg.Code = code
				}
			}
			s.handleUnifiedMessage(socket, msg)
			return
		}

		// Check if it's an object (compact or legacy format)
		if obj, ok := jsonValue.(map[string]interface{}); ok {
			// Unified/compact format (has 't' field)
			if t, hasT := obj["t"]; hasT {
				var msg Message
				switch tv := t.(type) {
				case float64:
					msg.T = int(tv)
				case int:
					msg.T = tv
				}
				if topic, ok := obj["topic"].(string); ok {
					msg.Topic = topic
				}
				if data, exists := obj["data"]; exists {
					msg.Data = data
				}
				if id, ok := obj["id"].(string); ok {
					msg.ID = id
				}
				if to, ok := obj["to"].(string); ok {
					msg.To = to
				}
				if topic, ok := obj["topic"].(string); ok {
					msg.Topic = topic
				}
				if code, ok := obj["code"].(float64); ok {
					msg.Code = int(code)
				}
				// Handle file-specific fields
				if filename, ok := obj["filename"].(string); ok {
					if msg.Data == nil {
						msg.Data = make(map[string]interface{})
					}
					if dataMap, ok := msg.Data.(map[string]interface{}); ok {
						dataMap["filename"] = filename
					}
				}
				if size, ok := obj["size"].(float64); ok {
					if msg.Data == nil {
						msg.Data = make(map[string]interface{})
					}
					if dataMap, ok := msg.Data.(map[string]interface{}); ok {
						dataMap["size"] = int64(size)
					}
				}
				s.handleUnifiedMessage(socket, msg)
				return
			}

			// Legacy format (has 'event' field)
			if event, hasEvent := obj["event"]; hasEvent {
				if eventStr, ok := event.(string); ok {
					msg := Message{
						T: stringToMsgType(eventStr),
					}
					if topic, ok := obj["topic"].(string); ok {
						msg.Topic = topic
					}
					if data, exists := obj["data"]; exists {
						msg.Data = data
					}
					if id, ok := obj["id"].(string); ok {
						msg.ID = id
					}
					s.handleUnifiedMessage(socket, msg)
					return
				}
			}
		}
	}

	// Fallback to simple text protocol
	s.handleTextMessage(socket, message)
}

// handleUnifiedMessage handles unified Message format
func (s *Server) handleUnifiedMessage(socket *Socket, msg Message) {
	// Trigger event handler based on message type
	eventName := msgTypeToString(msg.T)
	s.hub.triggerHandlers(eventName, socket)

	switch msg.T {
	case MsgSubscribe:
		// Handle subscription
		socket.conn.Subscribe(msg.Topic)
		response := Message{
			T:    MsgAck,
			Data: map[string]string{"action": "subscribed", "topic": msg.Topic},
		}
		socket.SendMessage(response)

		// Broadcast updated topic list to all users
		allTopics := s.hub.GetAllTopics()
		topicListMsg := Message{
			T: MsgSystem,
			Data: map[string]interface{}{
				"type":   "topic_list_update",
				"topics": allTopics,
			},
		}
		s.hub.BroadcastMessage(topicListMsg)

	case MsgUnsubscribe:
		// Handle unsubscription
		socket.conn.Unsubscribe(msg.Topic)
		response := Message{
			T:    MsgAck,
			Data: map[string]string{"action": "unsubscribed", "topic": msg.Topic},
		}
		socket.SendMessage(response)

		// Broadcast updated topic list to all users
		allTopics := s.hub.GetAllTopics()
		topicListMsg := Message{
			T: MsgSystem,
			Data: map[string]interface{}{
				"type":   "topic_list_update",
				"topics": allTopics,
			},
		}
		s.hub.BroadcastMessage(topicListMsg)

	case MsgBroadcast:
		// Broadcast to all clients (excluding sender)
		broadcastMsg := Message{
			T:     MsgBroadcast,
			Topic: msg.Topic,
			Data:  msg.Data,
		}
		s.hub.BroadcastMessageExcept(broadcastMsg, socket)

	case MsgPing:
		// Respond to ping
		pongMsg := Message{
			T:    MsgPong,
			Data: map[string]int64{"timestamp": time.Now().Unix()},
		}
		socket.SendMessage(pongMsg)

	case MsgFile:
		// Set pending file metadata for next binary message
		socket.pendingFile = &msg

	case MsgTyping:
		// Broadcast typing status to all other clients
		typingMsg := Message{
			T: MsgTyping,
			Data: map[string]interface{}{
				"typing": msg.Data,
				"from":   socket.GetAlias(),
			},
		}
		s.hub.BroadcastMessageExcept(typingMsg, socket)

	case MsgDirect:
		// Send direct message to specific user
		if msg.To != "" {
			directMsg := Message{
				T:    MsgDirect,
				Data: msg.Data,
				From: socket.GetAlias(),
				ID:   generateMessageID(),
			}
			targetSocket := s.hub.GetSocket(msg.To)
			if targetSocket != nil {
				targetSocket.SendMessage(directMsg)
			}
		}

	case MsgThread:
		// Handle threaded message (reply)
		if msg.ThreadID != "" {
			threadMsg := Message{
				T:        MsgThread,
				Data:     msg.Data,
				From:     socket.GetAlias(),
				ID:       generateMessageID(),
				ThreadID: msg.ThreadID,
				ReplyTo:  msg.ReplyTo,
			}
			if msg.To != "" {
				// Threaded message to specific user
				s.hub.Emit(msg.To, "thread", threadMsg.Data)
			} else {
				// Broadcast threaded message
				s.hub.BroadcastMessageExcept(threadMsg, socket)
			}
		}

	case MsgUserList:
		// Send list of active users
		userList := s.hub.GetUserList()
		userListMsg := Message{
			T: MsgUserList,
			Data: map[string]interface{}{
				"users": userList,
			},
		}
		socket.SendMessage(userListMsg)

	case MsgSetAlias:
		// Set user alias
		if aliasData, ok := msg.Data.(map[string]interface{}); ok {
			if alias, ok := aliasData["alias"].(string); ok && alias != "" {
				socket.SetAlias(alias)
				// Broadcast alias change to all users
				aliasMsg := Message{
					T: MsgSystem,
					Data: map[string]interface{}{
						"message": fmt.Sprintf("%s is now known as %s", socket.ID[:12], alias),
						"type":    "alias_change",
						"userId":  socket.ID,
						"alias":   alias,
					},
				}
				s.hub.BroadcastMessage(aliasMsg)

				// Broadcast updated user list to all users
				userList := s.hub.GetUserList()
				userListMsg := Message{
					T: MsgUserList,
					Data: map[string]interface{}{
						"users": userList,
					},
				}
				s.hub.BroadcastMessage(userListMsg)
			}
		}

	case MsgAuth, MsgJoin, MsgOffer, MsgAnswer, MsgIceCandidate, MsgMute, MsgUnmute, MsgHold, MsgDTMF:
		// Handle WebRTC signaling messages
		if s.callManager != nil {
			s.callManager.HandleSignalingMessage(socket.ID, msg)
		} else {
			// Fallback to ack
			ackMsg := Message{
				T:    MsgAck,
				Data: map[string]string{"status": "received"},
			}
			socket.SendMessage(ackMsg)
		}

	default:
		// For unknown types, send ack
		ackMsg := Message{
			T:    MsgAck,
			Data: map[string]string{"status": "received"},
		}
		socket.SendMessage(ackMsg)
	}
}

// handleTextMessage handles simple text protocol
func (s *Server) handleTextMessage(socket *Socket, message string) {
	if strings.HasPrefix(message, "subscribe:") {
		topic := strings.TrimPrefix(message, "subscribe:")
		response := Message{
			T:    MsgAck,
			Data: map[string]string{"action": "subscribed", "topic": topic},
		}
		socket.SendMessage(response)
	} else if strings.HasPrefix(message, "unsubscribe:") {
		topic := strings.TrimPrefix(message, "unsubscribe:")
		response := Message{
			T:    MsgAck,
			Data: map[string]string{"action": "unsubscribed", "topic": topic},
		}
		socket.SendMessage(response)
	} else if strings.HasPrefix(message, "publish:") {
		parts := strings.SplitN(message, ":", 3)
		if len(parts) == 3 {
			topic := parts[1]
			data := parts[2]
			broadcastMsg := Message{
				T:     MsgBroadcast,
				Topic: topic,
				Data:  data,
			}
			s.hub.BroadcastMessageExcept(broadcastMsg, socket)
		}
	}
}

// handleBinaryMessage handles incoming binary data (files)
func (s *Server) handleBinaryMessage(socket *Socket, payload []byte) {
	if socket.pendingFile == nil {
		// No pending file metadata, ignore or log
		log.Printf("Received binary data without metadata from %s", socket.ID)
		return
	}

	// Create file message with metadata for broadcasting
	fileMsg := Message{
		T: MsgFile,
		Data: map[string]interface{}{
			"filename": "unknown",
			"size":     0,
			"from":     socket.GetAlias(),
		},
	}

	// Extract metadata from pending file if available
	if socket.pendingFile != nil && socket.pendingFile.Data != nil {
		if dataMap, ok := socket.pendingFile.Data.(map[string]interface{}); ok {
			if filename, exists := dataMap["filename"]; exists {
				fileMsg.Data.(map[string]interface{})["filename"] = filename
			}
			if size, exists := dataMap["size"]; exists {
				fileMsg.Data.(map[string]interface{})["size"] = size
			}
		}
	}

	// Use the pending metadata to route the file
	if socket.pendingFile.To != "" {
		// Send to specific socket
		s.hub.Emit(socket.pendingFile.To, "file", fileMsg.Data)
		s.hub.EmitBinary(socket.pendingFile.To, payload)
		log.Printf("Sent binary file to %s from %s", socket.pendingFile.To, socket.ID)
	} else if socket.pendingFile.Topic != "" {
		// Send to topic subscribers (excluding sender since they already know they sent it)
		fileMsg.Topic = socket.pendingFile.Topic
		s.hub.BroadcastMessageExcept(fileMsg, socket) // This will filter by topic subscriptions
		s.hub.BroadcastBinaryToAll(payload)           // For now, broadcast binary to all - could be optimized
		log.Printf("Broadcasted binary file to topic %s from %s", socket.pendingFile.Topic, socket.ID)
	} else {
		// Broadcast to all clients except sender (since they already know they sent it)
		s.hub.BroadcastMessageExcept(fileMsg, socket)
		s.hub.BroadcastBinaryToAll(payload)
		log.Printf("Broadcasted binary file from %s", socket.ID)
	}

	// Clear pending file
	socket.pendingFile = nil
}
