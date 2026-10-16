// Package main: HMAC token auth (dev-grade) + bcrypt password verification.
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func jwtSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("dev-only-secret-change-me")
}

// Claims carried in the token. Org isolation enforced per request.
type Claims struct {
	UserID string
	OrgID  string
	Role   string
	Exp    int64
}

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(h), err
}

func checkPassword(hash, pw string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

func issueToken(c Claims) string {
	c.Exp = time.Now().Add(8 * time.Hour).Unix()
	payload := fmt.Sprintf("%s|%s|%s|%d", c.UserID, c.OrgID, c.Role, c.Exp)
	mac := hmac.New(sha256.New, jwtSecret())
	mac.Write([]byte(payload))
	sig := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." +
		base64.RawURLEncoding.EncodeToString(sig)
}

func parseToken(tok string) (Claims, error) {
	parts := strings.Split(tok, ".")
	if len(parts) != 2 {
		return Claims{}, errors.New("bad token format")
	}
	rawPayload, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	rawSig, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	if err1 != nil || err2 != nil {
		return Claims{}, errors.New("bad token encoding")
	}
	mac := hmac.New(sha256.New, jwtSecret())
	mac.Write(rawPayload)
	if subtle.ConstantTimeCompare(mac.Sum(nil), rawSig) != 1 {
		return Claims{}, errors.New("bad token signature")
	}
	fields := strings.Split(string(rawPayload), "|")
	if len(fields) != 4 {
		return Claims{}, errors.New("bad token payload")
	}
	var exp int64
	if _, err := fmt.Sscanf(fields[3], "%d", &exp); err != nil {
		return Claims{}, errors.New("bad token expiry")
	}
	if time.Now().Unix() > exp {
		return Claims{}, errors.New("token expired")
	}
	return Claims{UserID: fields[0], OrgID: fields[1], Role: fields[2], Exp: exp}, nil
}

// canWrite gates ingestion/mutation endpoints. Read endpoints allow viewer+.
func canWrite(role string) bool { return role == "admin" || role == "analyst" }
func canApprove(role string) bool { return role == "admin" || role == "responder" }
