package main

import (
	"encoding/json"
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
	MsgFile        = 10
	MsgTyping      = 11
)

// Message represents the unified message format
type Message struct {
	T     int         `json:"t"`               // Message type
	Topic string      `json:"topic,omitempty"` // Topic for broadcasts
	To    string      `json:"to,omitempty"`    // Recipient for private messages
	Data  interface{} `json:"data,omitempty"`  // Message data
	Code  int         `json:"code,omitempty"`  // Error/system code
	ID    string      `json:"id,omitempty"`    // Message ID for tracking
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
	case "file":
		return MsgFile
	case "typing":
		return MsgTyping
	default:
		return MsgSystem // Default to system message
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
	case MsgFile:
		return "file"
	case MsgTyping:
		return "typing"
	default:
		return "unknown"
	}
}

// SendMessage sends a unified Message directly
func (s *Socket) SendMessage(msg Message) {
	if s.isBanned {
		return
	}
	if jsonData, err := json.Marshal(msg); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// Send sends a message to the socket using the unified format with a string event
func (s *Socket) Send(event string, data interface{}) {
	if s.isBanned {
		return
	}

	// Convert string event to numeric type
	msgType := stringToMsgType(event)
	m := Message{
		T:    msgType,
		Data: data,
		ID:   s.ID,
	}

	if jsonData, err := json.Marshal(m); err == nil {
		s.conn.writeAsync(jsonData)
	}
}

// Emit emits a custom event to the socket
func (s *Socket) Emit(event string, data interface{}) {
	s.Send(event, data)
}
