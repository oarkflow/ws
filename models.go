package ws

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// Call represents a WebRTC call
type Call struct {
	ID        uuid.UUID  `json:"id" db:"id"`
	RoomID    string     `json:"room_id" db:"room_id"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	StartedAt *time.Time `json:"started_at" db:"started_at"`
	EndedAt   *time.Time `json:"ended_at" db:"ended_at"`
	Status    string     `json:"status" db:"status"` // active, ended
	Recording bool       `json:"recording" db:"recording"`
	Metadata  string     `json:"metadata" db:"metadata"` // JSON
}

// Participant represents a participant in a call
type Participant struct {
	ID       uuid.UUID  `json:"id" db:"id"`
	CallID   uuid.UUID  `json:"call_id" db:"call_id"`
	UserID   string     `json:"user_id" db:"user_id"`
	Role     string     `json:"role" db:"role"` // host, moderator, participant
	JoinedAt time.Time  `json:"joined_at" db:"joined_at"`
	LeftAt   *time.Time `json:"left_at" db:"left_at"`
	ClientIP string     `json:"client_ip" db:"client_ip"`
	Metadata string     `json:"metadata" db:"metadata"` // JSON
}

// SignalingMessage represents a WebRTC signaling message
type SignalingMessage struct {
	Type    string      `json:"type"`
	ID      string      `json:"id"`
	Payload interface{} `json:"payload"`
}

// AuthPayload for auth messages
type AuthPayload struct {
	Token string `json:"token"`
}

// JoinPayload for join messages
type JoinPayload struct {
	Room         string                 `json:"room"`
	DisplayName  string                 `json:"display_name"`
	Capabilities map[string]interface{} `json:"capabilities"`
}

// SDPPayload for offer/answer messages
type SDPPayload struct {
	SDP    string    `json:"sdp"`
	CallID uuid.UUID `json:"call_id"`
}

// ICEPayload for ice-candidate messages
type ICEPayload struct {
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdpMid"`
	SDPMLineIndex int    `json:"sdpMLineIndex"`
}

// ControlPayload for mute/unmute/hold messages
type ControlPayload struct {
	CallID uuid.UUID `json:"call_id"`
	Track  string    `json:"track,omitempty"`
}

// DTMFPayload for dtmf messages
type DTMFPayload struct {
	CallID uuid.UUID `json:"call_id"`
	Tones  string    `json:"tones"`
}

// RoomState represents the current state of a room
type RoomState struct {
	RoomID       string            `json:"room_id"`
	Participants []ParticipantInfo `json:"participants"`
	CallID       uuid.UUID         `json:"call_id"`
	Status       string            `json:"status"`
}

// ParticipantInfo for room state
type ParticipantInfo struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
}

// Database interface
type Database interface {
	CreateCall(roomID string) (*Call, error)
	GetCall(callID uuid.UUID) (*Call, error)
	EndCall(callID uuid.UUID) error
	AddParticipant(callID uuid.UUID, userID, role, clientIP string, metadata map[string]interface{}) (*Participant, error)
	UpdateParticipantLeft(participantID uuid.UUID) error
	GetParticipants(callID uuid.UUID) ([]Participant, error)
	GetActiveCalls() ([]Call, error)
	Close() error
}

// PostgresDatabase implements Database
type PostgresDatabase struct {
	db *sql.DB
}

// NewPostgresDatabase creates a new PostgreSQL database connection
func NewPostgresDatabase(connStr string) (*PostgresDatabase, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &PostgresDatabase{db: db}, nil
}

// CreateCall creates a new call
func (p *PostgresDatabase) CreateCall(roomID string) (*Call, error) {
	callID := uuid.New()
	now := time.Now()

	query := `
		INSERT INTO calls (id, room_id, created_at, status)
		VALUES ($1, $2, $3, 'active')
		RETURNING id, room_id, created_at, started_at, ended_at, status, recording, metadata
	`

	var call Call
	err := p.db.QueryRow(query, callID, roomID, now).Scan(
		&call.ID, &call.RoomID, &call.CreatedAt, &call.StartedAt, &call.EndedAt, &call.Status, &call.Recording, &call.Metadata,
	)
	if err != nil {
		return nil, err
	}

	return &call, nil
}

// GetCall retrieves a call by ID
func (p *PostgresDatabase) GetCall(callID uuid.UUID) (*Call, error) {
	query := `
		SELECT id, room_id, created_at, started_at, ended_at, status, recording, metadata
		FROM calls WHERE id = $1
	`

	var call Call
	err := p.db.QueryRow(query, callID).Scan(
		&call.ID, &call.RoomID, &call.CreatedAt, &call.StartedAt, &call.EndedAt, &call.Status, &call.Recording, &call.Metadata,
	)
	if err != nil {
		return nil, err
	}

	return &call, nil
}

// EndCall marks a call as ended
func (p *PostgresDatabase) EndCall(callID uuid.UUID) error {
	now := time.Now()
	query := `UPDATE calls SET ended_at = $1, status = 'ended' WHERE id = $2`
	_, err := p.db.Exec(query, now, callID)
	return err
}

// AddParticipant adds a participant to a call
func (p *PostgresDatabase) AddParticipant(callID uuid.UUID, userID, role, clientIP string, metadata map[string]interface{}) (*Participant, error) {
	participantID := uuid.New()
	now := time.Now()

	metadataJSON := "{}"
	if metadata != nil {
		// Simple JSON encoding, in real app use proper JSON marshaling
		metadataJSON = `{"test": "data"}` // Placeholder
	}

	query := `
		INSERT INTO participants (id, call_id, user_id, role, joined_at, client_ip, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, call_id, user_id, role, joined_at, left_at, client_ip, metadata
	`

	var participant Participant
	err := p.db.QueryRow(query, participantID, callID, userID, role, now, clientIP, metadataJSON).Scan(
		&participant.ID, &participant.CallID, &participant.UserID, &participant.Role,
		&participant.JoinedAt, &participant.LeftAt, &participant.ClientIP, &participant.Metadata,
	)
	if err != nil {
		return nil, err
	}

	return &participant, nil
}

// UpdateParticipantLeft marks a participant as left
func (p *PostgresDatabase) UpdateParticipantLeft(participantID uuid.UUID) error {
	now := time.Now()
	query := `UPDATE participants SET left_at = $1 WHERE id = $2`
	_, err := p.db.Exec(query, now, participantID)
	return err
}

// GetParticipants retrieves all participants for a call
func (p *PostgresDatabase) GetParticipants(callID uuid.UUID) ([]Participant, error) {
	query := `
		SELECT id, call_id, user_id, role, joined_at, left_at, client_ip, metadata
		FROM participants WHERE call_id = $1 ORDER BY joined_at
	`

	rows, err := p.db.Query(query, callID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var participants []Participant
	for rows.Next() {
		var p Participant
		err := rows.Scan(&p.ID, &p.CallID, &p.UserID, &p.Role, &p.JoinedAt, &p.LeftAt, &p.ClientIP, &p.Metadata)
		if err != nil {
			return nil, err
		}
		participants = append(participants, p)
	}

	return participants, nil
}

// GetActiveCalls retrieves all active calls
func (p *PostgresDatabase) GetActiveCalls() ([]Call, error) {
	query := `
		SELECT id, room_id, created_at, started_at, ended_at, status, recording, metadata
		FROM calls WHERE status = 'active' ORDER BY created_at DESC
	`

	rows, err := p.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var calls []Call
	for rows.Next() {
		var c Call
		err := rows.Scan(&c.ID, &c.RoomID, &c.CreatedAt, &c.StartedAt, &c.EndedAt, &c.Status, &c.Recording, &c.Metadata)
		if err != nil {
			return nil, err
		}
		calls = append(calls, c)
	}

	return calls, nil
}

// Close closes the database connection
func (p *PostgresDatabase) Close() error {
	return p.db.Close()
}
