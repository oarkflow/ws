package ws

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
	MsgDirect      = 12
	MsgThread      = 13
	MsgUserList    = 14
	MsgSetAlias    = 15
	// WebRTC signaling types
	MsgAuth              = 16
	MsgJoin              = 17
	MsgOffer             = 18
	MsgAnswer            = 19
	MsgIceCandidate      = 20
	MsgMute              = 21
	MsgUnmute            = 22
	MsgHold              = 23
	MsgDTMF              = 24
	MsgJoined            = 25
	MsgPeerJoined        = 26
	MsgPeerLeft          = 27
	MsgCallStateChanged  = 28
	MsgRecordingStarted  = 29
	MsgRecordingFinished = 30
)

// Message represents the unified message format
type Message struct {
	T        int         `json:"t"`                  // Message type
	Topic    string      `json:"topic,omitempty"`    // Topic for broadcasts
	To       string      `json:"to,omitempty"`       // Recipient for private messages
	Data     interface{} `json:"data,omitempty"`     // Message data
	Code     int         `json:"code,omitempty"`     // Error/system code
	ID       string      `json:"id,omitempty"`       // Message ID for tracking
	ThreadID string      `json:"threadId,omitempty"` // Thread ID for threaded conversations
	ReplyTo  string      `json:"replyTo,omitempty"`  // Message ID being replied to
	From     string      `json:"from,omitempty"`     // Sender alias/username
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
	case "direct":
		return MsgDirect
	case "thread":
		return MsgThread
	case "user_list":
		return MsgUserList
	case "set_alias":
		return MsgSetAlias
	case "auth":
		return MsgAuth
	case "join":
		return MsgJoin
	case "offer":
		return MsgOffer
	case "answer":
		return MsgAnswer
	case "ice-candidate":
		return MsgIceCandidate
	case "mute":
		return MsgMute
	case "unmute":
		return MsgUnmute
	case "hold":
		return MsgHold
	case "dtmf":
		return MsgDTMF
	case "joined":
		return MsgJoined
	case "peer-joined":
		return MsgPeerJoined
	case "peer-left":
		return MsgPeerLeft
	case "call-state-changed":
		return MsgCallStateChanged
	case "recording-started":
		return MsgRecordingStarted
	case "recording-finished":
		return MsgRecordingFinished
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
	case MsgDirect:
		return "direct"
	case MsgThread:
		return "thread"
	case MsgUserList:
		return "user_list"
	case MsgSetAlias:
		return "set_alias"
	case MsgAuth:
		return "auth"
	case MsgJoin:
		return "join"
	case MsgOffer:
		return "offer"
	case MsgAnswer:
		return "answer"
	case MsgIceCandidate:
		return "ice-candidate"
	case MsgMute:
		return "mute"
	case MsgUnmute:
		return "unmute"
	case MsgHold:
		return "hold"
	case MsgDTMF:
		return "dtmf"
	case MsgJoined:
		return "joined"
	case MsgPeerJoined:
		return "peer-joined"
	case MsgPeerLeft:
		return "peer-left"
	case MsgCallStateChanged:
		return "call-state-changed"
	case MsgRecordingStarted:
		return "recording-started"
	case MsgRecordingFinished:
		return "recording-finished"
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
